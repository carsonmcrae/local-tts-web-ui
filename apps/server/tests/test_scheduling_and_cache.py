# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Tests for scheduler, audio cache and synthesis-service paths beyond the common flow.

Scope: Raising a queued request's priority, releasing shared, unknown or running work, failures
delivered through the future, a repeat request arriving as the previous one completes; cache
entries whose file vanished or that exceed the whole limit; empty engine audio, cancelled export
waits, engine errors and disconnected listeners in the synthesis service; audio helper edge cases.
Does NOT belong: Basic priority/de-duplication/LRU checks (test_synthesis.py) or HTTP routes.
"""

from __future__ import annotations

import asyncio
import threading
import time
from concurrent.futures import Future
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from conftest import SAMPLE_RATE, FakeEngine
from ltts.audio import apply_fades, frame_rms_db, normalize_peak, trim_silence
from ltts.config import Settings
from ltts.container import Services, build_services
from ltts.db import Database
from ltts.engines.base import AudioClip, VoiceSpec
from ltts.errors import SynthesisError
from ltts.synthesis.cache import AudioCache
from ltts.synthesis.scheduler import PRIORITY_EXPORT, PRIORITY_PLAYBACK, PRIORITY_PREVIEW, EngineScheduler
from ltts.synthesis.service import ClientGoneError


def blocked(scheduler: EngineScheduler) -> threading.Event:
    """Occupy the scheduler's worker until the returned event is set."""
    gate = threading.Event()
    started = threading.Event()

    def hold() -> None:
        started.set()
        gate.wait(10)

    scheduler.submit("gate", PRIORITY_PLAYBACK, hold)
    assert started.wait(5)
    return gate


def test_a_more_urgent_request_raises_the_queued_priority() -> None:
    scheduler = EngineScheduler("upgrade")
    gate = blocked(scheduler)
    order: list[str] = []
    export = scheduler.submit("a", PRIORITY_EXPORT, lambda: order.append("a"))
    scheduler.submit("b", PRIORITY_PREVIEW, lambda: order.append("b"))
    assert scheduler.submit("a", PRIORITY_PLAYBACK, lambda: order.append("never")) is export
    assert scheduler.pending() == 3  # the outdated low-priority entry stays queued but is skipped
    gate.set()
    export.result(5)
    deadline = time.monotonic() + 5
    while len(order) < 2 and time.monotonic() < deadline:
        time.sleep(0.01)
    assert order == ["a", "b"]


def test_release_only_cancels_work_nobody_else_waits_for() -> None:
    scheduler = EngineScheduler("release")
    gate = blocked(scheduler)
    scheduler.release("unknown")  # nothing to do
    shared = scheduler.submit("shared", PRIORITY_PREVIEW, lambda: "spoken")
    scheduler.submit("shared", PRIORITY_PREVIEW, lambda: "spoken")
    scheduler.release("shared")
    assert not shared.cancelled()  # the second requester still wants it
    scheduler.release("gate")  # already running: cannot be cancelled
    gate.set()
    assert shared.result(5) == "spoken"


def test_failures_reach_the_caller_and_the_queue_keeps_running() -> None:
    scheduler = EngineScheduler("failures")

    def broken() -> None:
        raise ValueError("engine failed")

    with pytest.raises(ValueError, match="engine failed"):
        scheduler.submit("bad", PRIORITY_PLAYBACK, broken).result(5)
    assert scheduler.submit("good", PRIORITY_PLAYBACK, lambda: "fine").result(5) == "fine"


def test_a_repeat_request_during_completion_gets_its_own_run() -> None:
    scheduler = EngineScheduler("repeat")
    gate = blocked(scheduler)
    repeats: list[Future[Any]] = []
    first = scheduler.submit("k", PRIORITY_PLAYBACK, lambda: "first")
    # Runs on the worker inside set_result, before the finished task is cleaned up.
    first.add_done_callback(lambda _: repeats.append(scheduler.submit("k", PRIORITY_PLAYBACK, lambda: "second")))
    gate.set()
    assert first.result(5) == "first"
    deadline = time.monotonic() + 5
    while not repeats and time.monotonic() < deadline:
        time.sleep(0.01)
    assert repeats[0] is not first and repeats[0].result(5) == "second"


# -- cache ------------------------------------------------------------------------------
def make_cache(tmp_path: Path, limit: int) -> AudioCache:
    db = Database(tmp_path / "db.sqlite3")
    db.migrate()
    return AudioCache(tmp_path / "cache", db, limit)


def test_a_cache_entry_whose_file_vanished_is_forgotten(tmp_path: Path) -> None:
    cache = make_cache(tmp_path, 10_000)
    entry = cache.put("k", b"audio", 0.5, "kokoro", "kokoro:v")
    entry.path.unlink()
    assert cache.get("k") is None and cache.stats()["entries"] == 0


