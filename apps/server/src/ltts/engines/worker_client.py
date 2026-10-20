# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Drive an engine worker subprocess over a JSON-lines stdio protocol.

Scope: Starts the worker with a fixed argv (no shell), serialises requests with a lock, enforces
per-request timeouts, forwards worker stderr to the log, restarts after crashes, and stops the
process after an idle period to release GPU/CPU memory.
Does NOT belong: Engine-specific request contents (``chatterbox.py``).
"""

from __future__ import annotations

import itertools
import json
import logging
import queue
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from ltts.errors import SynthesisError

log = logging.getLogger("ltts.worker")


class WorkerError(SynthesisError):
    code = "engine_worker_failed"


class WorkerClient:
    def __init__(
        self, argv: list[str], env: dict[str, str], cwd: Path, idle_unload_s: float, idle_check_s: float = 15.0
    ):
        self._argv = argv
        self._env = env
        self._cwd = cwd
        self._idle_unload_s = idle_unload_s
        self._idle_check_s = idle_check_s
        self._proc: subprocess.Popen[str] | None = None
        self._replies: queue.Queue[dict[str, Any]] = queue.Queue()
        self._lock = threading.Lock()
        self._ids = itertools.count(1)
        self._last_used = time.monotonic()
        self.loaded: dict[str, Any] | None = None
        threading.Thread(target=self._idle_watch, name="worker-idle", daemon=True).start()

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def _start(self) -> None:
        self._replies = queue.Queue()
        # Popen's encoding argument needs Python 3.6; the server requires 3.11.
        # The argv is fixed and built by the server, and no shell is involved.
        # nosemgrep: python.lang.compatibility.python36.python36-compatibility-Popen2
        self._proc = subprocess.Popen(  # noqa: S603
            self._argv,
            cwd=self._cwd,
            env=self._env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        proc = self._proc
        threading.Thread(target=self._read_stdout, args=(proc,), daemon=True).start()
        threading.Thread(target=self._read_stderr, args=(proc,), daemon=True).start()

    def _read_stdout(self, proc: subprocess.Popen[str]) -> None:
        for line in proc.stdout or ():
            try:
                self._replies.put(json.loads(line))
            except json.JSONDecodeError:
                log.warning("worker wrote a non-protocol line to stdout")

    @staticmethod
    def _read_stderr(proc: subprocess.Popen[str]) -> None:
        for line in proc.stderr or ():
            if line.strip():
                log.debug("worker: %s", line.rstrip()[:500])

    def call(self, op: str, timeout_s: float, **fields: Any) -> dict[str, Any]:
        with self._lock:
            if not self.running:
                self._start()
            if self._proc is None or self._proc.stdin is None:
                raise WorkerError("The voice engine process could not be started.")
            request_id = next(self._ids)
            try:
                self._proc.stdin.write(json.dumps({"id": request_id, "op": op, **fields}) + "\n")
                self._proc.stdin.flush()
            except OSError as exc:
                self.stop()
                raise WorkerError("The voice engine process stopped unexpectedly.") from exc
            deadline = time.monotonic() + timeout_s
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    self.stop()
                    raise WorkerError("The voice engine took too long and was restarted.", code="engine_timeout")
                try:
                    reply = self._replies.get(timeout=min(remaining, 1.0))
                except queue.Empty:
                    if not self.running:
                        self.stop()
                        raise WorkerError("The voice engine process crashed. See the server log.") from None
                    continue
                if reply.get("id") == request_id:
                    break
            self._last_used = time.monotonic()
        if not reply.get("ok"):
            raise WorkerError(f"The voice engine reported an error ({reply.get('error', 'unknown')}).")
        return reply

    def stop(self) -> None:
        proc, self._proc = self._proc, None
        self.loaded = None
        if proc is None or proc.poll() is not None:
            return
        try:
            if proc.stdin is None:
                raise OSError
            proc.stdin.write(json.dumps({"op": "shutdown"}) + "\n")
            proc.stdin.flush()
            proc.wait(timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            proc.kill()

    def _idle_watch(self) -> None:
        while True:
            time.sleep(self._idle_check_s)
            idle = time.monotonic() - self._last_used
            if self.running and idle > self._idle_unload_s and self._lock.acquire(blocking=False):
                try:
                    log.info("stopping idle voice engine worker to free memory")
                    self.stop()
                finally:
                    self._lock.release()
