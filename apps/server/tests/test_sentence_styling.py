# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for styling chosen sentences: character voices, effects, sounds and a dialogue voice.

Scope: Every effect keeps the speech loudness, stays below -1 dBFS and is repeatable; the loudspeaker
narrows the band and the hall adds a tail. The styling API sets and clears fields, checks sentences
and voices, and changes its revision. Synthesis reads a styled sentence with its voice, effect (its
own cache entry) and sound (only for an engine that performs it), quoted dialogue with the dialogue
voice, exports follow the same plan, and deleting a voice hands its sentences back.
Does NOT belong: The reader UI or the engines themselves.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from conftest import SAMPLE_RATE, FakeEngine, speech_like, wait_job, wav_bytes
from ltts.container import Services
from ltts.documents import styling as styling_module
from ltts.effects import EFFECTS, apply_effect

TEXT = 'The ferry left at dawn. "Is anyone there?" she called. Nobody answered.'


def rms_db(samples: np.ndarray) -> float:
    loud = samples[np.abs(samples) > 0.02 * np.max(np.abs(samples))]
    return float(20 * np.log10(np.sqrt(np.mean(loud**2))))


def band_share(samples: np.ndarray, low: float, high: float) -> float:
    power = np.abs(np.fft.rfft(samples)) ** 2
    freqs = np.fft.rfftfreq(samples.size, 1 / SAMPLE_RATE)
    return float(power[(freqs >= low) & (freqs < high)].sum() / power.sum())


@pytest.mark.parametrize("effect", EFFECTS)
def test_every_effect_keeps_the_loudness_and_is_repeatable(effect: Any) -> None:
    rng = np.random.default_rng(3)
    speech = (speech_like(3) + 0.05 * rng.standard_normal(3 * SAMPLE_RATE)).astype(np.float32)
    out = apply_effect(effect, speech, SAMPLE_RATE)
    assert out.dtype == np.float32 and len(out) >= len(speech)
    softer = 7.0 if effect == "quiet" else 0.0  # a quiet aside is meant to sound softer
    assert abs(rms_db(out) - rms_db(speech) + softer) < 2.5
    assert np.max(np.abs(out)) <= 10 ** (-1 / 20) + 1e-6
    assert np.array_equal(out, apply_effect(effect, speech, SAMPLE_RATE))


def test_the_loudspeaker_narrows_the_band_and_the_hall_echoes() -> None:
    rng = np.random.default_rng(4)
    noise = (0.1 * rng.standard_normal(2 * SAMPLE_RATE)).astype(np.float32)
    speaker = apply_effect("loudspeaker", noise, SAMPLE_RATE)
    assert band_share(speaker, 0, 250) < 0.25 * band_share(noise, 0, 250)
    assert band_share(speaker, 6_000, 12_000) < 0.25 * band_share(noise, 6_000, 12_000)
    hall = apply_effect("hall", speech_like(1), SAMPLE_RATE)
    assert len(hall) - SAMPLE_RATE >= 2 * SAMPLE_RATE and np.max(np.abs(hall[-SAMPLE_RATE:])) > 0
    assert apply_effect("robot", np.zeros(0, dtype=np.float32), SAMPLE_RATE).size == 0
    assert not apply_effect("hall", np.zeros(1_000, dtype=np.float32), SAMPLE_RATE).any()  # silence stays silent
    click = np.zeros(SAMPLE_RATE, dtype=np.float32)
    click[100] = 1.0  # one click: matching its loudness would push the echoes past the ceiling
    assert np.max(np.abs(apply_effect("robot", click, SAMPLE_RATE))) == pytest.approx(10 ** (-1 / 20), abs=1e-6)


def document(client: TestClient) -> str:
    doc_id: str = client.post("/api/documents/text", json={"text": TEXT, "title": "Ferry"}).json()["id"]
    return doc_id


