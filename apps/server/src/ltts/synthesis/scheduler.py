# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Fair, cancellable, bounded execution of synthesis work, one engine at a time.

Scope: A priority queue served by one worker thread per engine (playback before previews before
exports), single-flight de-duplication of identical requests, cancellation of queued work when
every requester has gone away (e.g. the listener skipped ahead), and a cap on the on-demand renders
(playback, prefetch, previews, the speech API) waiting per engine, whoever asks: past it a new one
is refused with ``synthesis_queue_full``, and a few places are kept for playback so the sentence
someone is waiting to hear can still queue behind a page's prefetches. Exports are not capped here:
each waits for one sentence at a time and the export queue (``jobs.Lane``) bounds how many run.
Does NOT belong: What the work does (``service.py``).
"""

from __future__ import annotations

import heapq
import itertools
import logging
import threading
from collections.abc import Callable
from concurrent.futures import Future
from dataclasses import dataclass, field
from typing import Any

from ltts.errors import BusyError

log = logging.getLogger("ltts.scheduler")

PRIORITY_PLAYBACK = 0
PRIORITY_PREFETCH = 1
PRIORITY_PREVIEW = 2
PRIORITY_EXPORT = 10

# A player asks for the sentence it plays and the next three, so this is about eight listeners at once.
MAX_QUEUED = 32
PLAYBACK_RESERVE = 8  # of those places, only playback may take the last ones
_COMPACT_SLACK = 64  # abandoned entries tolerated in the heap before it is rebuilt without them


class SynthesisQueueFullError(BusyError):
    code = "synthesis_queue_full"


@dataclass(order=True)
class _Task:
    priority: int
    seq: int
    key: str = field(compare=False)
    work: Callable[[], Any] = field(compare=False)
    future: Future[Any] = field(compare=False)
    waiters: int = field(default=1, compare=False)


class EngineScheduler:
    def __init__(self, name: str, *, max_queued: int | None = None, reserve: int | None = None):
        self._heap: list[_Task] = []
        self._inflight: dict[str, _Task] = {}
        self._ready = threading.Condition(threading.Lock())
        self._seq = itertools.count()
        self._max_queued = MAX_QUEUED if max_queued is None else max_queued
        self._reserve = min(PLAYBACK_RESERVE if reserve is None else reserve, self._max_queued)
        self._thread = threading.Thread(target=self._loop, name=f"synth-{name}", daemon=True)
        self._thread.start()

    def submit(self, key: str, priority: int, work: Callable[[], Any]) -> Future[Any]:
        with self._ready:
            existing = self._inflight.get(key)
            if existing is not None and not existing.future.done():
                existing.waiters += 1
                if priority < existing.priority and not existing.future.running():
                    # Re-queue at the higher priority; the stale entry is skipped when popped.
                    upgraded = _Task(priority, next(self._seq), key, existing.work, existing.future, existing.waiters)
                    self._inflight[key] = upgraded
                    self._push(upgraded)
                return existing.future
            self._check_room(priority)
            task = _Task(priority, next(self._seq), key, work, Future())
            self._inflight[key] = task
            self._push(task)
            return task.future

    def _check_room(self, priority: int) -> None:
        """Refuse a new on-demand render when too many already wait (called holding the lock)."""
        if priority >= PRIORITY_EXPORT:
            return
        limit = self._max_queued if priority == PRIORITY_PLAYBACK else self._max_queued - self._reserve
        if self._waiting() >= limit:
            log.info("synthesis queue full", extra={"waiting": self._waiting(), "priority": priority})
            raise SynthesisQueueFullError(
                "This computer is already making a lot of speech. Try again in a moment.",
                details={"limit": self._max_queued},
                headers={"Retry-After": "2"},
            )

    def _waiting(self) -> int:
        return sum(
            1
            for task in self._inflight.values()
            if task.priority < PRIORITY_EXPORT and not (task.future.running() or task.future.done())
        )

    def _push(self, task: _Task) -> None:
        heapq.heappush(self._heap, task)
        self._compact()
        self._ready.notify()

    def _compact(self) -> None:
        """Drop the heap entries nobody waits for any more (released or re-queued) once they pile up."""
        if len(self._heap) > 2 * len(self._inflight) + _COMPACT_SLACK:
            self._heap = [task for task in self._heap if self._inflight.get(task.key) is task]
            heapq.heapify(self._heap)

    def release(self, key: str) -> None:
        """A requester no longer needs ``key``; cancel it if nobody else is waiting and it hasn't started."""
        with self._ready:
            task = self._inflight.get(key)
            if task is None:
                return
            task.waiters -= 1
            if task.waiters <= 0 and task.future.cancel():
                self._inflight.pop(key, None)
                self._compact()

    def pending(self) -> int:
        """Entries in the queue, including abandoned ones not yet skipped."""
        with self._ready:
            return len(self._heap)

    def queued(self) -> int:
        """On-demand renders waiting for the engine (the number the cap applies to)."""
        with self._ready:
            return self._waiting()

    def _loop(self) -> None:
        while True:
            with self._ready:
                while not self._heap:
                    self._ready.wait()
                task = heapq.heappop(self._heap)
                stale = self._inflight.get(task.key) is not task
            if stale or not task.future.set_running_or_notify_cancel():
                continue
            try:
                task.future.set_result(task.work())
            # Every failure is handed to the waiting caller through the future. SystemExit and
            # KeyboardInterrupt are not caught, so shutdown signals are never swallowed.
            except Exception as exc:  # noqa: BLE001
                task.future.set_exception(exc)
            finally:
                with self._ready:
                    if self._inflight.get(task.key) is task:
                        self._inflight.pop(task.key, None)