def test_an_entry_larger_than_the_whole_cache_is_evicted_at_once(tmp_path: Path) -> None:
    cache = make_cache(tmp_path, 500)
    cache.put("huge", b"x" * 1_000, 1.0, "kokoro", "kokoro:v")
    assert cache.get("huge") is None and cache.stats() == {"entries": 0, "bytes": 0, "limitBytes": 500}


# -- synthesis service ------------------------------------------------------------------------
class ScriptedEngine(FakeEngine):
    """Returns no audio, raises an application error or crashes, depending on the text."""

    def synthesize(self, text: str, voice: VoiceSpec, pace: float) -> AudioClip:
        if text == "Silence.":
            return AudioClip(np.zeros(0, dtype=np.float32), SAMPLE_RATE)
        if text == "Refused.":
            raise SynthesisError("The engine refused.", code="engine_refused")
        if text == "Crash.":
            raise RuntimeError("segfault-like failure")
        return super().synthesize(text, voice, pace)


@pytest.fixture
def scripted(settings: Settings) -> Services:
    return build_services(settings, isolate_extraction=False, engine_factory=lambda _s, _m: [ScriptedEngine("kokoro")])


def never_disconnected() -> Any:
    async def check() -> bool:
        return False

    return check


def test_engine_audio_problems_become_clear_errors(scripted: Services) -> None:
    synthesis = scripted.synthesis
    with pytest.raises(SynthesisError) as empty:
        synthesis.render_blocking("kokoro:alpha", "Silence.", "sentence", 1.0, PRIORITY_EXPORT, lambda: False)
    assert empty.value.code == "empty_audio"
    with pytest.raises(SynthesisError) as refused:
        asyncio.run(
            synthesis.render("kokoro:alpha", "Refused.", "sentence", 1.0, PRIORITY_PREVIEW, never_disconnected())
        )
    assert refused.value.code == "engine_refused"  # application errors pass through unchanged
    with pytest.raises(SynthesisError, match="Speech generation failed") as crashed:
        asyncio.run(synthesis.render("kokoro:alpha", "Crash.", "sentence", 1.0, PRIORITY_PREVIEW, never_disconnected()))
    assert crashed.value.code == "synthesis_failed"


def test_a_cancelled_export_stops_waiting_and_releases_its_work(scripted: Services) -> None:
    synthesis = scripted.synthesis
    gate = blocked(synthesis._scheduler("kokoro"))
    checks = iter([False, True])
    with pytest.raises(TimeoutError):
        synthesis.render_blocking("kokoro:alpha", "Queued.", "sentence", 1.0, PRIORITY_EXPORT, lambda: next(checks))
    gate.set()
    # Work queued after the abandoned request only finishes once the queue has moved past it.
    synthesis._scheduler("kokoro").submit("after", PRIORITY_EXPORT, lambda: None).result(5)
    engine = scripted.engines.get("kokoro")
    assert isinstance(engine, ScriptedEngine) and engine.calls == []


def test_a_listener_who_leaves_releases_the_queued_work(scripted: Services) -> None:
    synthesis = scripted.synthesis
    gate = blocked(synthesis._scheduler("kokoro"))
    answers = iter([False, True])

    async def disconnected() -> bool:
        return next(answers)

    with pytest.raises(ClientGoneError):
        asyncio.run(synthesis.render("kokoro:alpha", "Skipped.", "sentence", 1.0, PRIORITY_PLAYBACK, disconnected))
    gate.set()
    synthesis._scheduler("kokoro").submit("after", PRIORITY_EXPORT, lambda: None).result(5)
    assert synthesis.cached_or_none("kokoro:alpha", "Skipped.", "sentence", 1.0) is None  # never synthesised


def test_purging_a_voice_removes_its_cached_audio(scripted: Services) -> None:
    synthesis = scripted.synthesis
    synthesis.render_blocking("kokoro:alpha", "Keep me.", "sentence", 1.0, PRIORITY_EXPORT, lambda: False)
    assert synthesis.purge_voice("kokoro:alpha") == 1 and synthesis.purge_voice("kokoro:alpha") == 0


# -- audio helpers --------------------------------------------------------------------------------
def test_audio_helpers_handle_tiny_and_silent_clips() -> None:
    one = np.array([0.5], dtype=np.float32)
    assert apply_fades(one, SAMPLE_RATE).tolist() == [0.5]  # too short to fade
    silence = np.zeros(SAMPLE_RATE, dtype=np.float32)
    assert normalize_peak(silence) is silence and normalize_peak(silence[:0]).size == 0
    assert frame_rms_db(one, SAMPLE_RATE).tolist() == [-120.0]
    assert trim_silence(silence, SAMPLE_RATE).size == 0
