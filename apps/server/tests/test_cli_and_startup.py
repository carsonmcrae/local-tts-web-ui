# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Tests for the CLI's serve and model commands and for application start-up.

Scope: ``ltts serve`` options (network mode with a given or generated token, static UI, browser
opening, auto-reload) without starting a server; download progress on terminals and in logs;
``ltts models ensure``; the uvicorn import target; best-effort engine warm-up; logging setup and
the key=value formatter; the safe 500 response for unexpected errors; the free-disk-space guard.
Does NOT belong: OpenAPI/doctor/verify commands and the public-bind refusal (test_engines_cli.py,
test_security.py).
"""

from __future__ import annotations

import importlib
import logging
import sys
import threading
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
import uvicorn
from fastapi.testclient import TestClient

from conftest import FakeEngine
from ltts import cli
from ltts.app import _warm_up, create_app
from ltts.common import ensure_free_space
from ltts.config import Settings
from ltts.container import build_services
from ltts.errors import InsufficientStorageError
from ltts.logging_setup import KeyValueFormatter, configure_logging
from ltts.modelstore.store import ModelStore

TOKEN = "t" * 32
EXPORTED = ("LTTS_HOST", "LTTS_ALLOW_NETWORK", "LTTS_ACCESS_TOKEN", "LTTS_STATIC_DIR")


@pytest.fixture
def serve_calls(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Records what ``serve`` would start; the variables it exports are restored afterwards."""
    for name in EXPORTED:
        monkeypatch.setenv(name, "")  # recorded first, so whatever serve exports is undone afterwards
        monkeypatch.delenv(name)
    calls: dict[str, Any] = {"timers": []}

    class Timer:
        def __init__(self, delay: float, function: Any, args: tuple[str, ...]) -> None:
            calls["timers"].append((delay, function, args))

        def start(self) -> None:
            return None

    monkeypatch.setattr(uvicorn, "run", lambda app, **options: calls.update(app=app, options=options))
    monkeypatch.setattr(cli, "configure_logging", lambda env: calls.update(logging=env))
    monkeypatch.setattr(cli.threading, "Timer", Timer)
    return calls


def test_serve_on_loopback_by_default(serve_calls: dict[str, Any]) -> None:
    assert cli.main(["serve"]) == 0
    options = serve_calls["options"]
    assert serve_calls["app"] == "ltts.asgi:app" and serve_calls["timers"] == []
    assert options["host"] == "127.0.0.1" and options["port"] == 8765 and options["reload"] is False
    assert options["reload_dirs"] is None and options["server_header"] is False and options["proxy_headers"] is False
    assert cli.os.environ["LTTS_HOST"] == "127.0.0.1" and "LTTS_ALLOW_NETWORK" not in cli.os.environ


