# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Shared helpers for the local speech API tests.

Scope: A "program" client (no app header, a chosen client address and server port, as curl or a
script would call it), an app with chosen engines, switching the API on with a fresh token through
the Settings endpoints, the bearer header, a speech request with sensible defaults or a raw body,
creating a custom voice, a fake engine that holds synthesis until a test lets it finish (and an app
whose only engine it is), a fake Kokoro with the real engine's voice ids, and one speech request driven at the ASGI level, for what TestClient can't do (a
body that arrives slowly, a client that disconnects, an answer that is read slowly).
Does NOT belong: Assertions (test_speech_api*.py) or the shared fixtures (conftest.py).
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any

import httpx
from fastapi.testclient import TestClient
from starlette.types import ASGIApp, Message

from conftest import FakeEngine, speech_like, wav_bytes
from ltts.app import create_app
from ltts.config import Settings
from ltts.container import Services, build_services
from ltts.engines.base import AudioClip, VoiceInfo, VoiceSpec
from ltts.engines.kokoro_voices import GRADES, describe

LOCAL = "127.0.0.1"


def program(web: TestClient, host: str = LOCAL, port: int | None = None) -> TestClient:
    """A non-browser client on ``host`` for the same app as ``web`` (no X-LTTS-Client header), reaching
    the server on ``port`` (TestClient's own default, 80, when None)."""
    base_url = f"http://{LOCAL}:{port}" if port else "http://testserver"
    return TestClient(web.app, base_url=base_url, client=(host, 50000))


def app_with(settings: Settings, *engines: FakeEngine) -> tuple[TestClient, Services]:
    """The app's own UI client for an app whose only engines are ``engines``."""
    services = build_services(settings, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines))
    return TestClient(create_app(settings, services=services), headers={"X-LTTS-Client": "web"}), services


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


def raw(
    caller: TestClient, token: str, content: bytes, content_type: str | None = "application/json"
) -> httpx.Response:
    """A speech request with exactly this body."""
    headers = auth(token) | ({"Content-Type": content_type} if content_type else {})
    return caller.post("/v1/audio/speech", content=content, headers=headers)


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


def gated(settings: Settings) -> tuple[TestClient, GatedEngine, Services]:
    """An app whose only engine holds every synthesis until the test releases it."""
    engine = GatedEngine()
    web, services = app_with(settings, engine)
    return web, engine, services


class KokoroVoices(FakeEngine):
    """A fake Kokoro that offers the real engine's built-in voice ids (kokoro:af_heart and the rest)."""

    def __init__(self) -> None:
        super().__init__("kokoro")

    def voices(self) -> list[VoiceInfo]:
        voices = []
        for key in GRADES:
            name, language, gender, _ = describe(key)
            voices.append(
                VoiceInfo(
                    id=f"kokoro:{key}",
                    engine_id="kokoro",
                    name=name,
                    language=language.name,
                    language_code=language.espeak,
                    gender=gender,  # type: ignore[arg-type]
                    category="built-in",
                    available=self.ready,
                )
            )
        return voices


class RawCall:
    """One ``POST /v1/audio/speech`` driven at the ASGI level, on port 8765 of this computer.

    The body arrives in ``chunks``, ``delay`` seconds apart; the client disconnects after ``cut_after``
    chunks, or whenever ``gone`` is set once the body is sent; it reads the answer only while
    ``reading`` is set. ``asked`` counts the body chunks the server asked for.
    """

    def __init__(self, token: str, chunks: list[bytes], *, delay: float = 0.0, cut_after: int | None = None) -> None:
        self.headers = [
            (b"host", f"{LOCAL}:8765".encode()),
            (b"authorization", f"Bearer {token}".encode()),
            (b"content-type", b"application/json"),
        ]
        self.chunks = list(chunks)
        self.delay = delay
        self.cut_after = cut_after
        self.asked = 0
        self.gone = threading.Event()
        self.reading = threading.Event()
        self.reading.set()
        self.started = threading.Event()  # the answer's status line was sent
        self.status: int | None = None
        self.body = b""

    async def _receive(self) -> Message:
        if self.chunks and self.cut_after != self.asked:
            self.asked += 1
            await asyncio.sleep(self.delay)
            chunk = self.chunks.pop(0)
            return {"type": "http.request", "body": chunk, "more_body": bool(self.chunks)}
        if self.chunks:  # cut off part-way through the body
            return {"type": "http.disconnect"}
        while not self.gone.is_set():  # noqa: ASYNC110 - set from the test's own thread
            await asyncio.sleep(0.01)  # still connected (a disconnect check gives up here at once)
        return {"type": "http.disconnect"}

    async def _send(self, message: Message) -> None:
        if message["type"] == "http.response.start":
            self.status = message["status"]
            self.started.set()
        elif message["type"] == "http.response.body":
            while not self.reading.is_set():  # noqa: ASYNC110 - set from the test's own thread
                await asyncio.sleep(0.01)
            self.body += message.get("body", b"")

    def run(self, app: ASGIApp) -> RawCall:
        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST", "scheme": "http",
            "path": "/v1/audio/speech", "raw_path": b"/v1/audio/speech", "query_string": b"", "root_path": "",
            "headers": self.headers, "client": (LOCAL, 50000), "server": (LOCAL, 8765),
        }  # fmt: skip
        asyncio.run(app(scope, self._receive, self._send))  # type: ignore[arg-type]
        return self
