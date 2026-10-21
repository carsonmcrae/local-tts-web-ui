# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Shared helpers for the export tests.

Scope: A two-chapter document to export, an export request for it, a hook that runs inside every
synthesis of a fake engine (to pause, block, fail or count), an export that pauses itself part-way
and waiting for a condition to hold.
Does NOT belong: Assertions (test_resumable_exports.py, test_export_limits.py) or the shared
fixtures (conftest.py).
"""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from conftest import FakeEngine, wait_job
from ltts.container import Services
from ltts.engines.base import AudioClip, VoiceSpec

TEXT = "\n\n".join(
    [
        "Chapter 1",
        "The first train left at dawn. The second one waited. A third was late again.",
        "Chapter 2",
        "Nobody knew why. Everyone had a theory. The station master just smiled.",
    ]
)


def document(client: TestClient) -> str:
    doc_id: str = client.post("/api/documents/text", json={"text": TEXT, "title": "Trains"}).json()["id"]
    return doc_id


def request(doc_id: str, **extra: Any) -> dict[str, Any]:
    return {"documentId": doc_id, "voiceId": "kokoro:alpha", "format": "wav", **extra}


def hook(engine: FakeEngine, on_call: Callable[[int, str], None]) -> None:
    """Run ``on_call(call_number, text)`` inside every synthesis (to pause, fail or count)."""
    original = engine.synthesize
    count = {"n": 0}

    def synthesize(text: str, voice: VoiceSpec, pace: float) -> AudioClip:
        count["n"] += 1
        on_call(count["n"], text)
        return original(text, voice, pace)

    engine.synthesize = synthesize  # type: ignore[method-assign]


def paused_export(client: TestClient, services: Services, engine: FakeEngine, after: int) -> tuple[str, str]:
    """Start an export that pauses itself after ``after`` sentences; returns (document, job)."""
    doc_id = document(client)
    job_id: dict[str, str] = {}
    hook(engine, lambda n, _t: services.exports.pause(job_id["id"]) if n == after else None)
    started = client.post("/api/exports", json=request(doc_id)).json()
    job_id["id"] = started["id"]
    wait_job(client, started["id"])
    return doc_id, started["id"]


def until(condition: Callable[[], bool], seconds: float = 5.0) -> None:
    """Wait for ``condition`` to hold (a background job reaching a state)."""
    deadline = time.monotonic() + seconds
    while not condition():
        if time.monotonic() > deadline:
            raise AssertionError("the condition never held")
        time.sleep(0.02)
