# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Tests for studio recording sessions over HTTP.

Scope: Session lifecycle (create, list, read, delete); saving, replacing and deleting takes with the
take quality rules; rejected audio and the per-session take limit; importing a long recording split
at its pauses; the microphone check (no speech, a bright or thin microphone, the suggested tone
correction and its preview); the tone metrics leaving out sibilants; the tone correction itself; and the
splitter's joining of short pieces.
Does NOT belong: Building voices and finishing sessions (test_studio_voices.py).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from conftest import SAMPLE_RATE, speech_like, wav_bytes
from ltts.audio import apply_tone, read_audio, split_at_pauses
from ltts.config import Settings
from ltts.container import Services
from ltts.voices.quality import CHECK_RULES, analyze


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        env="test",
        data_dir=tmp_path / "data",
        models_dir=tmp_path / "models",
        warm_up_engines=False,
        extra_allowed_hosts=["testserver"],
        max_session_takes=4,
    )


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(seconds * SAMPLE_RATE), dtype=np.float32)


def voiced(seconds: float) -> np.ndarray:
    """The syllable envelope speech_like uses, so added tones only sound while "speaking"."""
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return (np.sin(2 * np.pi * 3.0 * t) > -0.6).astype(np.float32)


def tone(hz: float, seconds: float, level: float) -> np.ndarray:
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return (level * np.sin(2 * np.pi * hz * t) * voiced(seconds)).astype(np.float32)


def natural(seconds: float = 8.0) -> np.ndarray:
    """Speech-like audio with a natural balance: some presence (2-4 kHz) and a little air (4-8 kHz)."""
    return speech_like(seconds) + tone(2_500, seconds, 0.05) + tone(5_000, seconds, 0.01)


def bright(seconds: float = 8.0) -> np.ndarray:
    """Speech with strong 6 kHz content in its vowels, like a harsh microphone."""
    return natural(seconds) + tone(6_000, seconds, 0.08)


def thin(seconds: float = 8.0) -> np.ndarray:
    """Speech with almost no low end, like a laptop microphone."""
    return tone(1_200, seconds, 0.2) + tone(2_500, seconds, 0.2) + tone(180, seconds, 0.02)


def error(response: Any) -> str:
    code: str = response.json()["error"]["code"]
    return code


def test_session_and_take_lifecycle(client: TestClient, services: Services) -> None:
    session = client.post("/api/voice-sessions")
    assert session.status_code == 201
    session_id = session.json()["id"]
    assert session.json()["takes"] == [] and session.json()["requiredSpeechS"] == 300

    take = client.put(
        f"/api/voice-sessions/{session_id}/takes/1",
        params={"promptId": "narration-1"},
        content=wav_bytes(speech_like()),
    )
    assert take.status_code == 200 and take.json()["quality"]["ok"] and take.json()["promptId"] == "narration-1"
    short = client.put(f"/api/voice-sessions/{session_id}/takes/2", content=wav_bytes(speech_like(2)))
    assert short.json()["quality"]["ok"] is False and short.json()["quality"]["issues"][0]["code"] == "too_short"
    assert services.voice_sessions.take_path(session_id, 1).is_file()

    current = client.get(f"/api/voice-sessions/{session_id}").json()
    assert [t["number"] for t in current["takes"]] == [1, 2]
    assert current["usableSpeechS"] == take.json()["quality"]["speechS"]  # the failed take doesn't count
    assert [s["id"] for s in client.get("/api/voice-sessions").json()] == [session_id]

    replaced = client.put(f"/api/voice-sessions/{session_id}/takes/2", content=wav_bytes(speech_like(10)))
    assert replaced.json()["quality"]["ok"]
    assert client.delete(f"/api/voice-sessions/{session_id}/takes/2").status_code == 204
    assert error(client.delete(f"/api/voice-sessions/{session_id}/takes/2")) == "take_not_found"
    assert not services.voice_sessions.take_path(session_id, 2).exists()

    assert client.delete(f"/api/voice-sessions/{session_id}").status_code == 204
    assert not services.voice_sessions.folder(session_id).exists()
    assert error(client.get(f"/api/voice-sessions/{session_id}")) == "session_not_found"


def test_takes_reject_bad_audio_and_respect_the_limit(client: TestClient) -> None:
    session_id = client.post("/api/voice-sessions").json()["id"]
    url = f"/api/voice-sessions/{session_id}/takes"
    assert error(client.put(f"{url}/1", content=b"not audio")) == "unsupported_audio"
    assert error(client.put(f"{url}/1", content=wav_bytes(speech_like(61)))) == "too_long"
    assert client.put(f"{url}/1", params={"promptId": "Bad Id!"}, content=wav_bytes(speech_like())).status_code == 422
    for number in range(1, 5):
        assert client.put(f"{url}/{number}", content=wav_bytes(speech_like(4))).status_code == 200
    assert error(client.put(f"{url}/5", content=wav_bytes(speech_like(4)))) == "take_limit"
    assert client.put(f"{url}/4", content=wav_bytes(speech_like(5))).status_code == 200  # replacing is fine
    assert client.put(f"{url}/0", content=wav_bytes(speech_like(4))).status_code == 422


