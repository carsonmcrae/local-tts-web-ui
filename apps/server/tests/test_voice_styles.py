# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for studio voices' speaking styles and the polish applied to cloned speech.

Scope: Which style a sentence is read in; which takes teach each style; take numbers mapped back to
passages; the build job making styles that move into the finished profile and change its cache
revision; building styles for a studio voice saved before they existed (and refusing other voices);
trimming, pause shortening, loudness and the plausibility of a clip's length.
Does NOT belong: The worker's token extraction (needs the model) or the rest of the build.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine, speech_like, wait_job, wav_bytes
from ltts.config import Settings
from ltts.container import Services
from ltts.engines.cloned_speech import TARGET_RMS_DBFS, acceptable, plausibility, polish, sentence_style
from ltts.voices.quality import QualityReport
from ltts.voices.styles import StyleTake, prompt_for_number, style_prompts

RATE = 24_000


@pytest.fixture
def settings(settings: Settings) -> Settings:
    return settings.model_copy(update={"min_studio_speech_s": 20})


def report(**fields: Any) -> QualityReport:
    base = {"duration_s": 12, "speech_s": 11, "rms_dbfs": -20, "peak_dbfs": -3, "clipping_ratio": 0,
            "pause_ratio": 0.1, "snr_db": 40, "ok": True, "issues": []}  # fmt: skip
    return QualityReport.model_validate(base | fields)


def test_a_sentence_is_read_in_the_style_its_punctuation_asks_for() -> None:
    assert sentence_style("Are you coming tonight?") == "question"
    assert sentence_style("“Where is it?” she asked.") == "dialogue"
    assert sentence_style("“Is it here?”") == "question"
    assert sentence_style("What a day!") == "lively"
    assert sentence_style("The river was wide.") == "narration"


def test_take_numbers_map_back_to_their_passages() -> None:
    assert prompt_for_number(1) == "narration-1"
    assert prompt_for_number(9) == "storytelling-1"
    assert prompt_for_number(32) == "questions-and-surprise-8"
    assert prompt_for_number(48) == "calm-and-reflective-8"
    assert prompt_for_number(49) == "foundation"
    assert prompt_for_number(101) is None and prompt_for_number(0) is None


def test_style_prompts_prefer_matching_clean_lively_takes() -> None:
    def take(name: str, prompt_id: str | None, spread: float = 1.0, **quality: Any) -> StyleTake:
        return StyleTake(Path(name), prompt_id, report(**quality), spread, quality.pop("typical", True))

    takes = [
        take("q-flat", "questions-and-surprise-1", 0.5),
        take("q-lively", "questions-and-surprise-2", 3.5),
        take("q-noisy", "questions-and-surprise-3", 3.9, snr_db=8),
        take("q-failed", "questions-and-surprise-4", 3.9, ok=False),
        take("chat", "conversation-1", 2.0),
        take("import", None, 4.0),
        StyleTake(Path("q-stranger"), "questions-and-surprise-5", report(), 4.0, False),
    ]
    assert [p.name for p in style_prompts(takes, "question")] == ["q-lively", "q-flat", "chat"]
    assert style_prompts(takes, "narration") == []  # no narration passages recorded


def test_the_build_makes_styles_that_move_into_the_profile(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    session_id = client.post("/api/voice-sessions").json()["id"]
    for number, prompt in [(1, "narration-1"), (17, "conversation-1"), (25, "questions-and-surprise-1"),
                           (9, "storytelling-1")]:  # fmt: skip
        client.put(
            f"/api/voice-sessions/{session_id}/takes/{number}",
            params={"promptId": prompt},
            content=wav_bytes(speech_like(12)),
        )
    job = wait_job(client, client.post(f"/api/voice-sessions/{session_id}/build").json()["id"])
    assert job["result"]["styles"] == ["narration", "question", "lively", "dialogue"]
    assert dict(engines["chatterbox"].styled)["question"][0] == "025.flac"
    best = client.get(f"/api/voice-sessions/{session_id}").json()["candidates"][0]["index"]
    profile = client.post(
        f"/api/voice-sessions/{session_id}/finish", json={"candidate": best, "name": "Me", "consent": True}
    ).json()
    assert profile["styles"] == ["dialogue", "lively", "narration", "question"]
    _, spec, revision = services.voices.resolve(profile["id"])
    assert dict(spec.styles)["question"].name == "question.safetensors" and "styles-" in revision


def test_a_saved_studio_voice_learns_its_styles_from_its_takes(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    session_id = client.post("/api/voice-sessions").json()["id"]
    for number in (2, 18, 26):
        client.put(f"/api/voice-sessions/{session_id}/takes/{number}", content=wav_bytes(speech_like(12)))
    wait_job(client, client.post(f"/api/voice-sessions/{session_id}/build").json()["id"])
    best = client.get(f"/api/voice-sessions/{session_id}").json()["candidates"][0]["index"]
    profile = client.post(
        f"/api/voice-sessions/{session_id}/finish", json={"candidate": best, "name": "Me", "consent": True}
    ).json()
    assert profile["styles"] == []  # takes saved without their passage: as a voice from before styles
    _, _, before = services.voices.resolve(profile["id"])

    started = client.post(f"/api/voice-profiles/{profile['id']}/styles")
    assert started.status_code == 202
    job = wait_job(client, started.json()["id"])
    assert job["status"] == "succeeded" and job["result"]["styles"] == ["narration", "question", "lively", "dialogue"]
    assert dict(engines["chatterbox"].styled)["question"][0] == "026.flac"  # take 26 read a question passage
    refreshed = client.get("/api/voice-profiles").json()[0]
    assert refreshed["styles"] == ["dialogue", "lively", "narration", "question"]
    _, _, after = services.voices.resolve(profile["id"])
    assert after != before

    shutil.rmtree(services.voices.takes_dir(profile["id"]))
    assert client.post(f"/api/voice-profiles/{profile['id']}/styles").json()["error"]["code"] == "not_studio"


def test_polish_trims_shortens_pauses_and_levels_the_speech() -> None:
    quiet = speech_like(2, rate=RATE, level=0.02, noise=0.0)
    clip = np.concatenate([np.zeros(RATE), quiet, np.zeros(2 * RATE), quiet, np.zeros(RATE)]).astype(np.float32)
    polished = polish(clip, RATE)
    assert 4.2 < len(polished) / RATE < 5.0  # edges trimmed, the 2 s pause cut to 0.3 s
    voiced = polished[np.abs(polished) > 1e-4]
    assert 20 * np.log10(np.sqrt(np.mean(voiced**2))) == pytest.approx(TARGET_RMS_DBFS, abs=2.5)
    assert np.max(np.abs(polished)) <= 10 ** (-1 / 20) + 1e-6
    silent = np.zeros(RATE, dtype=np.float32)
    assert polish(silent, RATE) is silent


def test_plausibility_flags_clips_that_stop_early_or_run_on() -> None:
    text = "The library opens at nine, but most mornings the first visitors arrive early."  # ~20 syllables
    assert acceptable(plausibility(np.zeros(int(4.5 * RATE), dtype=np.float32), RATE, text))
    assert not acceptable(plausibility(np.zeros(RATE // 2, dtype=np.float32), RATE, text))
    assert not acceptable(plausibility(np.zeros(20 * RATE, dtype=np.float32), RATE, text))
