# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for engine runtime behaviour with stand-ins for the model libraries and hardware tools.

Scope: Kokoro loading (CPU provider, load once, load failures, the double-checked lock), voices,
pace clamping, synthesis errors and unusable audio, damaged files and repair, install/uninstall and
warm-up; Chatterbox revision, worker argv,
uninstall and a worker that disappears before synthesis; locating uv and reporting its output;
and GPU detection through nvidia-smi and on Apple Silicon.
Does NOT belong: The worker protocol (test_engines_cli.py, test_worker_client_edges.py), environment
updates (test_chatterbox_update.py) or real inference (test_inference.py).
"""

from __future__ import annotations

import subprocess
import sys
import types
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any, ClassVar

import numpy as np
import pytest

from ltts import hardware
from ltts.config import Settings
from ltts.engines import chatterbox_env
from ltts.engines.base import VoiceSpec
from ltts.engines.chatterbox import ChatterboxEngine
from ltts.engines.kokoro import ARTIFACT, KokoroEngine
from ltts.errors import EngineUnavailableError, SynthesisError
from ltts.hardware import GpuInfo, detect_gpus
from ltts.modelstore.store import Damage, ModelDamagedError, ModelStore


class FakeKokoro:
    """Stands in for kokoro_onnx.Kokoro: two voices, silent audio, and a failure on demand."""

    loads: ClassVar[list[tuple[Any, str]]] = []  # replaced per test by the fixture
    fail_load = False

    def __init__(self) -> None:
        self.created: list[tuple[str, str, float, str]] = []

    @classmethod
    def from_session(cls, session: Any, voices_path: str) -> FakeKokoro:
        if cls.fail_load:
            raise RuntimeError("bad model file")
        cls.loads.append((session, voices_path))
        return cls()

    def get_voices(self) -> list[str]:
        return ["bf_emma", "af_heart"]

    def create(self, text: str, voice: str, speed: float, lang: str) -> tuple[np.ndarray, int]:
        if text == "unspeakable":
            raise ValueError("phonemes failed")
        self.created.append((text, voice, speed, lang))
        if text == "silence":
            return np.zeros(0, dtype=np.float64), 24_000
        if text == "nan":
            return np.full(240, np.nan), 24_000  # what a damaged model file produced
        return np.zeros(240, dtype=np.float64), 24_000


class Ctx:
    canceled = False

    def __init__(self) -> None:
        self.updates: list[tuple[float, str]] = []

    def update(self, progress: float, message: str, **_: object) -> None:
        self.updates.append((progress, message))

    def check(self) -> None: ...


@pytest.fixture
def kokoro(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> KokoroEngine:
    runtime = types.ModuleType("onnxruntime")
    runtime.InferenceSession = lambda path, providers: SimpleNamespace(path=path, providers=providers)  # type: ignore[attr-defined]
    library = types.ModuleType("kokoro_onnx")
    library.Kokoro = FakeKokoro  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "onnxruntime", runtime)
    monkeypatch.setitem(sys.modules, "kokoro_onnx", library)
    monkeypatch.setattr(FakeKokoro, "loads", [])
    monkeypatch.setattr(FakeKokoro, "fail_load", False)
    store = ModelStore(tmp_path, reserve_mb=0)
    monkeypatch.setattr(store, "is_installed", lambda _artifact: True)
    return KokoroEngine(store)


def test_kokoro_loads_once_on_the_cpu_and_speaks(kokoro: KokoroEngine) -> None:
    info = kokoro.info()
    assert info.status == "ready" and info.status_message == "Ready" and info.device == "cpu"
    clip = kokoro.synthesize("Hello.", VoiceSpec("af_heart", language_code="en-us"), 5.0)
    assert clip.sample_rate == 24_000 and clip.samples.dtype == np.float32 and len(clip.samples) == 240
    kokoro.synthesize("Slow.", VoiceSpec("bf_emma", language_code="en-gb"), 0.1)
    session, voices_path = FakeKokoro.loads[0]
    assert len(FakeKokoro.loads) == 1 and session.providers == ["CPUExecutionProvider"]
    assert session.path.endswith("kokoro-v1.0.onnx") and voices_path.endswith("voices-v1.0.bin")
    assert kokoro._model.created == [("Hello.", "af_heart", 2.0, "en-us"), ("Slow.", "bf_emma", 0.5, "en-gb")]
    assert [v.id for v in kokoro.voices()] == ["kokoro:af_heart", "kokoro:bf_emma"]  # the model's own voice list
    assert kokoro.revision() == f"{ARTIFACT}/kokoro-onnx-0.6"


def test_kokoro_rejects_unknown_voices_and_reports_failed_passages(kokoro: KokoroEngine) -> None:
    with pytest.raises(SynthesisError) as unknown:
        kokoro.synthesize("Hi.", VoiceSpec("zz_nobody"), 1.0)
    assert unknown.value.code == "voice_not_found"
    with pytest.raises(SynthesisError, match="couldn't speak"):
        kokoro.synthesize("unspeakable", VoiceSpec("af_heart"), 1.0)


def test_kokoro_refuses_empty_or_non_finite_audio(kokoro: KokoroEngine) -> None:
    for text in ("silence", "nan"):
        with pytest.raises(SynthesisError) as error:
            kokoro.synthesize(text, VoiceSpec("af_heart"), 1.0)
        assert error.value.code == "synthesis_invalid_audio"


def test_kokoro_refuses_damaged_files_and_a_repair_reinstalls_them(
    kokoro: KokoroEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    damage = [Damage("kokoro-v1.0.onnx", "checksum")]

    def require_intact(artifact: str) -> None:
        if damage:
            raise ModelDamagedError("damaged")

    monkeypatch.setattr(kokoro._store, "require_intact", require_intact)
    with pytest.raises(ModelDamagedError):
        kokoro.warm_up()  # checksums are known only once the files are hashed before loading
    monkeypatch.setattr(kokoro._store, "damage", lambda _artifact, deep=False: list(damage))
    info = kokoro.info()
    assert info.status == "needs_repair" and info.damaged_files == ["kokoro-v1.0.onnx"]
    assert info.status_message.startswith("The Kokoro model needs repair: kokoro-v1.0.onnx doesn't match")
    assert not kokoro.is_ready() and FakeKokoro.loads == []

    def install(artifact: str, progress: Any, canceled: Any) -> None:
        damage.clear()

    monkeypatch.setattr(kokoro._store, "install", install)
    assert kokoro.repair(Ctx()) == {"artifact": ARTIFACT}  # type: ignore[arg-type]
    assert kokoro.info().status == "ready" and len(FakeKokoro.loads) == 1


def test_kokoro_load_failure_is_reported_until_a_load_succeeds(kokoro: KokoroEngine) -> None:
    FakeKokoro.fail_load = True
    with pytest.raises(EngineUnavailableError) as error:
        kokoro.warm_up()
    assert error.value.code == "engine_load_failed"
    info = kokoro.info()
    assert info.status == "error" and info.status_message == "Installed, but failed to load (RuntimeError)"
    FakeKokoro.fail_load = False
    kokoro.warm_up()
    assert kokoro.info().status == "ready"


def test_kokoro_warm_up_skips_a_missing_model(kokoro: KokoroEngine, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(kokoro._store, "is_installed", lambda _artifact: False)
    kokoro.warm_up()
    assert FakeKokoro.loads == []


def test_kokoro_reuses_a_model_loaded_while_it_waited_for_the_lock(kokoro: KokoroEngine) -> None:
    loaded_elsewhere = object()

    class LockWonByAnotherLoader:
        def __enter__(self) -> None:
            kokoro._model = loaded_elsewhere  # another request finished loading first

        def __exit__(self, *_: object) -> None:
            return None

    kokoro._lock = LockWonByAnotherLoader()  # type: ignore[assignment]
    assert kokoro._ensure_loaded() is loaded_elsewhere
    assert FakeKokoro.loads == []


def test_kokoro_install_reports_progress_then_loads_and_uninstall_removes(
    kokoro: KokoroEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    removed: list[str] = []

    def install(artifact: str, progress: Any, canceled: Any) -> None:
        assert artifact == ARTIFACT and canceled() is False
        progress(1_048_576, 4 * 1_048_576, "kokoro-v1.0.onnx")

    monkeypatch.setattr(kokoro._store, "install", install)
    monkeypatch.setattr(kokoro._store, "remove", removed.append)
    ctx = Ctx()
    assert kokoro.install(ctx, None) == {"artifact": ARTIFACT}  # type: ignore[arg-type]
    assert ctx.updates == [(0.25, "Downloading kokoro-v1.0.onnx (1 / 4 MB)"), (1.0, "Loading model…")]
    assert kokoro._model is not None
    kokoro.uninstall()
    assert kokoro._model is None and removed == [ARTIFACT]


# -- Chatterbox ---------------------------------------------------------------------------
@pytest.fixture
def chatterbox(settings: Settings) -> ChatterboxEngine:
    return ChatterboxEngine(settings, ModelStore(settings.resolved_models_dir, reserve_mb=0))


def test_chatterbox_identity_and_worker_command(chatterbox: ChatterboxEngine) -> None:
    assert chatterbox.revision() == "chatterbox-turbo/worker-1"
    argv = chatterbox._worker_argv()
    assert argv[1:] == ["-I", "-m", "ltts_chatterbox_worker"] and argv[0] == str(chatterbox._python)


def test_chatterbox_uninstall_removes_environment_and_weights(
    chatterbox: ChatterboxEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    removed: list[str] = []
    monkeypatch.setattr(chatterbox._store, "remove", removed.append)
    chatterbox._root.mkdir(parents=True)
    (chatterbox._root / "installed.json").write_text("{}", encoding="utf-8")
    chatterbox.uninstall()
    assert not chatterbox._root.exists() and removed == ["chatterbox-turbo"]


def test_chatterbox_reports_a_worker_that_vanished_before_synthesis(
    chatterbox: ChatterboxEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(chatterbox, "is_ready", lambda: True)
    monkeypatch.setattr(chatterbox, "_ensure_worker", lambda: {})  # closed by another thread meanwhile
    with pytest.raises(EngineUnavailableError) as error:
        chatterbox.synthesize("Hi.", VoiceSpec("default"), 1.0)
    assert error.value.code == "engine_load_failed"


# -- uv -----------------------------------------------------------------------------------
def test_find_uv_prefers_the_explicit_then_the_pinned_binary(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    explicit = tmp_path / "custom-uv"
    explicit.write_bytes(b"")
    monkeypatch.setenv("LTTS_UV_BIN", str(explicit))
    assert chatterbox_env.find_uv() == str(explicit)

    monkeypatch.setenv("LTTS_UV_BIN", str(tmp_path / "missing-uv"))
    monkeypatch.setattr(chatterbox_env, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(chatterbox_env, "sys", SimpleNamespace(platform="linux"))
    for version in ("0.8.0", "0.9.1"):
        pinned = tmp_path / ".tools" / "uv" / version / "uv"
        pinned.parent.mkdir(parents=True)
        pinned.write_bytes(b"")
    assert chatterbox_env.find_uv() == str(tmp_path / ".tools" / "uv" / "0.9.1" / "uv")

    monkeypatch.setattr(chatterbox_env, "sys", SimpleNamespace(platform="win32"))  # no uv.exe is pinned
    monkeypatch.setattr(chatterbox_env.shutil, "which", lambda name: f"/usr/local/bin/{name}")
    assert chatterbox_env.find_uv() == "/usr/local/bin/uv"


def test_sync_reports_only_non_blank_uv_output(tmp_path: Path) -> None:
    (tmp_path / "sync").write_text('print("Resolved 3 packages")\nprint()\nprint("   ")\nprint("Done")\n', "utf-8")
    ctx = Ctx()
    chatterbox_env.sync_environment(sys.executable, tmp_path, tmp_path / "venv", "cpu", ctx, update=True)  # type: ignore[arg-type]
    assert [message for _, message in ctx.updates] == [
        "Updating runtime: Resolved 3 packages",
        "Updating runtime: Done",
    ]


def test_tree_bytes_counts_files_and_tolerates_a_missing_folder(tmp_path: Path) -> None:
    assert chatterbox_env.tree_bytes(tmp_path / "absent") == 0
    (tmp_path / "nested").mkdir()
    (tmp_path / "nested" / "a.bin").write_bytes(b"12345")
    (tmp_path / "b.bin").write_bytes(b"123")
    assert chatterbox_env.tree_bytes(tmp_path) == 8


# -- hardware -----------------------------------------------------------------------------
@pytest.fixture
def fresh_gpu_cache() -> Iterator[None]:
    detect_gpus.cache_clear()
    yield
    detect_gpus.cache_clear()


def fake_smi(monkeypatch: pytest.MonkeyPatch, run: Any) -> None:
    monkeypatch.setattr(hardware.shutil, "which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(hardware, "subprocess", SimpleNamespace(run=run, SubprocessError=subprocess.SubprocessError))
    monkeypatch.setattr(hardware, "sys", SimpleNamespace(platform="linux"))


def test_nvidia_gpus_are_listed_from_nvidia_smi(fresh_gpu_cache: None, monkeypatch: pytest.MonkeyPatch) -> None:
    def run(argv: list[str], **kwargs: Any) -> SimpleNamespace:
        assert argv[0] == "/usr/bin/nvidia-smi" and kwargs["timeout"] == 5 and kwargs["check"]
        return SimpleNamespace(stdout="NVIDIA GeForce RTX 4090, 24564\nOdd Board, [N/A]\n")

    fake_smi(monkeypatch, run)
    assert detect_gpus() == (
        GpuInfo(vendor="NVIDIA", name="NVIDIA GeForce RTX 4090", memory_mb=24564),
        GpuInfo(vendor="NVIDIA", name="Odd Board", memory_mb=None),
    )


def test_a_failing_nvidia_smi_means_no_gpu(fresh_gpu_cache: None, monkeypatch: pytest.MonkeyPatch) -> None:
    def run(argv: list[str], **_: Any) -> None:
        raise subprocess.CalledProcessError(9, argv)

    fake_smi(monkeypatch, run)
    assert detect_gpus() == ()


def test_apple_silicon_is_reported_without_nvidia_smi(fresh_gpu_cache: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hardware.shutil, "which", lambda _name: None)
    monkeypatch.setattr(hardware, "sys", SimpleNamespace(platform="darwin"))
    monkeypatch.setattr(hardware, "platform", SimpleNamespace(machine=lambda: "arm64"))
    assert detect_gpus() == (GpuInfo(vendor="Apple", name="Apple Silicon GPU (Metal)", memory_mb=None),)
