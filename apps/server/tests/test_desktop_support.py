# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for what the server provides to the Windows desktop app.

Scope: Stopping cleanly when the desktop app closes stdin (``serve --exit-with-stdin``; polled, never
read, on Windows), the read-only
models folder bundled with the app (used until the user's own copy exists, never removed from the
app, repaired by copying intact files and downloading only damaged ones), the desktop's worker and
Python locations, and that helper processes never open console windows.
Does NOT belong: The desktop app itself (apps/desktop) or ordinary model downloads (test_modelstore.py).
"""

from __future__ import annotations

import hashlib
import importlib
import io
import json
import signal
import sys
import types
from pathlib import Path
from typing import Any

import httpx
import pytest

from ltts import __version__, cli, common, lifecycle
from ltts.engines import chatterbox_env
from ltts.errors import ConflictError
from ltts.modelstore.store import MARKER, ModelStore

GOOD = b"bundled-model-" * 500
FRESH = b"downloaded-model-" * 400


def _artifact_store(tmp_path: Path, handler: Any, *, bundled: bool = True) -> ModelStore:
    store = ModelStore(
        tmp_path / "models",
        reserve_mb=0,
        client_factory=lambda: httpx.Client(transport=httpx.MockTransport(handler)),
        bundled_dir=tmp_path / "bundled" if bundled else None,
    )
    kokoro = store.artifact("kokoro-v1.0")
    file_type = type(kokoro.files[0])
    store.artifacts = {
        "test": type(kokoro)(
            id="test", engine="kokoro", label="Test model", source="test", license="test",
            files=(
                file_type(name="a.onnx", url="https://github.com/x/a.onnx", size=len(GOOD),
                          sha256=hashlib.sha256(GOOD).hexdigest()),
                file_type(name="b.bin", url="https://github.com/x/b.bin", size=len(FRESH),
                          sha256=hashlib.sha256(FRESH).hexdigest()),
            ),
        )
    }  # fmt: skip
    return store


def _bundle(tmp_path: Path, *, damaged: bool = False) -> Path:
    folder = tmp_path / "bundled" / "test"
    folder.mkdir(parents=True)
    (folder / "a.onnx").write_bytes(GOOD)
    (folder / "b.bin").write_bytes(FRESH[:-1] + b"X" if damaged else FRESH)
    (folder / MARKER).write_text(json.dumps({"artifact": "test"}), encoding="utf-8")
    return folder


def _refuse(request: httpx.Request) -> httpx.Response:
    raise AssertionError(f"unexpected download of {request.url}")


def test_stdin_watch_raises_sigint_once_the_pipe_closes(monkeypatch: pytest.MonkeyPatch) -> None:
    raised: list[int] = []
    monkeypatch.setattr(lifecycle.signal, "raise_signal", raised.append)
    lifecycle.stop_when_stdin_closes(io.StringIO("still open\n"), windows=False).join(timeout=5)
    assert raised == [signal.SIGINT]


def test_an_unreadable_stdin_counts_as_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    class Broken(io.StringIO):
        def read(self, size: int | None = -1) -> str:
            raise OSError("closed")

    raised: list[int] = []
    monkeypatch.setattr(lifecycle.signal, "raise_signal", raised.append)
    monkeypatch.setattr(lifecycle.sys, "stdin", Broken())
    lifecycle.stop_when_stdin_closes(windows=False).join(timeout=5)
    assert raised == [signal.SIGINT]


def test_on_windows_the_pipe_is_polled_never_read(monkeypatch: pytest.MonkeyPatch) -> None:
    """A thread blocked reading a pipe stalls DLL loading on Windows, so the watcher only peeks."""
    peeks: list[tuple[int, int]] = []

    def peek(handle: int, size: int) -> tuple[int, int]:
        peeks.append((handle, size))
        if len(peeks) == 3:
            raise BrokenPipeError("the desktop app closed the pipe")
        return (0, 0)

    monkeypatch.setitem(sys.modules, "_winapi", types.SimpleNamespace(PeekNamedPipe=peek))
    monkeypatch.setitem(sys.modules, "msvcrt", types.SimpleNamespace(get_osfhandle=lambda fd: fd + 1000))
    monkeypatch.setattr(lifecycle, "POLL_S", 0.01)
    raised: list[int] = []
    monkeypatch.setattr(lifecycle.signal, "raise_signal", raised.append)

    class Pipe(io.StringIO):
        def fileno(self) -> int:
            return 7

        def read(self, size: int | None = -1) -> str:
            raise AssertionError("the pipe must not be read")

    lifecycle.stop_when_stdin_closes(Pipe(), windows=True).join(timeout=5)
    assert peeks == [(1007, 0)] * 3
    assert raised == [signal.SIGINT]


def test_serve_can_stop_with_stdin(monkeypatch: pytest.MonkeyPatch) -> None:
    started: list[bool] = []
    monkeypatch.setattr(lifecycle, "stop_when_stdin_closes", lambda: started.append(True))
    monkeypatch.setattr(cli, "configure_logging", lambda env: None)
    monkeypatch.setattr("uvicorn.run", lambda app, **options: None)
    for name in ("LTTS_HOST",):
        monkeypatch.setenv(name, "")
    assert cli.main(["serve", "--exit-with-stdin"]) == 0
    assert started == [True]


def test_the_bundled_model_is_used_until_the_user_has_a_copy(tmp_path: Path) -> None:
    _bundle(tmp_path)
    store = _artifact_store(tmp_path, _refuse)
    assert store.directory("test") == tmp_path / "bundled" / "test"
    assert store.is_bundled("test") and store.verify("test")
    assert store.file_path("test", "a.onnx").read_bytes() == GOOD


def test_without_a_bundle_the_users_folder_is_used(tmp_path: Path) -> None:
    store = _artifact_store(tmp_path, _refuse, bundled=False)
    assert store.directory("test") == tmp_path / "models" / "test"
    assert not store.is_bundled("test")
    empty = _artifact_store(tmp_path, _refuse)  # a bundled folder without this artifact
    assert empty.directory("test") == tmp_path / "models" / "test"


def test_a_bundled_model_cant_be_removed(tmp_path: Path) -> None:
    _bundle(tmp_path)
    store = _artifact_store(tmp_path, _refuse)
    with pytest.raises(ConflictError, match="comes with the TTSNative app"):
        store.remove("test")
    assert (tmp_path / "bundled" / "test" / "a.onnx").is_file()


def test_repair_copies_intact_bundled_files_and_downloads_only_damaged_ones(tmp_path: Path) -> None:
    _bundle(tmp_path, damaged=True)
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(request.url.path)
        return httpx.Response(200, content=FRESH)

    store = _artifact_store(tmp_path, handler)
    assert [item.name for item in store.damage("test", deep=True)] == ["b.bin"]
    store.install("test", lambda done, total, name: None, lambda: False)
    assert requested == ["/x/b.bin"]
    assert store.directory("test") == tmp_path / "models" / "test" and not store.is_bundled("test")
    assert store.verify("test")
    assert (tmp_path / "bundled" / "test" / "b.bin").read_bytes() != FRESH  # the bundle is left as it was


def test_the_desktop_app_sets_the_worker_and_python_locations(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("LTTS_WORKER_PROJECT_DIR", str(tmp_path / "worker"))
    monkeypatch.setenv("LTTS_UV_PYTHON_DIR", str(tmp_path / "python"))
    try:
        reloaded = importlib.reload(chatterbox_env)
        assert tmp_path / "worker" == reloaded.PROJECT_DIR
        assert tmp_path / "python" == reloaded.PYTHON_INSTALL_DIR
    finally:
        monkeypatch.delenv("LTTS_WORKER_PROJECT_DIR")
        monkeypatch.delenv("LTTS_UV_PYTHON_DIR")
        importlib.reload(chatterbox_env)
    assert chatterbox_env.PROJECT_DIR.name == "chatterbox-worker"


def test_helper_processes_never_open_a_console_window() -> None:
    expected = 0x08000000 if sys.platform == "win32" else 0
    assert expected == common.NO_CONSOLE_WINDOW


def test_the_server_reports_the_desktop_apps_build_version(settings: Any, client: Any) -> None:
    assert client.get("/api/health").json()["version"] == __version__
    settings.build_version = "2.1.0-dev.4+feat-x.abc1234"
    assert client.get("/api/health").json()["version"] == "2.1.0-dev.4+feat-x.abc1234"
    assert client.get("/api/system").json()["version"] == "2.1.0-dev.4+feat-x.abc1234"
