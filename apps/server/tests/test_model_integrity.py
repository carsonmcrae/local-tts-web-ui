# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for model integrity: damaged files are found, refused before loading and repaired.

Scope: The store's quick and deep checks (missing, incomplete and checksum-failing files), hashes
reused until a file changes, the refusal to hand damaged files to an engine, a repair that downloads
only the damaged file; the API reporting needs_repair, explaining it when a voice is used and running
a repair job; Chatterbox's repair; and what the CLI prints for damaged models.
Does NOT belong: Downloads in general (test_modelstore.py) or Kokoro loading (test_engine_runtime.py).
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import replace
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine, wait_job
from ltts.cli import main as cli_main
from ltts.config import Settings
from ltts.container import Services
from ltts.engines.chatterbox import ChatterboxEngine
from ltts.engines.registry import EngineRegistry
from ltts.errors import ConflictError
from ltts.modelstore import store as store_module
from ltts.modelstore.store import MARKER, ArtifactFile, Damage, ModelDamagedError, ModelStore

MODEL = b"model-bytes-" * 500
VOICES = b"voice-table-" * 200


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def installed(tmp_path: Path, handler: Any = None) -> ModelStore:
    """A store with a two-file test artifact installed and intact."""
    transport = httpx.MockTransport(handler or (lambda _request: httpx.Response(404)))
    store = ModelStore(tmp_path / "models", reserve_mb=0, client_factory=lambda: httpx.Client(transport=transport))
    files = (
        ArtifactFile("model.onnx", "https://github.com/x/model.onnx", len(MODEL), digest(MODEL)),
        ArtifactFile("voices.bin", "https://github.com/x/voices.bin", len(VOICES), digest(VOICES)),
    )
    store.artifacts = {"test": replace(store.artifact("kokoro-v1.0"), id="test", label="Test model", files=files)}
    folder = store.directory("test")
    folder.mkdir(parents=True)
    (folder / "model.onnx").write_bytes(MODEL)
    (folder / "voices.bin").write_bytes(VOICES)
    (folder / MARKER).write_text("{}", encoding="utf-8")
    return store


def corrupt(path: Path) -> None:
    """Same size, different bytes, and a later modification time (as a damaged copy would have)."""
    data = bytearray(path.read_bytes())
    data[100] ^= 0xFF
    path.write_bytes(bytes(data))
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))


