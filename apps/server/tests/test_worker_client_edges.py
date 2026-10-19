"""Purpose: Edge-case tests for the worker protocol client that a well-behaved worker never triggers.

Scope: Forwarding worker stderr to the debug log, a process that could not be started, a pipe that
breaks while a request is written, stale replies from an abandoned request, and stopping workers
that have no stdin, ignore the shutdown request or have already exited.
Does NOT belong: Normal round trips, crashes, timeouts and idle unloading (test_engines_cli.py).
"""

from __future__ import annotations

import logging
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from ltts.engines.worker_client import WorkerClient, WorkerError

FAKE_WORKER = Path(__file__).with_name("fake_worker.py")


class Pipe:
    def __init__(self, *, broken: bool = False) -> None:
        self.broken = broken
        self.written: list[str] = []

    def write(self, text: str) -> None:
        if self.broken:
            raise BrokenPipeError
        self.written.append(text)

    def flush(self) -> None:
        return None


class FakeProcess:
    def __init__(self, stdin: Pipe | None, *, running: bool = True, ignores_shutdown: bool = False) -> None:
        self.stdin = stdin
        self.stderr: Any = None
        self._running = running
        self._ignores_shutdown = ignores_shutdown
        self.killed = False

    def poll(self) -> int | None:
        return None if self._running else 0

    def wait(self, timeout: float) -> int:
        if self._ignores_shutdown:
            raise subprocess.TimeoutExpired("worker", timeout)
        self._running = False
        return 0

    def kill(self) -> None:
        self.killed = True
        self._running = False


@pytest.fixture
def client(tmp_path: Path) -> Iterator[WorkerClient]:
    worker = WorkerClient([sys.executable, "-I", str(FAKE_WORKER)], {}, tmp_path, idle_unload_s=60)
    yield worker
    worker.stop()


def test_worker_stderr_is_forwarded_to_the_debug_log(caplog: pytest.LogCaptureFixture) -> None:
    process = FakeProcess(None)
    process.stderr = ["\n", "loading weights\n", "x" * 600 + "\n"]
    with caplog.at_level(logging.DEBUG, logger="ltts.worker"):
        WorkerClient._read_stderr(process)  # type: ignore[arg-type]
    assert [record.getMessage() for record in caplog.records] == ["worker: loading weights", "worker: " + "x" * 500]


def test_a_worker_that_could_not_start_is_reported(client: WorkerClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(client, "_start", lambda: None)
    with pytest.raises(WorkerError, match="could not be started"):
        client.call("ping", 1)


def test_a_broken_pipe_while_sending_stops_the_worker(client: WorkerClient) -> None:
    process = FakeProcess(Pipe(broken=True))
    client._proc = process  # type: ignore[assignment]
    with pytest.raises(WorkerError, match="stopped unexpectedly"):
        client.call("ping", 1)
    assert process.killed and client._proc is None


def test_stale_replies_from_abandoned_requests_are_skipped(client: WorkerClient) -> None:
    assert client.call("ping", 10)["ok"]
    client._replies.put({"id": 999, "ok": False, "error": "LateReply"})  # from a request that timed out
    reply = client.call("ping", 10)
    assert reply["ok"] and reply["op"] == "ping"


@pytest.mark.parametrize(
    ("process", "killed", "shutdown_sent"),
    [
        (FakeProcess(None), True, False),  # no stdin to ask it to stop
        (FakeProcess(Pipe(), ignores_shutdown=True), True, True),
        (FakeProcess(Pipe()), False, True),  # stops when asked
        (FakeProcess(Pipe(), running=False), False, False),  # already exited
    ],
)
def test_stop_asks_politely_then_kills(
    client: WorkerClient, process: FakeProcess, killed: bool, shutdown_sent: bool
) -> None:
    client._proc = process  # type: ignore[assignment]
    client.loaded = {"device": "cpu"}
    client.stop()
    assert process.killed is killed and client.loaded is None and client._proc is None
    assert bool(process.stdin and process.stdin.written) is shutdown_sent
