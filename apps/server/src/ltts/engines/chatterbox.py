"""Purpose: Optional Chatterbox Turbo engine (MIT) for zero-shot voice cloning, run out-of-process.

Scope: Installs an isolated, locked environment (CPU or CUDA PyTorch) with uv plus checksum-pinned
weights, reports hardware-aware install options, and synthesises through ``WorkerClient`` using a
custom profile's reference recording (or the model's built-in voice). Output is 24 kHz and carries
Resemble's imperceptible Perth watermark.
Does NOT belong: Profile storage/consent (``voices``) or the worker implementation
(``apps/chatterbox-worker``).
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any

from ltts.audio import read_audio
from ltts.common import MB, ensure_free_space, new_id, utc_now
from ltts.config import REPO_ROOT, Settings
from ltts.engines.base import AudioClip, EngineInfo, InstallOption, VoiceInfo, VoiceSpec
from ltts.engines.worker_client import WorkerClient
from ltts.errors import EngineUnavailableError
from ltts.hardware import detect_gpus
from ltts.jobs import JobContext
from ltts.modelstore.store import ModelStore

log = logging.getLogger("ltts.engines.chatterbox")
ARTIFACT = "chatterbox-turbo"
PROJECT_DIR = REPO_ROOT / "apps" / "chatterbox-worker"
ENV_BYTES = {"cuda": 5_400 * MB, "cpu": 1_500 * MB}
LOAD_TIMEOUT_S = 600.0
SYNTH_TIMEOUT_S = 300.0


def find_uv() -> str | None:
    explicit = os.environ.get("LTTS_UV_BIN")
    if explicit and Path(explicit).is_file():
        return explicit
    exe = "uv.exe" if sys.platform == "win32" else "uv"
    pinned = sorted((REPO_ROOT / ".tools" / "uv").glob(f"*/{exe}"))
    return str(pinned[-1]) if pinned else shutil.which("uv")


class ChatterboxEngine:
    id = "chatterbox"

    def __init__(self, settings: Settings, store: ModelStore):
        self._settings = settings
        self._store = store
        self._root = settings.resolved_engines_dir / "chatterbox"
        self._worker: WorkerClient | None = None
        self._lock = threading.Lock()

    # -- paths & state ----------------------------------------------------
    @property
    def _venv(self) -> Path:
        return self._root / "venv"

    @property
    def _python(self) -> Path:
        return self._venv / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")

    @property
    def _marker(self) -> Path:
        return self._root / "installed.json"

    def _marker_data(self) -> dict[str, Any]:
        try:
            data = json.loads(self._marker.read_text("utf-8"))
        except (OSError, ValueError):
            return {}
        return data if isinstance(data, dict) else {}

    def _installed_option(self) -> str | None:
        option = self._marker_data().get("option")
        return str(option) if option else None

    def is_ready(self) -> bool:
        return self._installed_option() is not None and self._python.is_file() and self._store.is_installed(ARTIFACT)

    def revision(self) -> str:
        return f"{ARTIFACT}/worker-1"

    # -- description ------------------------------------------------------
    def _options(self) -> list[InstallOption]:
        weights = self._store.artifact(ARTIFACT).total_bytes
        has_nvidia = any(gpu.vendor == "NVIDIA" for gpu in detect_gpus()) and sys.platform != "darwin"
        options = []
        if has_nvidia:
            options.append(InstallOption(
                id="cuda", label="NVIDIA GPU (CUDA)", recommended=True,
                description="Fast generation on your NVIDIA graphics card. Needs about 4 GB of free VRAM.",
                download_bytes=weights + 2_800 * MB, disk_bytes=weights + ENV_BYTES["cuda"]))  # fmt: skip
        options.append(InstallOption(
            id="cpu", label="Apple Silicon / CPU" if sys.platform == "darwin" else "CPU only",
            recommended=not has_nvidia,
            description="Works everywhere but is much slower than real time on most CPUs.",
            download_bytes=weights + 600 * MB, disk_bytes=weights + ENV_BYTES["cpu"]))  # fmt: skip
        return options

    def info(self) -> EngineInfo:
        ready = self.is_ready()
        option = self._installed_option()
        device = (self._worker.loaded or {}).get("device") if self._worker and self._worker.loaded else option
        return EngineInfo(
            id=self.id,
            name="Chatterbox Turbo",
            description=(
                "Creates a voice from a 10–20 second recording of a consenting speaker. Optional; large download."
            ),
            license=self._store.artifact(ARTIFACT).license,
            optional=True,
            status="ready" if ready else "not_installed",
            status_message="Ready" if ready else "Not installed",
            supports_cloning=True,
            controls=[],
            languages=["English"],
            sample_rate=24_000,
            device=device if ready else None,
            hardware_note=(
                "Best with an NVIDIA GPU (4 GB+ VRAM) or Apple Silicon. CPU works but is slow. ~3 GB of model files."
            ),
            install_options=self._options(),
            installed_bytes=self._store.installed_bytes(ARTIFACT) + int(self._marker_data().get("envBytes", 0)),
        )

    def voices(self) -> list[VoiceInfo]:
        return [
            VoiceInfo(
                id=f"{self.id}:default",
                engine_id=self.id,
                name="Chatterbox default",
                language="English",
                language_code="en",
                gender="female",
                category="built-in",
                description="The model's built-in reference voice.",
                available=self.is_ready(),
            )
        ]

    # -- install ----------------------------------------------------------
    def install(self, context: JobContext, option: str | None) -> dict[str, Any]:
        choice = option or next(o.id for o in self._options() if o.recommended)
        if choice not in {o.id for o in self._options()}:
            raise EngineUnavailableError("That install option isn't available on this computer.", code="invalid_option")
        uv = find_uv()
        if uv is None:
            raise EngineUnavailableError("uv was not found. Run `npm run setup` and try again.", code="uv_missing")
        self._root.mkdir(parents=True, exist_ok=True)
        ensure_free_space(self._root, ENV_BYTES[choice], self._settings.min_free_disk_mb)
        self.close()
        self._marker.unlink(missing_ok=True)
        context.update(0.02, "Installing the Chatterbox runtime (PyTorch). This can take several minutes…", force=True)
        self._sync_environment(uv, choice, context)
        context.update(0.4, "Downloading Chatterbox model files…", force=True)
        self._store.install(
            ARTIFACT,
            lambda done, total, name: context.update(
                0.4 + 0.5 * done / total, f"Downloading {name} ({done // MB} / {total // MB} MB)"
            ),
            lambda: context.canceled,
        )
        context.update(0.92, "Loading the model to verify the installation…", force=True)
        try:
            loaded = self._ensure_worker(choice)
        except Exception:
            self.close()
            raise
        # Only a verified load marks the engine as installed.
        marker = {"option": choice, "installedAt": utc_now(), "envBytes": _tree_bytes(self._venv)}
        self._marker.write_text(json.dumps(marker), encoding="utf-8")
        return {"option": choice, "device": loaded.get("device")}

    def _sync_environment(self, uv: str, choice: str, context: JobContext) -> None:
        env = {**os.environ, "UV_PROJECT_ENVIRONMENT": str(self._venv),
               "UV_PYTHON_INSTALL_DIR": str(REPO_ROOT / ".tools" / "python"), "UV_NO_PROGRESS": "1"}  # fmt: skip
        proc = subprocess.Popen(  # noqa: S603 - fixed argv; uv verifies hashes from the committed lockfile
            [uv, "sync", "--frozen", "--no-dev", "--project", str(PROJECT_DIR), "--extra", choice],
            cwd=PROJECT_DIR, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
        )  # fmt: skip
        tail: list[str] = []
        for line in proc.stdout or ():
            tail = [*tail[-20:], line.rstrip()]
            if context.canceled:
                proc.kill()
                context.check()
            if line.strip():
                context.update(0.05, f"Installing runtime: {line.strip()[:120]}")
        if proc.wait() != 0:
            log.error("chatterbox environment sync failed:\n%s", "\n".join(tail))
            raise EngineUnavailableError(
                "Installing the Chatterbox runtime failed. Check your connection and the server log, then retry.",
                code="install_failed",
            )

    def uninstall(self) -> None:
        self.close()
        shutil.rmtree(self._root, ignore_errors=True)
        self._store.remove(ARTIFACT)

    # -- runtime ----------------------------------------------------------
    def _ensure_worker(self, option: str | None = None) -> dict[str, Any]:
        with self._lock:
            if self._worker is None:
                env = {k: v for k, v in os.environ.items() if not k.startswith(("LTTS_", "UV_"))}
                env.update({"PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "HF_HUB_OFFLINE": "1"})
                self._worker = WorkerClient(
                    [str(self._python), "-I", "-m", "ltts_chatterbox_worker"],
                    env,
                    self._root,
                    self._settings.clone_worker_idle_unload_s,
                )
            if not self._worker.loaded:
                device = option or self._installed_option() or "auto"
                model_dir = str(self._store.directory(ARTIFACT))
                self._worker.loaded = self._worker.call("load", LOAD_TIMEOUT_S, modelDir=model_dir, device=device)
                log.info("chatterbox loaded", extra={"device": self._worker.loaded.get("device")})
            return self._worker.loaded

    def warm_up(self) -> None:
        """Chatterbox is loaded lazily on first use; warming it would hold GPU memory unnecessarily."""

    def close(self) -> None:
        with self._lock:
            if self._worker is not None:
                self._worker.stop()
                self._worker = None

    def synthesize(self, text: str, voice: VoiceSpec, pace: float) -> AudioClip:  # noqa: ARG002 - no pace control
        if not self.is_ready():
            raise EngineUnavailableError(
                "Chatterbox isn't installed. Install it from Settings → Engines.", code="engine_not_installed"
            )
        self._ensure_worker()
        if self._worker is None:
            raise EngineUnavailableError("Chatterbox could not start.", code="engine_load_failed")
        output = self._settings.path("tmp") / f"{new_id()}.wav"
        try:
            reference = str(voice.reference_path) if voice.reference_path else None
            self._worker.call("synthesize", SYNTH_TIMEOUT_S, text=text, reference=reference, output=str(output))
            samples, rate = read_audio(output)
        finally:
            output.unlink(missing_ok=True)
        return AudioClip(samples, rate)


def _tree_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())
