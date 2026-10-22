# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the studio take verdict, take playback and building a session early.

Scope: Syllable estimates from text and audio; one root-cause message for a take without speech
(silence, a take stopped at once, a voice too quiet to hear, an early stop) or a whole reading too
quiet to measure (not mistaken for a missing one); full takes with
completeness, noise compared with the speaker's other takes (advice, never blocking) and pauses;
calibration from earlier takes; playing a take back; and the early build from the foundation passage.
Does NOT belong: Clip and microphone-check rules (test_voices_exports_jobs.py) or the build itself.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import SAMPLE_RATE, speech_like, wav_bytes
from ltts.engines.cloned_speech import count_syllables
from ltts.voices.quality import QualityReport
from ltts.voices.take_checks import TakeContext, context_for, judge_take, syllables_heard

PASSAGE = (
    "The library opens at nine, but most mornings the first visitors arrive a little early. They wait on the "
    "stone steps with coffee in hand, talking quietly about the books they plan to find."
)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(seconds * SAMPLE_RATE), dtype=np.float32)


def codes(report: QualityReport) -> list[str]:
    return [issue.code for issue in report.issues]


def test_count_syllables_follows_common_english_endings() -> None:
    assert count_syllables("cat") == 1
    assert count_syllables("table") == 2
    assert count_syllables("walked wanted opened") == 1 + 2 + 2
    assert count_syllables("stones boxes") == 1 + 2
    assert count_syllables("In 1969") == 1 + 5
    assert 44 <= count_syllables(PASSAGE) <= 50
    assert count_syllables("") == 0


def test_syllables_heard_counts_bursts_of_voice() -> None:
    assert syllables_heard(speech_like(10), SAMPLE_RATE) == pytest.approx(30, abs=4)  # three bursts a second
    assert syllables_heard(silence(2.0), SAMPLE_RATE) <= 1
    assert syllables_heard(np.zeros(100, dtype=np.float32), SAMPLE_RATE) == 0