def test_import_splits_a_long_recording_at_its_pauses(client: TestClient) -> None:
    session_id = client.post("/api/voice-sessions").json()["id"]
    client.put(f"/api/voice-sessions/{session_id}/takes/1", content=wav_bytes(speech_like()))
    recording = np.concatenate([silence(1.0), speech_like(9), silence(1.5), speech_like(8), silence(1.5)])
    imported = client.post(f"/api/voice-sessions/{session_id}/import", content=wav_bytes(recording))
    assert imported.status_code == 200
    takes = imported.json()["takes"]
    assert [(t["number"], t["source"]) for t in takes] == [(1, "recording"), (101, "import"), (102, "import")]
    assert all(8 <= t["durationS"] <= 10 for t in takes[1:])
    too_many = np.concatenate([speech_like(6), silence(1.5), speech_like(6), silence(1.5), speech_like(6)])
    assert error(client.post(f"/api/voice-sessions/{session_id}/import", content=wav_bytes(too_many))) == "take_limit"
    missing = client.post("/api/voice-sessions/0123456789abcdef0123456789abcdef/import", content=b"x")
    assert error(missing) == "session_not_found"


def test_microphone_check_reports_silence_and_tone_with_a_correction(client: TestClient, tmp_path: Path) -> None:
    check = "/api/voice-sessions/microphone-check"
    clean = client.post(check, content=wav_bytes(natural())).json()
    assert clean["report"]["ok"] and clean["report"]["issues"] == [] and clean["suggested"] is None
    quiet = client.post(check, content=wav_bytes(silence(4))).json()
    assert quiet["report"]["issues"][0]["code"] == "no_speech" and quiet["suggested"] is None
    harsh = client.post(check, content=wav_bytes(bright())).json()
    assert [i["code"] for i in harsh["report"]["issues"]] == ["bright"] and harsh["report"]["brightnessDb"] > 0
    assert harsh["suggested"]["trebleDb"] < 0 and harsh["suggested"]["bassDb"] == 0
    weak = client.post(check, content=wav_bytes(thin())).json()
    assert [i["code"] for i in weak["report"]["issues"]] == ["thin"] and weak["suggested"]["bassDb"] > 0

    params = {"trebleDb": harsh["suggested"]["trebleDb"]}
    preview = client.post("/api/voice-profiles/cleanup-preview", params=params, content=wav_bytes(bright()))
    assert preview.status_code == 200 and preview.headers["content-type"] == "audio/wav"
    (tmp_path / "preview.wav").write_bytes(preview.content)
    samples, rate = read_audio(tmp_path / "preview.wav")
    assert analyze(samples, rate, CHECK_RULES).issues == []  # the correction clears the warning
    refused = client.post("/api/voice-profiles/cleanup-preview", params={"trebleDb": 3}, content=wav_bytes(bright()))
    assert refused.status_code == 422


def test_tone_leaves_out_sibilants_and_is_unmeasured_without_vowels() -> None:
    assert analyze(speech_like(0.05), SAMPLE_RATE, CHECK_RULES).brightness_db is None
    hiss = tone(6_000, 8, 0.3) + speech_like(8, level=0.02)  # all "s": brighter than the vowels below it
    assert analyze(hiss, SAMPLE_RATE, CHECK_RULES).brightness_db is None
    steady = (0.3 * np.sin(2 * np.pi * 180 * np.arange(8 * SAMPLE_RATE) / SAMPLE_RATE)).astype(np.float32)
    assert analyze(steady, SAMPLE_RATE, CHECK_RULES).brightness_db is None  # no presence content at all
    every_second = (np.arange(8 * SAMPLE_RATE) % SAMPLE_RATE < 2_400).astype(np.float32)
    sibilant = analyze(natural() + tone(6_000, 8, 0.3) * every_second, SAMPLE_RATE, CHECK_RULES)
    assert sibilant.brightness_db is not None and sibilant.brightness_db < 0  # short "s" bursts don't count
    assert sibilant.issues == []


def test_tone_correction_is_gentle_and_never_clips() -> None:
    clip = speech_like(4)
    assert apply_tone(clip, SAMPLE_RATE, 0.0, 0.0) is clip
    loud = np.clip(speech_like(4, level=0.65), -0.98, 0.98)
    boosted = apply_tone(loud, SAMPLE_RATE, 0.0, 6.0)
    assert float(np.max(np.abs(boosted))) <= 0.99
    cut_treble = apply_tone(bright(), SAMPLE_RATE, -6.0, 0.0)
    assert analyze(cut_treble, SAMPLE_RATE, CHECK_RULES).brightness_db < analyze(bright(), SAMPLE_RATE).brightness_db


def test_split_joins_short_pieces_up_to_the_maximum() -> None:
    words = [piece for _ in range(6) for piece in (speech_like(2), silence(0.8))]
    takes = split_at_pauses(np.concatenate([*words, speech_like(25)]), SAMPLE_RATE)
    seconds = [len(take) / SAMPLE_RATE for take in takes]
    assert len(takes) == 3 and 5 <= seconds[0] <= 8 and seconds[-1] > 20  # one long take is never cut mid-speech
