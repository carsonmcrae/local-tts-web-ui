# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Unit tests for engine adapters, the worker protocol client, the CLI and app wiring.

Scope: WorkerClient success/error/crash/timeout/idle-stop; Kokoro and Chatterbox engines when not
installed (info, voices, actionable errors, install-option logic); CLI commands (openapi, doctor,
models verify/ensure/remove with a local fake artifact); the log formatter; static SPA serving.
Does NOT belong: Real model inference (test_inference.py).
"""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from ltts.app import create_app
from ltts.cli import main as cli_main
from ltts.config import Settings
from ltts.container import Services
from ltts.engines import chatterbox as chatterbox_module
from ltts.engines.base import VoiceSpec
from ltts.engines.chatterbox import ChatterboxEngine
from ltts.engines.kokoro import KokoroEngine
from ltts.engines.worker_client import WorkerClient, WorkerError
from ltts.errors import ConflictError, EngineUnavailableError
from ltts.hardware import GpuInfo
from ltts.logging_setup import KeyValueFormatter
from ltts.modelstore.store import ModelStore

FAKE_WORKER = Path(__file__).with_name("fake_worker.py")


@pytest.fixture
def worker(tmp_path: Path):  # type: ignore[no-untyped-def]
    client = WorkerClient([sys.executable, "-I", str(FAKE_WORKER)], {}, tmp_path, idle_unload_s=60)
    yield client
    client.stop()


def test_worker_round_trip_and_noise_tolerance(worker: WorkerClient) -> None:
    assert worker.call("ping", 10)["op"] == "ping"
    assert worker.call("noisy", 10)["op"] == "noisy"  # stray stdout lines are ignored
    assert worker.running


def test_worker_errors_crashes_and_timeouts(worker: WorkerClient) -> None:
    with pytest.raises(WorkerError, match="Boom"):
        worker.call("fail", 10)
    with pytest.raises(WorkerError, match="crashed"):
        worker.call("crash", 10)
    assert worker.call("ping", 10)["ok"]  # restarted automatically
    with pytest.raises(WorkerError) as error:
        worker.call("slow", 0.5)
    assert error.value.code == "engine_timeout"
    assert not worker.running


def test_worker_idle_unload(tmp_path: Path) -> None:
    client = WorkerClient([sys.executable, "-I", str(FAKE_WORKER)], {}, tmp_path, idle_unload_s=0.05, idle_check_s=0.02)
    client.call("ping", 10)
    deadline = time.monotonic() + 5
    while client.running and time.monotonic() < deadline:
        time.sleep(0.02)
    assert not client.running


def test_kokoro_not_installed(tmp_path: Path) -> None:
    engine = KokoroEngine(ModelStore(tmp_path, reserve_mb=0))
    info = engine.info()
    assert info.status == "not_installed" and info.install_options[0].download_bytes > 300_000_000
    assert info.controls[0].name == "pace" and not info.supports_cloning
    assert len(engine.voices()) == 54 and not engine.voices()[0].available
    with pytest.raises(EngineUnavailableError) as error:
        engine.synthesize("Hi.", VoiceSpec("af_heart"), 1.0)
    assert error.value.code == "engine_not_installed"
    assert not info.update_available
    with pytest.raises(ConflictError):
        engine.update(None)  # type: ignore[arg-type]


def test_chatterbox_install_options_follow_hardware(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    store = ModelStore(settings.resolved_models_dir, reserve_mb=0)
    engine = ChatterboxEngine(settings, store)
    monkeypatch.setattr(
        chatterbox_module, "detect_gpus", lambda: (GpuInfo(vendor="NVIDIA", name="Test GPU", memory_mb=8000),)
    )
    # Pin the platform so every OS covers both the CUDA and the Apple Silicon branches.
    monkeypatch.setattr(chatterbox_module, "sys", SimpleNamespace(platform="linux"))
    with_gpu = engine.info()
    assert with_gpu.supports_cloning and with_gpu.controls == [] and with_gpu.status == "not_installed"
    assert [(o.id, o.label) for o in with_gpu.install_options] == [("cuda", "NVIDIA GPU (CUDA)"), ("cpu", "CPU only")]
    assert with_gpu.install_options[0].recommended and not with_gpu.install_options[1].recommended
    # macOS never offers CUDA, even if an NVIDIA card is reported.
    monkeypatch.setattr(chatterbox_module, "sys", SimpleNamespace(platform="darwin"))
    mac = engine.info().install_options
    assert [(o.id, o.label) for o in mac] == [("cpu", "Apple Silicon / CPU")] and mac[0].recommended
    monkeypatch.setattr(chatterbox_module, "detect_gpus", lambda: ())
    assert [o.id for o in engine.info().install_options] == ["cpu"]
    assert engine.voices()[0].available is False
    with pytest.raises(EngineUnavailableError):
        engine.synthesize("Hi.", VoiceSpec("default"), 1.0)


def test_chatterbox_install_requires_uv(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    engine = ChatterboxEngine(settings, ModelStore(settings.resolved_models_dir, reserve_mb=0))
    monkeypatch.setattr(chatterbox_module, "find_uv", lambda: None)
    monkeypatch.setattr(chatterbox_module, "detect_gpus", lambda: ())

    class Ctx:
        canceled = False

        def update(self, *_: object, **__: object) -> None: ...

        def check(self) -> None: ...

    with pytest.raises(EngineUnavailableError) as error:
        engine.install(Ctx(), "cpu")  # type: ignore[arg-type]
    assert error.value.code == "uv_missing"
    with pytest.raises(EngineUnavailableError) as invalid:
        engine.install(Ctx(), "cuda")  # type: ignore[arg-type]
    assert invalid.value.code == "invalid_option"


def test_cli_openapi_doctor_and_models(
    capsys: pytest.CaptureFixture[str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LTTS_DATA_DIR", str(tmp_path / "data"))
    assert cli_main(["openapi"]) == 0
    schema = json.loads(capsys.readouterr().out)
    assert "/api/documents/upload" in schema["paths"]
    assert cli_main(["doctor"]) == 0
    assert "Local TTS" in capsys.readouterr().out
    assert cli_main(["models", "verify", "kokoro"]) == 1
    assert cli_main(["models", "remove", "kokoro"]) == 0


def test_key_value_log_formatter() -> None:
    record = logging.makeLogRecord({"name": "ltts.test", "levelname": "INFO", "msg": "hello", "document_id": "abc"})
    line = KeyValueFormatter().format(record)
    assert "ltts.test: hello" in line and "document_id='abc'" in line


def test_static_ui_is_served_with_spa_fallback(settings: Settings, services: Services, tmp_path: Path) -> None:
    static = tmp_path / "dist"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<html>app</html>", encoding="utf-8")
    (static / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    (static / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    with TestClient(create_app(settings, static_dir=static, services=services)) as client:
        assert client.get("/read/abc").text == "<html>app</html>"
        assert client.get("/favicon.svg").text == "<svg/>"
        assert client.get("/assets/app.js").status_code == 200
        assert client.get("/../../etc/passwd").text == "<html>app</html>"
        assert client.get("/api/nope").status_code == 404
