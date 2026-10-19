"""Purpose: Optional Chatterbox Turbo engine (MIT) for zero-shot voice cloning, run out-of-process.

Scope: Installs an isolated, locked environment (CPU or CUDA PyTorch) with uv plus checksum-pinned
weights, offers an in-place update when the worker lock has changed since the install, reports
hardware-aware install options, and synthesises through ``WorkerClient`` using a custom profile's
reference recording (or the model's built-in voice). Output is 24 kHz and carries Resemble's
imperceptible Perth watermark.
Does NOT belong: Profile storage/consent (``voices``), running uv and the install marker
(``chatterbox_env.py``) or the worker implementation (``apps/chatterbox-worker``).
"""

from __future__ import annotations

import logging
import os
import shutil
import sys
import threading
from pathlib import Path
from typing import Any

from ltts.audio import read_audio
from ltts.common import MB, ensure_free_space, new_id
from ltts.config import Settings
from ltts.engines.base import AudioClip, EngineInfo, InstallOption, VoiceInfo, VoiceSpec
from ltts.engines.chatterbox_env import (
    PROJECT_DIR,
    find_uv,
    lock_digest,
    read_marker,
    sync_environment,
    write_marker,
)
from ltts.engines.worker_client import WorkerClient
from ltts.errors import EngineUnavailableError
from ltts.hardware import detect_gpus
from ltts.jobs import JobContext
from ltts.modelstore.store import ModelStore

log = logging.getLogger("ltts.engines.chatterbox")
ARTIFACT = "chatterbox-turbo"
ENV_BYTES = {"cuda": 5_400 * MB, "cpu": 1_500 * MB}
UPDATE_FREE_BYTES = 1_000 * MB  # an update only replaces the packages whose locked versions changed
LOAD_TIMEOUT_S = 600.0
SYNTH_TIMEOUT_S = 300.0


class ChatterboxEngine:
    id = "chatterbox"

    def __init__(self, settings: Settings, store: ModelStore, project_dir: Path = PROJECT_DIR):
        self._settings = settings
        self._store = store
        self._project = project_dir
        self._root = settings.resolved_engines_dir / "chatterbox"
        self._worker: WorkerClient | None = None
        self._lock = threading.Lock()
        self._updating = False

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
        return read_marker(self._marker)

    def _installed_option(self) -> str | None:
        data = self._marker_data()
        option = data.get("extra") or data.get("option")
        return str(option) if option else None

    def is_ready(self) -> bool:
        return self._installed_option() is not None and self._python.is_file() and self._store.is_installed(ARTIFACT)

    def update_available(self) -> bool:
        """The environment was built from another worker lock, or before locks were recorded (legacy marker)."""
        current = lock_digest(self._project)
        return current is not None and self.is_ready() and self._marker_data().get("lockSha256") != current

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
        update = ready and self.update_available()
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
            status_message=_status_message(ready, update=update),
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
            update_available=update,
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

    # -- install & update -------------------------------------------------
    def install(self, context: JobContext, option: str | None) -> dict[str, Any]:
        choice = option or next(o.id for o in self._options() if o.recommended)
        if choice not in {o.id for o in self._options()}:
            raise EngineUnavailableError("That install option isn't available on this computer.", code="invalid_option")
        uv = _require_uv()
        self._root.mkdir(parents=True, exist_ok=True)
        ensure_free_space(self._root, ENV_BYTES[choice], self._settings.min_free_disk_mb)
        self.close()
        self._marker.unlink(missing_ok=True)
        context.update(0.02, "Installing the Chatterbox runtime (PyTorch). This can take several minutes…", force=True)
        digest = lock_digest(self._project)
        sync_environment(uv, self._project, self._venv, choice, context, update=False)
        context.update(0.4, "Downloading Chatterbox model files…", force=True)
        self._store.install(
            ARTIFACT,
            lambda done, total, name: context.update(
                0.4 + 0.5 * done / total, f"Downloading {name} ({done // MB} / {total // MB} MB)"
            ),
            lambda: context.canceled,
        )
        context.update(0.92, "Loading the model to verify the installation…", force=True)
        loaded = self._verified_load(choice)
        # Only a verified load marks the engine as installed.
        write_marker(self._marker, choice, digest, self._venv)
        return {"option": choice, "device": loaded.get("device")}

    def update(self, context: JobContext) -> dict[str, Any]:
        """Re-sync the installed environment to the current worker lock, in place.

        The previous marker (and with it the ready state) stays until the updated environment has loaded
        the model, so a failed or canceled update keeps the old record and the update stays on offer.
        """
        choice = self._installed_option()
        if choice is None or not self.is_ready():
            raise EngineUnavailableError("Install Chatterbox before updating it.", code="engine_not_installed")
        uv = _require_uv()
        ensure_free_space(self._root, UPDATE_FREE_BYTES, self._settings.min_free_disk_mb)
        previous = self._marker_data()
        digest = lock_digest(self._project)
        with self._lock:
            self._updating = True  # synthesis must not start the worker while uv rewrites its packages
        try:
            self.close()
            context.update(0.02, "Updating the Chatterbox runtime to the latest locked packages…", force=True)
            sync_environment(uv, self._project, self._venv, choice, context, update=True)
        finally:
            with self._lock:
                self._updating = False
        context.update(0.9, "Loading the model to verify the update…", force=True)
        loaded = self._verified_load(choice)
        write_marker(self._marker, choice, digest, self._venv, installed_at=previous.get("installedAt"))
        log.info("chatterbox environment updated", extra={"lock_sha256": digest})
        return {"option": choice, "device": loaded.get("device"), "updated": True}

    def _verified_load(self, option: str) -> dict[str, Any]:
        try:
            return self._ensure_worker(option)
        except Exception:
            self.close()
            raise

    def uninstall(self) -> None:
        self.close()
        shutil.rmtree(self._root, ignore_errors=True)
        self._store.remove(ARTIFACT)

    # -- runtime ----------------------------------------------------------
    def _worker_argv(self) -> list[str]:
        return [str(self._python), "-I", "-m", "ltts_chatterbox_worker"]

    def _ensure_worker(self, option: str | None = None) -> dict[str, Any]:
        with self._lock:
            if self._updating:
                raise EngineUnavailableError(
                    "Chatterbox is being updated. Try again when the update finishes.", code="engine_updating"
                )
            if self._worker is None:
                if self.update_available():
                    log.warning(
                        "chatterbox runtime is older than the worker lock; update it in Settings → Engines & models"
                    )
                env = {k: v for k, v in os.environ.items() if not k.startswith(("LTTS_", "UV_"))}
                env.update({"PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "HF_HUB_OFFLINE": "1"})
                self._worker = WorkerClient(
                    self._worker_argv(), env, self._root, self._settings.clone_worker_idle_unload_s
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

    # Chatterbox has no pace control; ``pace`` is accepted because every engine shares one signature.
    def synthesize(self, text: str, voice: VoiceSpec, pace: float) -> AudioClip:  # noqa: ARG002
        if not self.is_ready():
            raise EngineUnavailableError(
                "Chatterbox isn't installed. Install it from Settings → Engines & models.", code="engine_not_installed"
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


def _status_message(ready: bool, *, update: bool) -> str:
    if update:
        return "Update available"
    return "Ready" if ready else "Not installed"


def _require_uv() -> str:
    uv = find_uv()
    if uv is None:
        raise EngineUnavailableError("uv was not found. Run `npm run setup` and try again.", code="uv_missing")
    return uv
