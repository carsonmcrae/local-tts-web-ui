# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for reviewing studio takes and seeing how far a session has come.

Scope: Recording a passage again keeps the take it replaced, which can be played and brought back
(and the newer one then becomes the previous take); deleting a take removes both; a session's tier
(starting, foundation, developing, complete) and the speaking styles its usable takes can teach; the
suggestions never ask for a passage already read, even for a style short of takes.
Does NOT belong: The take verdict (test_take_checks.py) or building the voice (test_studio_voices.py).
"""

from __future__ import annotations

from typing import Any

import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import speech_like, wav_bytes
from ltts.container import Services
from ltts.voices.quality import QualityReport
from ltts.voices.session_progress import suggestions
from ltts.voices.sessions import TakeOut
from ltts.voices.styles import STYLE_SOURCES, prompt_for_number


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


def test_noisy_takes_ask_for_better_audio_not_more_passages(client: TestClient) -> None:
    session_id = session(client)
    for number in (1, 2, 3, 4):
        url = f"/api/voice-sessions/{session_id}/takes/{number}"
        client.put(url, params={"promptId": f"narration-{number}"}, content=wav_bytes(speech_like(12, noise=0.12)))
    current = client.get(f"/api/voice-sessions/{session_id}").json()
    assert current["advice"] == "noisy_takes" and current["suggested"] == []


def test_a_complete_voice_needs_one_take_long_and_clean_enough_for_its_sound(client: TestClient) -> None:
    session_id = session(client)
    numbers = {prompt_for_number(n): n for n in range(1, 50)}
    current = client.get(f"/api/voice-sessions/{session_id}").json()
    for _ in range(30):  # every take too short to give the voice its sound
        wanted = [pid for pid in current["suggested"] if pid != "foundation"]
        if not wanted:
            break
        record(client, session_id, numbers[wanted[0]], 4, wanted[0])
        current = client.get(f"/api/voice-sessions/{session_id}").json()
    assert all(s["takes"] >= s["needed"] for s in current["styles"])
    assert current["advice"] == "no_sound_take" and current["tier"] != "complete"
    assert current["suggested"] == ["foundation"]  # read it, long and clean
    record(client, session_id, 49, 60, "foundation")
    current = client.get(f"/api/voice-sessions/{session_id}").json()
    assert current["advice"] is None and current["tier"] == "complete" and current["suggested"] == []


def read(prompt_id: str) -> TakeOut:
    """A clean take of ``prompt_id``, as the session keeps it."""
    quality = QualityReport(duration_s=12, speech_s=10, rms_dbfs=-20, peak_dbfs=-3, clipping_ratio=0, pause_ratio=0.1,
                            snr_db=30, ok=True, issues=[])  # fmt: skip
    return TakeOut(number=1, prompt_id=prompt_id, source="recording", duration_s=12, quality=quality, created_at="")


def test_a_style_short_of_takes_never_asks_for_a_passage_already_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(STYLE_SOURCES, "dialogue", ("conversation-1", "conversation-2"))  # fewer passages than takes
    questions = [f"questions-and-surprise-{n}" for n in (1, 2, 3, 4, 5, 8)]
    passages = ["foundation", "narration-1", "narration-2", *questions, "conversation-1", "conversation-2"]
    suggested = suggestions([read(pid) for pid in passages])
    assert suggested[0] == "calm-and-reflective-1" and len(suggested) == 3
    assert not any(pid.startswith("conversation") for pid in suggested)  # dialogue has nothing left to ask for
