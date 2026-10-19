"""Purpose: Tests that a changed Chatterbox worker lock reaches existing installs.

Scope: The install marker records the lock's SHA-256 and extra; a matching lock reports no update, a
changed lock or a legacy marker (no hash) reports one; the update runs as a tracked install job that
re-syncs the recorded extra in place and verifies a model load; a failed update keeps the working
environment and marker; a failed install, verification load or cancel writes no marker; a missing
lock offers nothing; synthesis waits while uv rewrites packages. A tiny script stands in for uv
(run as ``python sync …`` in the worker project) and ``fake_worker.py`` stands in for the worker.
Does NOT belong: The worker protocol client itself (test_engines_cli.py) or real installs.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from collections.abc import Iterator
from pathlib import Path

import pytest

from ltts.config import Settings
from ltts.container import Services
from ltts.engines import chatterbox as chatterbox_module
from ltts.engines.base import VoiceSpec
from ltts.engines.chatterbox import ChatterboxEngine
from ltts.engines.registry import EngineRegistry
from ltts.engines.worker_client import WorkerError
from ltts.errors import ConflictError, EngineUnavailableError
from ltts.jobs import ACTIVE, JobCanceledError, JobManager, JobOut
from ltts.modelstore.store import ModelStore

FAKE_WORKER = Path(__file__).with_name("fake_worker.py")
LOCK_A = 'version = 1\n[[package]]\nname = "diffusers"\nversion = "0.29.0"\n'
LOCK_B = 'version = 1\n[[package]]\nname = "diffusers"\nversion = "0.38.0"\n'
UV_OK = """import sys
print("Resolved 3 packages")
print("flags", *sys.argv[1:3])
print("extra", *sys.argv[-2:])
"""
UV_FAIL = 'import sys\nprint("error: Failed to fetch diffusers-0.38.0 (connection reset)")\nsys.exit(2)\n'


class Ctx:
    canceled = False

    def __init__(self) -> None:
        self.messages: list[str] = []

    def update(self, _progress: float, message: str, **_: object) -> None:
        self.messages.append(message)

    def check(self) -> None: ...


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def write_lock(project: Path, text: str) -> None:
    (project / "uv.lock").write_bytes(text.encode())


def fake_uv(project: Path, script: str) -> None:
    """``find_uv`` returns this Python, so ``uv sync …`` runs as ``python sync …`` in the project dir."""
    (project / "sync").write_text(script, encoding="utf-8")


@pytest.fixture
def engine(settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[ChatterboxEngine]:
    project = tmp_path / "chatterbox-worker"
    project.mkdir()
    write_lock(project, LOCK_A)
    fake_uv(project, UV_OK)
    store = ModelStore(settings.resolved_models_dir, reserve_mb=0)
    monkeypatch.setattr(store, "is_installed", lambda _artifact: True)
    monkeypatch.setattr(store, "install", lambda *_args: None)
    monkeypatch.setattr(chatterbox_module, "find_uv", lambda: sys.executable)
    monkeypatch.setattr(chatterbox_module, "detect_gpus", lambda: ())
    monkeypatch.setattr(chatterbox_module, "ensure_free_space", lambda *_args: None)
    instance = ChatterboxEngine(settings, store, project_dir=project)
    monkeypatch.setattr(instance, "_worker_argv", lambda: [sys.executable, "-I", str(FAKE_WORKER)])
    python = instance._python
    python.parent.mkdir(parents=True)
    python.write_bytes(b"")  # the venv's interpreter only has to exist; the fake worker runs instead
    yield instance
    instance.close()


def marker(engine: ChatterboxEngine) -> dict[str, object]:
    return json.loads(engine._marker.read_text("utf-8"))


def wait(jobs: JobManager, job: JobOut) -> JobOut:
    deadline = time.monotonic() + 15
    while (job := jobs.get(job.id)).status in ACTIVE and time.monotonic() < deadline:
        time.sleep(0.05)
    return job


def test_install_records_lock_hash_and_extra(engine: ChatterboxEngine) -> None:
    ctx = Ctx()
    assert engine.install(ctx, "cpu") == {"option": "cpu", "device": "cpu"}  # type: ignore[arg-type]
    record = marker(engine)
    assert record["lockSha256"] == sha(LOCK_A) and record["extra"] == "cpu" and record["option"] == "cpu"
    assert {"Installing runtime: flags --frozen --no-dev", "Installing runtime: extra --extra cpu"} <= set(ctx.messages)
    info = engine.info()
    assert info.status == "ready" and not info.update_available and info.status_message == "Ready"


def test_matching_lock_offers_no_update(engine: ChatterboxEngine, services: Services) -> None:
    engine.install(Ctx(), "cpu")  # type: ignore[arg-type]
    registry = EngineRegistry([engine], services.jobs)
    with pytest.raises(ConflictError) as error:
        registry.update("chatterbox")
    assert error.value.code == "no_update"


def test_changed_lock_updates_in_place_as_a_tracked_job(engine: ChatterboxEngine, services: Services) -> None:
    engine.install(Ctx(), "cpu")  # type: ignore[arg-type]
    installed_at = marker(engine)["installedAt"]
    write_lock(engine._project, LOCK_B)
    info = engine.info()
    assert info.update_available and info.status == "ready" and info.status_message == "Update available"
    registry = EngineRegistry([engine], services.jobs)
    job = registry.update("chatterbox")
    assert job.kind == "install" and job.payload["update"] is True
    done = wait(services.jobs, job)
    assert done.status == "succeeded" and done.result == {"option": "cpu", "device": "cpu", "updated": True}
    record = marker(engine)
    assert record["lockSha256"] == sha(LOCK_B) and record["installedAt"] == installed_at
    assert not engine.info().update_available and registry.info("chatterbox").status == "ready"
    assert engine.synthesize("Still speaking.", VoiceSpec("default"), 1.0).sample_rate == 24_000


def test_missing_lock_offers_no_update(engine: ChatterboxEngine) -> None:
    engine.install(Ctx(), "cpu")  # type: ignore[arg-type]
    (engine._project / "uv.lock").unlink()
    assert engine.is_ready() and not engine.info().update_available


def test_failed_install_or_verification_writes_no_marker(
    engine: ChatterboxEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_uv(engine._project, UV_FAIL)
    with pytest.raises(EngineUnavailableError) as failed:
        engine.install(Ctx(), "cpu")  # type: ignore[arg-type]
    assert failed.value.code == "install_failed" and not engine._marker.exists()
    fake_uv(engine._project, UV_OK)
    monkeypatch.setattr(engine, "_worker_argv", lambda: [sys.executable, "-c", "raise SystemExit(3)"])
    with pytest.raises(WorkerError):
        engine.install(Ctx(), "cpu")  # type: ignore[arg-type]
    assert not engine._marker.exists() and not engine.is_ready()


def test_cancel_stops_uv(engine: ChatterboxEngine) -> None:
    class Canceled(Ctx):
        canceled = True

        def check(self) -> None:
            raise JobCanceledError

    with pytest.raises(JobCanceledError):
        engine.install(Canceled(), "cpu")  # type: ignore[arg-type]
    assert not engine._marker.exists()


def test_legacy_marker_without_hash_resyncs_recorded_extra(engine: ChatterboxEngine, services: Services) -> None:
    engine._marker.write_text(json.dumps({"option": "cuda", "installedAt": "2026-10-01", "envBytes": 1}), "utf-8")
    assert engine.is_ready() and engine.info().update_available
    registry = EngineRegistry([engine], services.jobs)
    done = wait(services.jobs, registry.update("chatterbox"))
    assert done.status == "succeeded" and done.result is not None and done.result["option"] == "cuda"
    record = marker(engine)
    assert record["extra"] == "cuda" and record["lockSha256"] == sha(LOCK_A)
    assert record["installedAt"] == "2026-10-01" and not engine.info().update_available


def test_failed_update_keeps_the_working_install(engine: ChatterboxEngine, services: Services) -> None:
    engine.install(Ctx(), "cpu")  # type: ignore[arg-type]
    before = marker(engine)
    write_lock(engine._project, LOCK_B)
    fake_uv(engine._project, UV_FAIL)
    registry = EngineRegistry([engine], services.jobs)
    done = wait(services.jobs, registry.update("chatterbox"))
    assert done.status == "failed" and done.error_code == "update_failed"
    assert "Your installation was not removed" in done.message
    assert marker(engine) == before and engine._python.is_file()
    assert engine.is_ready() and engine.info().update_available  # still usable, update still offered
    assert engine._ensure_worker()["device"] == "cpu"


def test_update_requires_an_install_and_blocks_synthesis_meanwhile(engine: ChatterboxEngine) -> None:
    with pytest.raises(EngineUnavailableError) as missing:
        engine.update(Ctx())  # type: ignore[arg-type]
    assert missing.value.code == "engine_not_installed"
    engine.install(Ctx(), "cpu")  # type: ignore[arg-type]
    engine.close()
    engine._updating = True
    with pytest.raises(EngineUnavailableError) as busy:
        engine.synthesize("Hello.", VoiceSpec("default"), 1.0)
    assert busy.value.code == "engine_updating"
