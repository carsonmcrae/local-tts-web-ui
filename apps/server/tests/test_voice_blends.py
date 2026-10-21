# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for voice blends: a voice mixed from built-in Kokoro voices.

Scope: Creating a blend (two to four different built-in Kokoro voices, weights normalized), seeing it
in the voice list, reading with it (the engine gets the mix), refusing cloned or unknown voices and
repeated parts, and deleting it (its audio and the documents' uses of it go too).
Does NOT belong: Mixing the style vectors themselves (test_engine_runtime.py).
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine
from ltts.engines.base import VoiceInfo
from speech_api_support import program, speak, switch_on

URL = "/api/voice-profiles/blends"


@pytest.fixture
def two_voices(engines: dict[str, FakeEngine]) -> FakeEngine:
    """The fake Kokoro with a second built-in voice to blend with."""
    kokoro = engines["kokoro"]
    first = FakeEngine.voices(kokoro)[0]
    second = first.model_copy(update={"id": "kokoro:bravo", "name": "Bravo", "language_code": "en-gb"})
    kokoro.voices = lambda: [first, second]  # type: ignore[method-assign]
    return kokoro


def blend(client: TestClient, **body: Any) -> Any:
    parts = [{"voiceId": "kokoro:alpha", "weight": 3}, {"voiceId": "kokoro:bravo", "weight": 1}]
    return client.post(URL, json={"name": "Alphabravo", "parts": parts, **body})


def test_a_blend_is_a_voice_that_mixes_its_parts(client: TestClient, two_voices: FakeEngine) -> None:
    made = blend(client)
    assert made.status_code == 201
    created = made.json()
    assert created["voiceId"] == f"blend:{created['id']}"
    assert [(p["voiceId"], p["weight"]) for p in created["parts"]] == [("kokoro:alpha", 0.75), ("kokoro:bravo", 0.25)]
    listed: list[dict[str, Any]] = client.get("/api/voices").json()
    voice = next(v for v in listed if v["id"] == created["voiceId"])
    assert voice["category"] == "custom" and voice["engineId"] == "kokoro" and voice["name"] == "Alphabravo"
    assert voice["description"] == "A blend of Alpha (75%) and Bravo (25%)."
    doc = client.post("/api/documents/text", json={"text": "Hello there."}).json()
    audio = client.get(f"/api/documents/{doc['id']}/segments/0/audio", params={"voice": created["voiceId"]})
    assert audio.status_code == 200
    spec = two_voices.specs[-1]
    assert (spec.key, spec.blend) == ("alpha", (("alpha", 0.75), ("bravo", 0.25)))
    assert client.get(URL).json() == [created]


def test_only_built_in_kokoro_voices_blend(client: TestClient, two_voices: FakeEngine) -> None:
    cloned = [{"voiceId": "custom:abc", "weight": 1}, {"voiceId": "kokoro:alpha", "weight": 1}]
    assert client.post(URL, json={"name": "No", "parts": cloned}).status_code == 422
    chatterbox = [{"voiceId": "chatterbox:alpha", "weight": 1}, {"voiceId": "kokoro:alpha", "weight": 1}]
    assert client.post(URL, json={"name": "No", "parts": chatterbox}).status_code == 422
    unknown = [{"voiceId": "kokoro:zulu", "weight": 1}, {"voiceId": "kokoro:alpha", "weight": 1}]
    refused = client.post(URL, json={"name": "No", "parts": unknown})
    assert refused.status_code == 404 and refused.json()["error"]["code"] == "blend_voice_unavailable"
    twice = [{"voiceId": "kokoro:alpha", "weight": 1}, {"voiceId": "kokoro:alpha", "weight": 1}]
    assert client.post(URL, json={"name": "No", "parts": twice}).status_code == 422
    alone = [{"voiceId": "kokoro:alpha", "weight": 1}]
    assert client.post(URL, json={"name": "No", "parts": alone}).status_code == 422
    assert blend(client, name="").status_code == 422
    zero = [{"voiceId": "kokoro:alpha", "weight": 0}, {"voiceId": "kokoro:bravo", "weight": 1}]
    assert client.post(URL, json={"name": "No", "parts": zero}).status_code == 422
    assert client.get(URL).json() == []


def test_deleting_a_blend_forgets_it_everywhere(client: TestClient, two_voices: FakeEngine) -> None:
    created = blend(client).json()
    doc = client.post("/api/documents/text", json={"text": "One. Two."}).json()
    client.put(f"/api/documents/{doc['id']}/styles", json={"indexes": [0], "voiceId": created["voiceId"]})
    assert client.delete(f"{URL}/{created['id']}").status_code == 204
    assert client.get(f"/api/documents/{doc['id']}/styles").json()["segments"] == []
    assert created["voiceId"] not in [v["id"] for v in client.get("/api/voices").json()]
    gone = client.get(f"/api/documents/{doc['id']}/segments/0/audio", params={"voice": created["voiceId"]})
    assert gone.status_code == 404
    assert client.delete(f"{URL}/{created['id']}").status_code == 404
    assert client.delete(f"{URL}/not-an-id").status_code == 422


def test_a_blend_is_unavailable_while_kokoro_is_not_installed(client: TestClient, two_voices: FakeEngine) -> None:
    created = blend(client).json()
    two_voices.ready = False
    voice: VoiceInfo | dict[str, Any] = next(
        v for v in client.get("/api/voices").json() if v["id"] == created["voiceId"]
    )
    assert voice["available"] is False


def test_the_speech_api_can_read_with_a_blend(client: TestClient, two_voices: FakeEngine) -> None:
    created = blend(client).json()
    token = switch_on(client)
    caller = program(client)
    listed = caller.get("/v1/voices", headers={"Authorization": f"Bearer {token}"}).json()
    assert created["voiceId"] in [voice["id"] for voice in listed["data"]]
    response = speak(caller, token, voice=created["voiceId"], response_format="wav")
    assert response.status_code == 200 and two_voices.specs[-1].blend
