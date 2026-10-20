# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Tests for the audio cache, the engine scheduler and audio helpers.

Scope: Cache key sensitivity (text, voice, pace, engine revision), LRU eviction under a byte limit,
per-voice purge, scheduler priority ordering, single-flight de-duplication and cancellation of
abandoned queued work, and segment finalisation (fades + pauses).
Does NOT belong: HTTP-level checks (test_api.py).
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

import numpy as np

from ltts.audio import PAUSE_SECONDS, encode_wav, finalize_segment, normalize_peak, trim_silence
from ltts.db import Database
from ltts.synthesis.cache import AudioCache, cache_key
from ltts.synthesis.scheduler import EngineScheduler


def make_cache(tmp_path: Path, limit: int) -> AudioCache:
    db = Database(tmp_path / "db.sqlite3")
    db.migrate()
    return AudioCache(tmp_path / "cache", db, limit)


def test_cache_key_changes_with_every_input() -> None:
    base = {
        "engine": "kokoro/1",
        "voice": "kokoro:af_heart",
        "voice_revision": "builtin",
        "pace": 1.0,
        "boundary": "sentence",
        "text": "Hi.",
    }
    keys = {cache_key(**base)}
    for field, value in [
        ("engine", "kokoro/2"),
        ("voice", "kokoro:bm_george"),
        ("pace", 1.1),
        ("text", "Hi!"),
        ("boundary", "section"),
    ]:
        keys.add(cache_key(**{**base, field: value}))
    assert len(keys) == 6
    assert cache_key(**base) == cache_key(**dict(reversed(list(base.items()))))  # order-independent


def test_cache_round_trip_and_lru_eviction(tmp_path: Path) -> None:
    cache = make_cache(tmp_path, limit=2_500)
    for name in ("a", "b", "c"):
        cache.put(name, b"x" * 1_000, 1.0, "kokoro", "v")
        time.sleep(1.1 if name == "a" else 0)  # make "a" clearly the least recently used
    assert cache.get("a") is None  # evicted
    assert cache.get("c") is not None
    assert cache.stats()["bytes"] <= 2_500


def test_cache_purge_by_voice_removes_files(tmp_path: Path) -> None:
    cache = make_cache(tmp_path, limit=10_000)
    kept = cache.put("k1", b"1", 0.1, "kokoro", "keep")
    gone = cache.put("k2", b"2", 0.1, "chatterbox", "custom:abc")
    assert cache.purge_voice("custom:abc") == 1
    assert not gone.path.exists() and kept.path.exists()
    assert cache.clear() == 1


def test_scheduler_runs_by_priority_and_deduplicates() -> None:
    scheduler = EngineScheduler("test")
    gate = threading.Event()
    order: list[str] = []

    def job(name: str):  # type: ignore[no-untyped-def]
        def run() -> str:
            if name == "blocker":
                gate.wait(5)
            order.append(name)
            return name

        return run

    blocker = scheduler.submit("blocker", 0, job("blocker"))
    time.sleep(0.05)
    low = scheduler.submit("export", 10, job("export"))
    high = scheduler.submit("play", 0, job("play"))
    dup = scheduler.submit("play", 0, job("play-duplicate"))
    assert dup is high  # same key shares one future
    gate.set()
    assert blocker.result(5) == "blocker" and high.result(5) == "play" and low.result(5) == "export"
    assert order == ["blocker", "play", "export"]


def test_scheduler_cancels_abandoned_queued_work() -> None:
    scheduler = EngineScheduler("cancel")
    gate = threading.Event()
    scheduler.submit("busy", 0, lambda: gate.wait(5))
    time.sleep(0.05)
    ran: list[str] = []
    future = scheduler.submit("prefetch", 1, lambda: ran.append("prefetch"))
    scheduler.release("prefetch")
    gate.set()
    time.sleep(0.2)
    assert future.cancelled() and ran == []


def test_finalize_segment_adds_boundary_pause_and_fades() -> None:
    rate = 24_000
    tone = np.ones(rate, dtype=np.float32) * 0.5
    out = finalize_segment(tone, rate, "paragraph")
    assert len(out) == rate + int(rate * PAUSE_SECONDS["paragraph"])
    assert out[0] == 0.0 and abs(out[rate // 2] - 0.5) < 1e-6
    assert np.all(out[rate:] == 0)


def test_audio_helpers() -> None:
    rate = 16_000
    signal = np.concatenate([np.zeros(rate), 0.2 * np.ones(rate, dtype=np.float32), np.zeros(rate)]).astype(np.float32)
    trimmed = trim_silence(signal, rate)
    assert rate * 0.9 < len(trimmed) < rate * 1.3
    assert abs(float(np.max(np.abs(normalize_peak(trimmed, -1.0)))) - 10 ** (-1 / 20)) < 1e-4
    assert encode_wav(trimmed, rate)[:4] == b"RIFF"