def test_a_take_without_speech_gets_one_message_about_that() -> None:
    nothing = judge_take(np.zeros(SAMPLE_RATE // 2, dtype=np.float32), SAMPLE_RATE, TakeContext(40))
    assert codes(nothing) == ["no_sound"] and not nothing.ok
    click = np.zeros(SAMPLE_RATE, dtype=np.float32)
    click[100:200] = 0.4  # a button click and nothing else: stopped before reading
    stopped = judge_take(click, SAMPLE_RATE, TakeContext(40))
    assert codes(stopped) == ["no_speech"] and "before the reading started" in stopped.issues[0].message


def test_a_short_take_names_the_quiet_voice_or_the_early_stop() -> None:
    quiet = judge_take(speech_like(2, level=0.012, noise=0.0), SAMPLE_RATE, TakeContext(40))
    assert codes(quiet) == ["too_quiet"]
    short = judge_take(speech_like(2), SAMPLE_RATE, TakeContext(40))
    assert codes(short) == ["too_short"]
    assert "this passage takes about 8 s" in short.issues[0].message  # 40 syllables at 5 a second
    assert "only" in short.issues[0].message and not short.ok


def test_a_quiet_reading_is_too_quiet_not_missing() -> None:
    # A whole reading from a distant or low-gain microphone: faint, but far above its own background.
    for level in (0.0095, 0.003):  # its loudest moment just above, then below, the "no sound at all" line
        faint = speech_like(10, level=level, noise=0.00003)
        report = judge_take(faint, SAMPLE_RATE, TakeContext(40), recorded=faint)
        assert codes(report) == ["too_quiet"] and not report.ok
    part = speech_like(4, level=0.014, noise=0.00003)
    gappy = np.concatenate([part, silence(6.0), part])
    assert codes(judge_take(gappy, SAMPLE_RATE, TakeContext(40))) == ["too_quiet"]  # not its pauses as well
    room = (0.003 * np.random.default_rng(5).standard_normal(8 * SAMPLE_RATE)).astype(np.float32)
    assert codes(judge_take(room, SAMPLE_RATE, TakeContext(40), recorded=room)) == ["no_speech"]  # background only


def test_a_full_take_reports_completeness_noise_and_pauses_as_advice() -> None:
    whole = judge_take(speech_like(10), SAMPLE_RATE, TakeContext(30))
    assert whole.ok and codes(whole) == [] and whole.coverage == 1.0
    half = judge_take(speech_like(5), SAMPLE_RATE, TakeContext(40))
    assert half.ok and codes(half) == ["incomplete"] and half.coverage is not None and half.coverage < 0.65
    assert "of the passage was read" in half.issues[0].message
    noisy = judge_take(speech_like(10, level=0.05, noise=0.05), SAMPLE_RATE, TakeContext())
    assert noisy.ok and "noisy" in codes(noisy)  # advice: the take still counts
    louder = judge_take(speech_like(10, noise=0.004), SAMPLE_RATE, TakeContext(noise_dbfs=-75.0))
    assert louder.ok and "louder than in your other takes" in louder.issues[0].message
    gappy = np.concatenate([speech_like(4), silence(6.0), speech_like(4)])
    assert "pauses" in codes(judge_take(gappy, SAMPLE_RATE, TakeContext()))


def test_context_calibrates_to_the_speaker_after_three_complete_takes() -> None:
    def report(**fields: Any) -> QualityReport:
        base = {"duration_s": 10, "speech_s": 8, "rms_dbfs": -20, "peak_dbfs": -3, "clipping_ratio": 0,
                "pause_ratio": 0.1, "snr_db": 40, "noise_dbfs": -70, "coverage": 1.0, "syllables_heard": 36,
                "syllables_expected": 40, "ok": True, "issues": []}  # fmt: skip
        return QualityReport.model_validate(base | fields)

    assert context_for([report(), report()], PASSAGE).pace is None  # two takes are not enough
    context = context_for([report(), report(), report(speech_s=10)], PASSAGE)
    assert context.pace == pytest.approx(5.0) and context.detection == pytest.approx(0.9)
    assert context.noise_dbfs == -70 and context.syllables_expected == count_syllables(PASSAGE)
    assert context_for([], None) == TakeContext()


def test_a_take_plays_back_as_wav(client: TestClient) -> None:
    session_id = client.post("/api/voice-sessions").json()["id"]
    url = f"/api/voice-sessions/{session_id}/takes/1"
    saved = client.put(url, params={"promptId": "narration-1", "text": PASSAGE}, content=wav_bytes(speech_like()))
    assert saved.json()["quality"]["syllablesExpected"] == count_syllables(PASSAGE)
    audio = client.get(f"{url}/audio")
    assert audio.status_code == 200 and audio.headers["content-type"] == "audio/wav"
    assert audio.content[:4] == b"RIFF"
    assert client.get(f"/api/voice-sessions/{session_id}/takes/2/audio").json()["error"]["code"] == "take_not_found"


def test_the_foundation_passage_unlocks_an_early_build(client: TestClient, tmp_path: Any) -> None:
    session_id = client.post("/api/voice-sessions").json()["id"]
    url = f"/api/voice-sessions/{session_id}"
    client.put(f"{url}/takes/1", params={"promptId": "narration-1"}, content=wav_bytes(speech_like(20)))
    session = client.get(url).json()
    assert not session["canBuild"] and not session["complete"] and session["minimumSpeechS"] == 45
    assert client.post(f"{url}/build").json()["error"]["code"] == "not_enough_speech"
    long = tmp_path / "long.wav"
    sf.write(long, speech_like(45), SAMPLE_RATE, subtype="PCM_16")
    client.put(f"{url}/takes/49", params={"promptId": "foundation"}, content=long.read_bytes())
    session = client.get(url).json()
    assert session["canBuild"] and not session["complete"]
