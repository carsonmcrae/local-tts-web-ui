# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for reviewing studio takes and seeing how far a session has come.

Scope: Recording a passage again keeps the take it replaced, which can be played and brought back
(and the newer one then becomes the previous take); deleting a take removes both; a session's tier
(starting, foundation, developing, complete) and the speaking styles its usable takes can teach.
Does NOT belong: The take verdict (test_take_checks.py) or building the voice (test_studio_voices.py).
"""

from __future__ import annotations

from typing import Any

import soundfile as sf
from fastapi.testclient import TestClient

from conftest import speech_like, wav_bytes
from ltts.container import Services


def session(client: TestClient) -> str:
    created: str = client.post("/api/voice-sessions").json()["id"]
    return created


def record(client: TestClient, session_id: str, number: int, seconds: float, prompt: str | None = None) -> Any:
    params = {"promptId": prompt} if prompt else {}
    url = f"/api/voice-sessions/{session_id}/takes/{number}"
    return client.put(url, params=params, content=wav_bytes(speech_like(seconds))).json()


def test_a_new_take_keeps_the_one_it_replaced_until_it_is_brought_back(client: TestClient, services: Services) -> None:
    session_id = session(client)
    url = f"/api/voice-sessions/{session_id}/takes/1"
    first = record(client, session_id, 1, 6, "narration-1")
    assert first["previous"] is None
    assert client.get(f"{url}/previous/audio").json()["error"]["code"] == "take_not_found"
    second = record(client, session_id, 1, 9, "narration-1")
    assert second["previous"] == {k: first[k] for k in ("durationS", "quality", "createdAt")}
    old = client.get(f"{url}/previous/audio")
    assert old.status_code == 200 and old.headers["content-type"] == "audio/wav"
    assert abs(sf.info(services.voice_sessions.previous_path(session_id, 1)).duration - first["durationS"]) < 0.05

    restored = client.post(f"{url}/restore").json()
    assert (restored["durationS"], restored["createdAt"]) == (first["durationS"], first["createdAt"])
    assert restored["previous"]["durationS"] == second["durationS"]  # the newer take can come back too
    assert abs(sf.info(services.voice_sessions.take_path(session_id, 1)).duration - first["durationS"]) < 0.05
    again = client.post(f"{url}/restore").json()
    assert again["durationS"] == second["durationS"]

    assert client.delete(url).status_code == 204
    assert not services.voice_sessions.previous_path(session_id, 1).exists()
    assert client.post(f"{url}/restore").json()["error"]["code"] == "no_previous_take"


def test_restoring_needs_an_earlier_take(client: TestClient) -> None:
    session_id = session(client)
    record(client, session_id, 2, 6)
    response = client.post(f"/api/voice-sessions/{session_id}/takes/2/restore")
    assert response.status_code == 404 and response.json()["error"]["code"] == "no_previous_take"


def test_a_session_moves_through_its_tiers(client: TestClient, services: Services) -> None:
    services.settings.min_studio_speech_s = 40.0
    session_id = session(client)
    current = client.get(f"/api/voice-sessions/{session_id}").json()
    assert current["tier"] == "starting"
    assert {s["style"]: s["takes"] for s in current["styles"]} == {
        "narration": 0, "question": 0, "lively": 0, "dialogue": 0, "calm": 0,
    }  # fmt: skip
    record(client, session_id, 1, 12, "narration-1")
    record(client, session_id, 17, 12, "conversation-1")
    current = client.get(f"/api/voice-sessions/{session_id}").json()
    assert current["tier"] == "starting"  # no foundation passage, and not complete
    assert {s["style"]: s["takes"] for s in current["styles"]} == {
        "narration": 1, "question": 1, "lively": 0, "dialogue": 1, "calm": 1,
    }  # fmt: skip
    record(client, session_id, 49, 60, "foundation")  # the longer passage that allows an early voice
    usable = client.get(f"/api/voice-sessions/{session_id}").json()["usableSpeechS"]
    tiers = {}
    for required in (usable * 3, usable * 1.5, usable):
        services.settings.min_studio_speech_s = required
        tiers[required] = client.get(f"/api/voice-sessions/{session_id}").json()["tier"]
    assert list(tiers.values()) == ["foundation", "developing", "complete"]