@pytest.fixture
def hashes(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Names of the files the store actually hashes."""
    seen: list[str] = []
    real = store_module._sha256

    def counting(path: Path) -> str:
        seen.append(path.name)
        return real(path)

    monkeypatch.setattr(store_module, "_sha256", counting)
    return seen


def test_intact_files_are_hashed_once_until_they_change(tmp_path: Path, hashes: list[str]) -> None:
    store = installed(tmp_path)
    assert store.damage("test") == [] and hashes == []  # the quick check never hashes
    assert store.damage("test", deep=True) == [] and sorted(hashes) == ["model.onnx", "voices.bin"]
    assert store.verify("test") and len(hashes) == 2  # unchanged files are not hashed again
    corrupt(store.file_path("test", "model.onnx"))
    assert store.damage("test") == []  # unknown until hashed in its new state
    assert store.damage("test", deep=True) == [Damage("model.onnx", "checksum")] and len(hashes) == 3
    assert store.damage("test") == [Damage("model.onnx", "checksum")]  # remembered for quick checks
    assert not store.verify("test")


def test_missing_and_incomplete_files_are_found_without_hashing(tmp_path: Path, hashes: list[str]) -> None:
    store = installed(tmp_path)
    store.file_path("test", "voices.bin").unlink()
    store.file_path("test", "model.onnx").write_bytes(MODEL[:1000])  # a truncated download
    damage = store.damage("test", deep=True)
    assert damage == [Damage("model.onnx", "incomplete"), Damage("voices.bin", "missing")] and hashes == []
    assert [item.describe() for item in damage] == [
        "model.onnx has the wrong size (an incomplete or damaged download)",
        "voices.bin is missing",
    ]


def test_an_artifact_that_was_never_installed_is_not_damaged(tmp_path: Path) -> None:
    store = installed(tmp_path)
    store.remove("test")
    assert store.damage("test", deep=True) == [] and not store.is_installed("test")
    assert store._hashes == {}


def test_damaged_files_are_refused_before_loading(tmp_path: Path) -> None:
    store = installed(tmp_path)
    store.require_intact("test")  # intact: no error
    corrupt(store.file_path("test", "voices.bin"))
    with pytest.raises(ModelDamagedError) as error:
        store.require_intact("test")
    assert error.value.code == "model_damaged" and error.value.status_code == 503
    assert error.value.details == {"artifact": "test", "files": ["voices.bin"]}
    assert error.value.message == (
        "Test model needs repair: voices.bin doesn't match its published SHA-256 checksum. Repair downloads "
        "only the damaged files and checks them before use. Open Settings → Engines & models to repair it."
    )


def test_a_repair_downloads_only_the_damaged_file(tmp_path: Path, hashes: list[str]) -> None:
    requested: list[str] = []

    def serve(request: httpx.Request) -> httpx.Response:
        requested.append(request.url.path)
        return httpx.Response(200, content=MODEL)

    store = installed(tmp_path, serve)
    corrupt(store.file_path("test", "model.onnx"))
    store.install("test", lambda *_: None, lambda: False)
    assert requested == ["/x/model.onnx"] and store.file_path("test", "model.onnx").read_bytes() == MODEL
    checked = len(hashes)
    assert store.damage("test", deep=True) == [] and len(hashes) == checked  # the download was already verified
    store.install("test", lambda *_: None, lambda: False)  # nothing damaged: nothing downloaded
    assert requested == ["/x/model.onnx"]


# -- engines through the API ------------------------------------------------------------------
def test_the_api_reports_damage_explains_it_and_repairs(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    engines["kokoro"].damaged = ["kokoro-v1.0.onnx"]
    kokoro = next(engine for engine in client.get("/api/engines").json() if engine["id"] == "kokoro")
    assert kokoro["status"] == "needs_repair" and kokoro["damagedFiles"] == ["kokoro-v1.0.onnx"]
    refused = client.post("/api/voices/kokoro:alpha/preview", json={"text": "Hello."})
    error = refused.json()["error"]
    assert refused.status_code == 503 and error["code"] == "model_damaged"
    assert error["message"] == (
        "Kokoro needs repair: kokoro-v1.0.onnx is damaged. Open Settings → Engines & models to repair it."
    )
    job = wait_job(client, client.post("/api/engines/kokoro/repair").json()["id"])
    assert job["status"] == "succeeded" and job["result"] == {"repaired": ["kokoro-v1.0.onnx"]}
    assert client.post("/api/voices/kokoro:alpha/preview", json={"text": "Hello."}).status_code == 200
    again = client.post("/api/engines/kokoro/repair")
    assert again.status_code == 409 and again.json()["error"]["code"] == "no_repair_needed"


def test_a_repair_already_running_is_returned_instead_of_starting_another(
    services: Services, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    registry = EngineRegistry([engines["kokoro"]], services.jobs)
    running = object()
    monkeypatch.setattr(services.jobs, "find_active", lambda kind, key: running)
    assert registry.repair("kokoro") is running
    monkeypatch.setattr(services.jobs, "find_active", lambda kind, key: None)
    with pytest.raises(ConflictError):
        registry.repair("kokoro")


def test_chatterbox_reports_damage_and_repairs_only_the_weights(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = ModelStore(settings.resolved_models_dir, reserve_mb=0)
    engine = ChatterboxEngine(settings, store)
    monkeypatch.setattr(store, "damage", lambda _artifact, deep=False: [Damage("t3_turbo_v1.safetensors", "missing")])
    info = engine.info()
    assert info.status == "needs_repair" and info.damaged_files == ["t3_turbo_v1.safetensors"]
    assert info.status_message.startswith("The Chatterbox model needs repair: t3_turbo_v1.safetensors is missing.")
    assert not engine.is_ready()

    class Ctx:
        canceled = False

        def __init__(self) -> None:
            self.updates: list[str] = []

        def update(self, progress: float, message: str, **_: object) -> None:
            self.updates.append(message)

    def install(artifact: str, progress: Any, canceled: Any) -> None:
        assert artifact == "chatterbox-turbo" and canceled() is False
        progress(2 * 1_048_576, 4 * 1_048_576, "t3_turbo_v1.safetensors")

    monkeypatch.setattr(store, "install", install)
    stopped: list[bool] = []
    monkeypatch.setattr(engine, "close", lambda: stopped.append(True))
    ctx = Ctx()
    assert engine.repair(ctx) == {"artifact": "chatterbox-turbo", "repaired": True}  # type: ignore[arg-type]
    assert ctx.updates == ["Downloading t3_turbo_v1.safetensors (2 / 4 MB)"] and stopped == [True]


# -- CLI -----------------------------------------------------------------------------------------
def test_the_cli_names_damaged_files_and_downloads_them_again(
    capsys: pytest.CaptureFixture[str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LTTS_DATA_DIR", str(tmp_path / "data"))
    damage = [Damage("kokoro-v1.0.onnx", "checksum")]
    installs: list[str] = []
    monkeypatch.setattr(ModelStore, "damage", lambda _self, _artifact, deep=False: list(damage))
    monkeypatch.setattr(ModelStore, "is_installed", lambda _self, _artifact: True)
    monkeypatch.setattr(ModelStore, "install", lambda _self, artifact, *_: installs.append(artifact))
    assert cli_main(["models", "verify", "kokoro"]) == 1
    assert "kokoro-v1.0.onnx doesn't match its published SHA-256 checksum" in capsys.readouterr().out
    assert cli_main(["doctor"]) == 0
    assert "DAMAGED: kokoro-v1.0.onnx doesn't match" in capsys.readouterr().out
    assert cli_main(["models", "ensure", "kokoro"]) == 0
    out = capsys.readouterr().out
    assert "! kokoro-v1.0.onnx doesn't match its published SHA-256 checksum: downloading it again" in out
    assert installs == ["kokoro-v1.0"]
    damage.clear()
    assert cli_main(["models", "ensure", "kokoro"]) == 0
    assert "is installed and verified" in capsys.readouterr().out and installs == ["kokoro-v1.0"]
