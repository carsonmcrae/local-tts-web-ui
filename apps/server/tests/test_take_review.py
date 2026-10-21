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
from ltts.voices.styles import prompt_for_number


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
    """Tiers follow what the voice uses: the foundation, a settled sound, then every style's three takes."""
    services.settings.min_studio_speech_s = 10_000.0  # only the passages decide here
    session_id = session(client)
    current = client.get(f"/api/voice-sessions/{session_id}").json()
    assert current["tier"] == "starting" and current["suggested"] == ["foundation", "narration-1", "narration-2"]
    assert {s["style"]: (s["takes"], s["needed"]) for s in current["styles"]} == {
        "narration": (0, 3), "question": (0, 3), "lively": (0, 3), "dialogue": (0, 3), "calm": (0, 3),
    }  # fmt: skip
    record(client, session_id, 1, 12, "narration-1")
    record(client, session_id, 17, 12, "conversation-1")
    current = client.get(f"/api/voice-sessions/{session_id}").json()
    assert current["tier"] == "starting" and current["suggested"][0] == "foundation"  # no foundation passage yet
    assert {s["style"]: s["takes"] for s in current["styles"]} == {
        "narration": 1, "question": 1, "lively": 0, "dialogue": 1, "calm": 1,
    }  # fmt: skip
    record(client, session_id, 49, 60, "foundation")  # the longer passage that allows an early voice
    current = client.get(f"/api/voice-sessions/{session_id}").json()
    assert current["tier"] == "foundation" and current["canBuild"] and not current["complete"]
    for number in range(33, 43):  # the numbers passages and two calm ones: a settled sound, few styles
        record(client, session_id, number, 12, prompt_for_number(number))
    current = client.get(f"/api/voice-sessions/{session_id}").json()
    assert current["tier"] == "developing" and current["suggested"][0] == "questions-and-surprise-2"
    current = follow_suggestions(client, session_id)
    assert current["tier"] == "complete" and current["complete"] and current["suggested"] == []
    assert all(s["takes"] >= s["needed"] for s in current["styles"])


def test_following_the_suggestions_needs_far_fewer_than_all_the_passages(client: TestClient) -> None:
    session_id = session(client)
    record(client, session_id, 49, 60, "foundation")
    current = follow_suggestions(client, session_id)
    assert current["tier"] == "complete" and current["suggested"] == []
    assert 12 <= len(current["takes"]) <= 16  # of 49


def follow_suggestions(client: TestClient, session_id: str) -> Any:
    """Record the most useful next passage until nothing more would change the voice."""
    numbers = {prompt_for_number(n): n for n in range(1, 50)}
    current = client.get(f"/api/voice-sessions/{session_id}").json()
    while current["suggested"] and len(current["takes"]) < 49:
        pid = current["suggested"][0]
        record(client, session_id, numbers[pid], 12, pid)
        current = client.get(f"/api/voice-sessions/{session_id}").json()
    return current
