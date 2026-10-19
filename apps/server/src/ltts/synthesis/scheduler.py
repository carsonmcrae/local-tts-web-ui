"""Purpose: Fair, cancellable execution of synthesis work, one engine at a time.

Scope: A priority queue served by one worker thread per engine (playback before previews before
exports), single-flight de-duplication of identical requests, and cancellation of queued work
when every requester has gone away (e.g. the listener skipped ahead).
Does NOT belong: What the work does (``service.py``).
"""

from __future__ import annotations

import itertools
import logging
import queue
import threading
from collections.abc import Callable
from concurrent.futures import Future
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger("ltts.scheduler")

PRIORITY_PLAYBACK = 0
PRIORITY_PREFETCH = 1
PRIORITY_PREVIEW = 2
PRIORITY_EXPORT = 10


@dataclass(order=True)
class _Task:
    priority: int
    seq: int
    key: str = field(compare=False)
    work: Callable[[], Any] = field(compare=False)
    future: Future[Any] = field(compare=False)
    waiters: int = field(default=1, compare=False)


class EngineScheduler:
    def __init__(self, name: str):
        self._queue: queue.PriorityQueue[_Task] = queue.PriorityQueue()
        self._inflight: dict[str, _Task] = {}
        self._lock = threading.Lock()
        self._seq = itertools.count()
        self._thread = threading.Thread(target=self._loop, name=f"synth-{name}", daemon=True)
        self._thread.start()

    def submit(self, key: str, priority: int, work: Callable[[], Any]) -> Future[Any]:
        with self._lock:
            existing = self._inflight.get(key)
            if existing is not None and not existing.future.done():
                existing.waiters += 1
                if priority < existing.priority and not existing.future.running():
                    # Re-queue at the higher priority; the stale entry is skipped when popped.
                    upgraded = _Task(priority, next(self._seq), key, existing.work, existing.future, existing.waiters)
                    self._inflight[key] = upgraded
                    self._queue.put(upgraded)
                return existing.future
            task = _Task(priority, next(self._seq), key, work, Future())
            self._inflight[key] = task
            self._queue.put(task)
            return task.future

    def release(self, key: str) -> None:
        """A requester no longer needs ``key``; cancel it if nobody else is waiting and it hasn't started."""
        with self._lock:
            task = self._inflight.get(key)
            if task is None:
                return
            task.waiters -= 1
            if task.waiters <= 0 and task.future.cancel():
                self._inflight.pop(key, None)

    def pending(self) -> int:
        return self._queue.qsize()

    def _loop(self) -> None:
        while True:
            task = self._queue.get()
            with self._lock:
                current = self._inflight.get(task.key)
                stale = current is not task
            if stale or not task.future.set_running_or_notify_cancel():
                continue
            try:
                task.future.set_result(task.work())
            # Every failure is handed to the waiting caller through the future. SystemExit and
            # KeyboardInterrupt are not caught, so shutdown signals are never swallowed.
            except Exception as exc:  # noqa: BLE001
                task.future.set_exception(exc)
            finally:
                with self._lock:
                    if self._inflight.get(task.key) is task:
                        self._inflight.pop(task.key, None)