def test_serve_on_the_network_with_static_ui_browser_and_reload(
    serve_calls: dict[str, Any], tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("LTTS_ACCESS_TOKEN", TOKEN)
    # Binding every interface is exactly what network mode is for.
    argv = ["serve", "--allow-network", "--host", "0.0.0.0", "--port", "9000", "--static", str(tmp_path), "--open"]  # noqa: S104
    assert cli.main([*argv, "--reload"]) == 0
    assert f"http://<this-computer-ip>:9000/?token={TOKEN}" in capsys.readouterr().out
    environ = cli.os.environ
    assert environ["LTTS_ALLOW_NETWORK"] == "true" and environ["LTTS_ACCESS_TOKEN"] == TOKEN
    assert environ["LTTS_STATIC_DIR"] == str(tmp_path.resolve())
    assert serve_calls["timers"] == [(1.5, cli.webbrowser.open, ("http://127.0.0.1:9000/",))]
    assert serve_calls["options"]["reload"] is True
    assert serve_calls["options"]["reload_dirs"] == [str(Path(cli.__file__).parent)]


def test_network_mode_generates_a_token_when_none_is_set(
    serve_calls: dict[str, Any], capsys: pytest.CaptureFixture[str]
) -> None:
    assert cli.main(["serve", "--allow-network"]) == 0
    token = cli.os.environ["LTTS_ACCESS_TOKEN"]
    assert len(token) >= 24 and f"?token={token}" in capsys.readouterr().out


def test_progress_is_a_bar_on_terminals_and_quarters_in_logs(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli, "_reported_quarters", set())
    for done in (0, 10, 50, 100):
        cli._progress(done * 1_048_576, 100 * 1_048_576, "model.onnx")
    assert capsys.readouterr().out.splitlines() == [
        "    0% (0 of 100 MB)",
        "   50% (50 of 100 MB)",
        "  100% (100 of 100 MB)",
    ]

    written: list[str] = []
    terminal = SimpleNamespace(isatty=lambda: True, write=written.append, flush=lambda: None)
    monkeypatch.setattr(cli, "sys", SimpleNamespace(stdout=terminal))
    cli._progress(15 * 1_048_576, 30 * 1_048_576, "model.onnx")
    assert written == [f"\r  {'model.onnx':<28} [{'#' * 15}{'.' * 15}]    15.0 MB"]


def test_models_ensure_installs_only_when_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("LTTS_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(cli, "configure_logging", lambda env: None)
    installed: list[str] = []
    monkeypatch.setattr(ModelStore, "is_installed", lambda self, artifact: artifact in installed)
    monkeypatch.setattr(ModelStore, "install", lambda self, artifact, progress, canceled: installed.append(artifact))
    assert cli.main(["models", "ensure", "kokoro"]) == 0
    assert installed == ["kokoro-v1.0"] and "installed and verified" in capsys.readouterr().out
    assert cli.main(["models", "ensure", "kokoro"]) == 0
    assert installed == ["kokoro-v1.0"] and "is installed" in capsys.readouterr().out


@pytest.fixture
def root_logging() -> Iterator[logging.Logger]:
    root = logging.getLogger()
    handlers, level = root.handlers[:], root.level
    yield root
    root.handlers[:] = handlers
    root.setLevel(level)


def test_asgi_target_builds_the_app_from_the_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, root_logging: logging.Logger
) -> None:
    static = tmp_path / "dist"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<html>ui</html>", encoding="utf-8")
    monkeypatch.setenv("LTTS_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("LTTS_STATIC_DIR", str(static))
    monkeypatch.setenv("LTTS_ENV", "test")
    monkeypatch.delitem(sys.modules, "ltts.asgi", raising=False)
    module = importlib.import_module("ltts.asgi")
    assert module.app.state.services.settings.resolved_data_dir == (tmp_path / "data").resolve()
    assert any(getattr(route, "path", "") == "/assets" for route in module.app.routes)
    assert root_logging.level == logging.INFO


def test_configure_logging_quiets_noisy_libraries(root_logging: logging.Logger) -> None:
    configure_logging("development")
    assert root_logging.level == logging.DEBUG
    assert isinstance(root_logging.handlers[0].formatter, KeyValueFormatter)
    assert logging.getLogger("httpx").level == logging.WARNING


def test_formatter_without_extras_and_with_a_traceback() -> None:
    try:
        raise ValueError("boom")
    except ValueError:
        record = logging.LogRecord("ltts.t", logging.ERROR, __file__, 1, "failed", None, sys.exc_info())
    line = KeyValueFormatter().format(record)
    assert line.split("\n", 1)[0].endswith("ERROR   ltts.t: failed") and "ValueError: boom" in line


class WarmUpFails(FakeEngine):
    def warm_up(self) -> None:
        raise RuntimeError("no model yet")


class WarmUpSignals(FakeEngine):
    def __init__(self, engine_id: str) -> None:
        super().__init__(engine_id)
        self.warmed = threading.Event()

    def warm_up(self) -> None:
        self.warmed.set()


def test_warm_up_is_best_effort(settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    ok = WarmUpSignals("kokoro")
    services = build_services(settings, isolate_extraction=False, engine_factory=lambda _s, _m: [WarmUpFails("x"), ok])
    with caplog.at_level(logging.WARNING, logger="ltts.app"):
        _warm_up(services)
    assert ok.warmed.is_set() and [r.engine for r in caplog.records] == ["x"]  # type: ignore[attr-defined]


def test_start_up_warms_engines_in_the_background(settings: Settings) -> None:
    engine = WarmUpSignals("kokoro")
    warm = settings.model_copy(update={"warm_up_engines": True})
    services = build_services(warm, isolate_extraction=False, engine_factory=lambda _s, _m: [engine])
    with TestClient(create_app(warm, services=services)):
        assert engine.warmed.wait(5)


class BrokenEngine(FakeEngine):
    def info(self) -> Any:
        raise RuntimeError("internal detail that must not leak")


def test_unexpected_errors_become_a_safe_500(settings: Settings) -> None:
    services = build_services(settings, isolate_extraction=False, engine_factory=lambda _s, _m: [BrokenEngine()])
    app = create_app(settings, services=services)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/engines")
    assert response.status_code == 500 and response.json()["error"]["code"] == "internal_error"
    assert "internal detail" not in response.text


def test_free_space_guard_reports_what_is_needed(tmp_path: Path) -> None:
    with pytest.raises(InsufficientStorageError) as error:
        ensure_free_space(tmp_path, needed_bytes=10**18, reserve_mb=0)
    assert error.value.details["neededBytes"] == 10**18 and error.value.status_code == 507
