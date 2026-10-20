"""Purpose: The engine contract that lets the UI support many TTS engines without special cases.

Scope: Capability/description models returned to the UI (only supported controls are listed), the
voice model, the ``Engine`` protocol every engine implements, the ``VoiceBuilder`` protocol a cloning
engine implements to build studio voices, and shared engine errors.
Does NOT belong: Any concrete engine (``kokoro.py``, ``chatterbox.py``).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Protocol

import numpy as np
import numpy.typing as npt

from ltts.common import ApiModel
from ltts.jobs import JobContext

EngineStatus = Literal["ready", "not_installed", "installing", "error"]
Delivery = Literal["steady", "natural", "expressive"]


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
    update_available: bool = False  # installed from an older runtime lock; POST /engines/{id}/update applies it


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
    """What an engine needs to speak with a voice: a built-in key, a reference recording or a built
    studio voice (cloning engines prefer it), and how lively the delivery should be."""

    key: str
    reference_path: Path | None = None
    language_code: str = "en-us"
    conditioning_path: Path | None = None
    delivery: Delivery = "natural"


@dataclass(slots=True)
class AudioClip:
    samples: npt.NDArray[np.float32]
    sample_rate: int


@dataclass(frozen=True, slots=True)
class TakeFeatures:
    """What a cloning engine measured in one recorded take: who is speaking and how varied the delivery is."""

    path: Path
    speaker_emb: tuple[float, ...]
    xvector: tuple[float, ...]
    pitch_spread: float  # standard deviation of the voiced pitch, in semitones
    voiced_ratio: float


@dataclass(frozen=True, slots=True)
class SpeakerIdentity:
    """A speaker's identity averaged over a session (unit vectors in each encoder's space)."""

    speaker_emb: tuple[float, ...]
    xvector: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class Audition:
    """Generate ``texts`` into ``outputs`` with a built voice, seeded, and score them against ``target``."""

    conditioning: Path
    texts: Sequence[str]
    outputs: Sequence[Path]
    target: tuple[float, ...]
    seed: int = 0
    delivery: Delivery = "natural"


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

    def update(self, context: JobContext) -> dict[str, Any]:
        """Bring an installed engine up to date in place; only offered when ``info().update_available``."""
        ...

    def uninstall(self) -> None: ...

    def warm_up(self) -> None: ...

    def close(self) -> None: ...


class VoiceBuilder(Protocol):
    """A cloning engine that builds a studio voice from a recorded session."""

    def measure_takes(self, paths: Sequence[Path]) -> list[TakeFeatures]: ...

    def build_voice(self, prompt: Path, output: Path, identity: SpeakerIdentity | None) -> None:
        """Save a voice built from ``prompt``'s sound and style; ``identity`` replaces the take's own."""
        ...

    def audition(self, request: Audition) -> list[float]: ...