def test_the_styling_api_sets_clears_and_checks(client: TestClient) -> None:
    doc_id = document(client)
    url = f"/api/documents/{doc_id}/styles"
    empty = client.get(url).json()
    assert empty["segments"] == [] and empty["dialogueVoiceId"] is None
    styled = client.put(url, json={"indexes": [0, 2], "voiceId": "kokoro:alpha", "effect": "radio"}).json()
    assert [(s["index"], s["voiceId"], s["effect"], s["sound"]) for s in styled["segments"]] == [
        (0, "kokoro:alpha", "radio", None),
        (2, "kokoro:alpha", "radio", None),
    ]
    assert styled["revision"] != empty["revision"]
    kept = client.put(url, json={"indexes": [0], "effect": None}).json()  # the voice is left as it was
    first = kept["segments"][0]
    assert (first["index"], first["voiceId"], first["effect"]) == (0, "kokoro:alpha", None)
    cleared = client.put(url, json={"indexes": [0, 2], "voiceId": None, "effect": None}).json()
    assert cleared["segments"] == []

    assert client.put(url, json={"indexes": [9]}).json()["error"]["code"] == "segment_not_found"
    assert client.put(url, json={"indexes": [0], "voiceId": "kokoro:nobody"}).status_code == 404
    assert client.put(url, json={"indexes": [0], "effect": "underwater"}).status_code == 422
    assert client.put(url, json={"indexes": [0], "sound": "sneeze"}).status_code == 422
    assert client.put(url, json={"indexes": []}).status_code == 422
    cast = client.put(f"/api/documents/{doc_id}/cast", json={"dialogueVoiceId": "chatterbox:alpha"}).json()
    assert cast["dialogueVoiceId"] == "chatterbox:alpha"
    assert client.get(f"/api/documents/{'0' * 32}/styles").status_code == 404


def test_the_delivery_analysis_is_kept_for_the_last_few_documents(
    client: TestClient, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(styling_module, "_ANALYSED", 2)
    docs = [document(client) for _ in range(3)]
    for doc_id in docs:
        assert services.styling.lines(doc_id)[1].dialogue
    assert list(services.styling._analysed) == docs[1:]  # the oldest made room
    assert services.styling.lines(docs[1]) is services.styling._analysed[docs[1]]  # a kept analysis is reused


def audio(client: TestClient, doc_id: str, index: int) -> Any:
    return client.get(f"/api/documents/{doc_id}/segments/{index}/audio", params={"voice": "kokoro:alpha"})


def test_synthesis_follows_each_sentences_plan(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    doc_id = document(client)
    url = f"/api/documents/{doc_id}/styles"
    plain = audio(client, doc_id, 0).headers["x-audio-url"]
    client.put(url, json={"indexes": [0], "effect": "telephone", "sound": "sigh"})
    phoned = audio(client, doc_id, 0)
    assert phoned.status_code == 200 and phoned.headers["x-audio-url"] != plain  # an effect has its own entry
    assert engines["kokoro"].calls[-1][0] == "The ferry left at dawn."  # Kokoro would read a tag out loud

    client.put(url, json={"indexes": [2], "voiceId": "chatterbox:alpha", "sound": "sigh"})
    audio(client, doc_id, 2)
    assert engines["chatterbox"].calls[-1][0] == "[sigh] Nobody answered."

    client.put(f"/api/documents/{doc_id}/cast", json={"dialogueVoiceId": "chatterbox:alpha"})
    audio(client, doc_id, 1)
    # The quoted speech gets the dialogue voice and the narration around it keeps the reading voice.
    assert engines["chatterbox"].calls[-1][0] == "Is anyone there?"
    assert engines["kokoro"].calls[-1][0] == "she called."
    client.put(f"/api/documents/{doc_id}/cast", json={"splitDialogue": False})
    audio(client, doc_id, 1)
    assert engines["chatterbox"].calls[-1][0] == '"Is anyone there?" she called.'
    before = len(engines["kokoro"].calls)
    audio(client, doc_id, 0)  # narration stays with the reading voice
    assert engines["chatterbox"].calls[-1][0] != "The ferry left at dawn." and len(engines["kokoro"].calls) >= before


def test_exports_read_with_the_same_plan(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    doc_id = document(client)
    client.put(f"/api/documents/{doc_id}/styles", json={"indexes": [2], "voiceId": "chatterbox:alpha"})
    request = {"documentId": doc_id, "voiceId": "kokoro:alpha", "format": "wav"}
    job = wait_job(client, client.post("/api/exports", json=request).json()["id"])
    assert job["status"] == "succeeded"
    assert [call[0] for call in engines["chatterbox"].calls] == ["Nobody answered."]


def test_deleting_a_voice_hands_its_sentences_back(client: TestClient, services: Services, tmp_path: Path) -> None:
    doc_id = document(client)
    created = client.post(
        "/api/voice-profiles", params={"name": "Sam", "consent": "true"}, content=wav_bytes(speech_like(12))
    ).json()
    client.put(f"/api/documents/{doc_id}/styles", json={"indexes": [1], "voiceId": created["voiceId"]})
    client.put(f"/api/documents/{doc_id}/cast", json={"dialogueVoiceId": created["voiceId"]})
    assert client.delete(f"/api/voice-profiles/{created['id']}").status_code == 204
    after = client.get(f"/api/documents/{doc_id}/styles").json()
    assert after["segments"] == [] and after["dialogueVoiceId"] is None
    assert services.styling.plan(doc_id, 1, "x", "kokoro:alpha").voice_id == "kokoro:alpha"
