# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Kokoro-82M via kokoro-onnx — the lightweight, CPU-friendly default engine.

Scope: Reports install state of the checksum-pinned model artifact (including damaged files), installs,
repairs and removes it through the model store, verifies every file before lazily loading one ONNX
session (thread-safe double-checked), lists the 54 built-in voices with metadata, and synthesises
24 kHz mono audio with a native pace control, rejecting empty or non-finite output.
Does NOT belong: Text segmentation, pauses between segments or caching (``synthesis``).
"""

from __future__ import annotations

import logging
import threading
from typing import Any, override

import numpy as np

from ltts.engines.base import (
    AudioClip,
    Engine,
    EngineControl,
    EngineInfo,
    EngineStatus,
    InstallOption,
    VoiceInfo,
    VoiceSpec,
)
from ltts.engines.kokoro_voices import GRADES, describe
from ltts.errors import ConflictError, EngineUnavailableError, SynthesisError
from ltts.jobs import JobContext
from ltts.modelstore.store import Damage, ModelStore, describe_damage
from ltts.onnx import onnxruntime

log = logging.getLogger("ltts.engines.kokoro")
ARTIFACT = "kokoro-v1.0"
ENGINE_CODE_VERSION = "kokoro-onnx-0.6"
SAMPLE_RATE = 24_000
PACE = EngineControl(name="pace", label="Speaking pace", minimum=0.5, maximum=2.0, default=1.0, step=0.05)


class KokoroEngine(Engine):
    id = "kokoro"

    def __init__(self, store: ModelStore):
        self._store = store
        self._lock = threading.Lock()
        self._model: Any = None
        self._load_error: str | None = None
        self._voice_ids: list[str] = []

    # -- lifecycle -------------------------------------------------------
    def is_ready(self) -> bool:
        return self._store.is_installed(ARTIFACT) and not self._store.damage(ARTIFACT)

    def _ensure_loaded(self) -> Any:
        if self._model is not None:
            return self._model
        if not self._store.is_installed(ARTIFACT) and not self._store.damage(ARTIFACT):
            raise EngineUnavailableError(
                "The Kokoro voice model isn't installed yet. Install it from Settings → Engines & models.",
                code="engine_not_installed",
            )
        with self._lock:
            if self._model is None:
                self._store.require_intact(ARTIFACT)  # every file is hashed before the first load
                try:
                    rt = onnxruntime()  # before kokoro_onnx, which imports onnxruntime itself
                    from kokoro_onnx import Kokoro

                    # Pin the CPU provider explicitly: kokoro-onnx otherwise enables every provider the
                    # installed onnxruntime exposes, which on some builds includes a remote (Azure) one.
                    session = rt.InferenceSession(
                        str(self._store.file_path(ARTIFACT, "kokoro-v1.0.onnx")),
                        providers=["CPUExecutionProvider"],
                    )
                    model = Kokoro.from_session(session, str(self._store.file_path(ARTIFACT, "voices-v1.0.bin")))
                    self._voice_ids = sorted(model.get_voices())
                    self._model = model
                    self._load_error = None
                except Exception as exc:
                    self._load_error = type(exc).__name__
                    log.exception("kokoro failed to load")
                    raise EngineUnavailableError(
                        "Kokoro could not start. Try reinstalling the model from Settings.",
                        code="engine_load_failed",
                    ) from exc
        return self._model

    def warm_up(self) -> None:
        if self.is_ready():
            self._ensure_loaded()

    def close(self) -> None:
        with self._lock:
            self._model = None

    # -- description -----------------------------------------------------
    def revision(self) -> str:
        return f"{ARTIFACT}/{ENGINE_CODE_VERSION}"

    def _status(self, ready: bool, damage: list[Damage]) -> tuple[EngineStatus, str]:
        if damage:
            return "needs_repair", describe_damage("The Kokoro model", damage)
        if not ready:
            return "not_installed", "Model not installed"
        if self._load_error:
            return "error", f"Installed, but failed to load ({self._load_error})"
        return "ready", "Ready"

    def info(self) -> EngineInfo:
        art = self._store.artifact(ARTIFACT)
        ready = self.is_ready()
        damage = self._store.damage(ARTIFACT)
        status, message = self._status(ready, damage)
        return EngineInfo(
            id=self.id,
            name="Kokoro",
            description="Fast, natural-sounding built-in voices. Runs comfortably on any modern CPU.",
            license=art.license,
            optional=False,
            status=status,
            status_message=message,
            supports_cloning=False,
            controls=[PACE],
            languages=[
                "English (US)",
                "English (UK)",
                "Spanish",
                "French",
                "Hindi",
                "Italian",
                "Portuguese (BR)",
                "Japanese",
                "Mandarin Chinese",
            ],
            sample_rate=SAMPLE_RATE,
            device="cpu" if ready else None,
            hardware_note="CPU only — no GPU needed. About 1 GB of RAM while speaking.",
            install_options=[
                InstallOption(
                    id="default",
                    label="Kokoro v1.0",
                    description="ONNX model plus 54 voices.",
                    download_bytes=art.total_bytes,
                    disk_bytes=art.total_bytes,
                    recommended=True,
                )
            ],
            installed_bytes=self._store.installed_bytes(ARTIFACT),
            damaged_files=[item.name for item in damage],
        )

    def voices(self) -> list[VoiceInfo]:
        voice_ids = self._voice_ids or list(GRADES)
        result = []
        for voice_id in voice_ids:
            name, language, gender, note = describe(voice_id)
            result.append(
                VoiceInfo(
                    id=f"{self.id}:{voice_id}",
                    engine_id=self.id,
                    name=name,
                    language=language.name,
                    language_code=language.espeak,
                    gender=gender,  # type: ignore[arg-type]
                    category="built-in",
                    quality_grade=GRADES.get(voice_id),
                    description=note,
                    available=self.is_ready(),
                )
            )
        return result

    # -- install ---------------------------------------------------------
    # Kokoro has a single install option, so ``option`` is not consulted.
    @override
    def install(self, context: JobContext, option: str | None) -> dict[str, Any]:
        def progress(done: int, total: int, name: str) -> None:
            context.update(done / total, f"Downloading {name} ({done // 1_048_576} / {total // 1_048_576} MB)")

        self._store.install(ARTIFACT, progress, lambda: context.canceled)
        context.update(1.0, "Loading model…", force=True)
        self.close()
        self._ensure_loaded()
        return {"artifact": ARTIFACT}

    @override
    def repair(self, context: JobContext) -> dict[str, Any]:
        """Installing re-checks every file and downloads only those that fail, so a repair is an install."""
        return self.install(context, None)

    # Nothing runs, so the job context is not used.
    @override
    def update(self, context: JobContext) -> dict[str, Any]:
        """Kokoro runs in-process from checksum-pinned files; there is no separate runtime to update."""
        raise ConflictError("Kokoro is already up to date.", code="no_update")

    def uninstall(self) -> None:
        self.close()
        self._store.remove(ARTIFACT)

    # -- synthesis -------------------------------------------------------
    def synthesize(self, text: str, voice: VoiceSpec, pace: float) -> AudioClip:
        model = self._ensure_loaded()
        if voice.key not in self._voice_ids:
            raise SynthesisError("That Kokoro voice doesn't exist.", code="voice_not_found")
        pace = min(max(pace, PACE.minimum), PACE.maximum)
        try:
            samples, sample_rate = model.create(text, voice=voice.key, speed=pace, lang=voice.language_code)
        except Exception as exc:
            log.exception("kokoro synthesis failed", extra={"voice": voice.key, "chars": len(text)})
            raise SynthesisError("Kokoro couldn't speak this passage.") from exc
        audio = np.asarray(samples, dtype=np.float32)
        if audio.size == 0 or not np.isfinite(audio).all():
            log.error("kokoro produced unusable audio", extra={"voice": voice.key, "samples": int(audio.size)})
            raise SynthesisError(
                "Kokoro produced no usable audio for this passage. If it keeps happening, check the model in "
                "Settings → Engines & models.",
                code="synthesis_invalid_audio",
            )
        return AudioClip(audio, int(sample_rate))
