"""Purpose: The engine contract that lets the UI support many TTS engines without special cases.

Scope: Capability/description models returned to the UI (only supported controls are listed), the
voice model, the ``Engine`` protocol every engine implements, and shared engine errors.
Does NOT belong: Any concrete engine (``kokoro.py``, ``chatterbox.py``).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Protocol

import numpy as np
import numpy.typing as npt

from ltts.common import ApiModel
from ltts.jobs import JobContext

EngineStatus = Literal["ready", "not_installed", "installing", "error"]


class EngineControl(ApiModel):
    """A user-adjustable synthesis parameter the engine genuinely supports."""

    name: Literal["pace"]
    label: str
    minimum: float
    maximum: float
    default: float
    step: float


class InstallOption(ApiModel):
    id: str
    label: str
    description: str
    download_bytes: int
    disk_bytes: int
    recommended: bool


class EngineInfo(ApiModel):
    id: str
    name: str
    description: str
    license: str
    optional: bool
    status: EngineStatus
    status_message: str
    supports_cloning: bool
    controls: list[EngineControl]
    languages: list[str]
    sample_rate: int
    device: str | None
    hardware_note: str
    install_options: list[InstallOption]
    installed_bytes: int
    install_job_id: str | None = None


class VoiceInfo(ApiModel):
    id: str
    engine_id: str
    name: str
    language: str
    language_code: str
    gender: Literal["female", "male", "unspecified"]
    category: Literal["built-in", "custom"]
    quality_grade: str | None = None
    description: str = ""
    available: bool = True


@dataclass(frozen=True, slots=True)
class VoiceSpec:
    """What an engine needs to speak with a voice: a built-in key or a reference recording."""

    key: str
    reference_path: Path | None = None
    language_code: str = "en-us"


@dataclass(slots=True)
class AudioClip:
    samples: npt.NDArray[np.float32]
    sample_rate: int


class Engine(Protocol):
    id: str

    def info(self) -> EngineInfo: ...

    def voices(self) -> list[VoiceInfo]: ...

    def is_ready(self) -> bool: ...

    def revision(self) -> str:
        """Identifies model + engine code version; part of every audio cache key."""
        ...

    def synthesize(self, text: str, voice: VoiceSpec, pace: float) -> AudioClip: ...

    def install(self, context: JobContext, option: str | None) -> dict[str, Any]: ...

    def uninstall(self) -> None: ...

    def warm_up(self) -> None: ...

    def close(self) -> None: ...
