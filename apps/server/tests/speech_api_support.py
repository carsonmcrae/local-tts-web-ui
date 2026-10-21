# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Shared helpers for the local speech API tests.

Scope: A "program" client (no app header, a chosen client address, as curl or a script would call
it), switching the API on with a fresh token through the Settings endpoints, the bearer header, a
speech request with sensible defaults, creating a custom voice, and a fake engine that holds
synthesis until a test lets it finish.
Does NOT belong: Assertions (test_speech_api*.py) or the shared fixtures (conftest.py).
"""

from __future__ import annotations

import threading
from typing import Any

import httpx
from fastapi.testclient import TestClient

from conftest import FakeEngine, speech_like, wav_bytes
from ltts.engines.base import AudioClip, VoiceSpec

LOCAL = "127.0.0.1"


def program(web: TestClient, host: str = LOCAL) -> TestClient:
    """A non-browser client on ``host`` for the same app as ``web`` (no X-LTTS-Client header)."""
    return TestClient(web.app, client=(host, 50000))


def switch_on(web: TestClient, **changes: Any) -> str:
    """Turn the API on with a new token (and any other settings); returns the token."""
    token: str = web.post("/api/speech-api/token").json()["token"]
    body = {"enabled": True, "allowNetwork": False, "allowedVoices": []} | changes
    assert web.put("/api/speech-api", json=body).status_code == 200
    return token


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def speak(caller: TestClient, token: str, **fields: Any) -> httpx.Response:
    body = {"model": "ttsnative", "voice": "kokoro:alpha", "input": "Hello there. How are you?"} | fields
    return caller.post("/v1/audio/speech", json=body, headers=auth(token))


def error_code(response: httpx.Response) -> str:
    code: str = response.json()["error"]["code"]
    return code


def custom_voice(web: TestClient) -> str:
    """Create a quick custom voice (consent given) and return its voice id."""
    created = web.post(
        "/api/voice-profiles",
        params={"name": "Me", "consent": "true", "source": "recording"},
        content=wav_bytes(speech_like(12)),
    )
    voice_id: str = created.json()["voiceId"]
    return voice_id


class GatedEngine(FakeEngine):
    """Synthesis waits until ``release`` is set; ``entered`` is set once a synthesis has started."""

    def __init__(self, engine_id: str = "kokoro") -> None:
        super().__init__(engine_id)
        self.entered = threading.Event()
        self.release = threading.Event()

    def synthesize(self, text: str, voice: VoiceSpec, pace: float) -> AudioClip:
        self.entered.set()
        self.release.wait(10)
        return super().synthesize(text, voice, pace)
