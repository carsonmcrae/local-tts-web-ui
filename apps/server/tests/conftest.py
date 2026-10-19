"""Purpose: Shared pytest fixtures for the server test suite.

Scope: Isolated settings (temporary data dir), a deterministic ``FakeEngine`` (sine tones whose
length follows the text, so API/caching/export logic is testable without models), the wired service
container and a TestClient that sends the app's required client header.
Does NOT belong: Real-inference fixtures (see test_inference_*.py, marked ``inference``).
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from ltts.app import create_app
from ltts.config import Settings
from ltts.container import Services, build_services
from ltts.engines.base import AudioClip, EngineInfo, VoiceInfo, VoiceSpec
from ltts.jobs import JobContext

SAMPLE_RATE = 24_000


class FakeEngine:
    def __init__(self, engine_id: str = "kokoro", *, ready: bool = True, cloning: bool = False) -> None:
        self.id = engine_id
        self.ready = ready
        self.cloning = cloning
        self.calls: list[tuple[str, str, float, Path | None]] = []

    def info(self) -> EngineInfo:
        return EngineInfo(
            id=self.id,
            name=self.id.title(),
            description="Deterministic test engine",
            license="test",
            optional=self.cloning,
            status="ready" if self.ready else "not_installed",
            status_message="",
            supports_cloning=self.cloning,
            controls=[],
            languages=["English"],
            sample_rate=SAMPLE_RATE,
            device="cpu",
            hardware_note="",
            install_options=[],
            installed_bytes=0,
        )

    def voices(self) -> list[VoiceInfo]:
        return [
            VoiceInfo(
                id=f"{self.id}:alpha",
                engine_id=self.id,
                name="Alpha",
                language="English (US)",
                language_code="en-us",
                gender="female",
                category="built-in",
                available=self.ready,
            )
        ]

    def is_ready(self) -> bool:
        return self.ready

    def revision(self) -> str:
        return f"{self.id}-fake-1"

    def synthesize(self, text: str, voice: VoiceSpec, pace: float) -> AudioClip:
        self.calls.append((text, voice.key, pace, voice.reference_path))
        seconds = max(0.2, len(text) / 30) / pace
        t = np.arange(int(SAMPLE_RATE * seconds)) / SAMPLE_RATE
        return AudioClip((0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32), SAMPLE_RATE)

    def install(self, context: JobContext, option: str | None) -> dict[str, Any]:
        self.ready = True
        return {"option": option}

    def uninstall(self) -> None:
        self.ready = False

    def warm_up(self) -> None:
        return None

    def close(self) -> None:
        return None


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        env="test",
        data_dir=tmp_path / "data",
        models_dir=tmp_path / "models",
        warm_up_engines=False,
        extra_allowed_hosts=["testserver"],
    )


@pytest.fixture
def engines() -> dict[str, FakeEngine]:
    return {"kokoro": FakeEngine("kokoro"), "chatterbox": FakeEngine("chatterbox", cloning=True)}


@pytest.fixture
def services(settings: Settings, engines: dict[str, FakeEngine]) -> Services:
    return build_services(settings, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines.values()))


@pytest.fixture
def client(settings: Settings, services: Services) -> Iterator[TestClient]:
    app = create_app(settings, services=services)
    with TestClient(app, headers={"X-LTTS-Client": "web"}) as test_client:
        yield test_client


def speech_like(
    seconds: float = 12.0, rate: int = SAMPLE_RATE, level: float = 0.3, noise: float = 0.0005
) -> np.ndarray:
    """Syllable-like bursts with short gaps — passes the voice-reference quality checks."""
    t = np.arange(int(seconds * rate)) / rate
    envelope = (np.sin(2 * np.pi * 3.0 * t) > -0.6).astype(np.float32)
    carrier = np.sin(2 * np.pi * 180 * t) + 0.5 * np.sin(2 * np.pi * 360 * t)
    rng = np.random.default_rng(7)
    return (level * envelope * carrier / 1.5 + noise * rng.standard_normal(len(t))).astype(np.float32)
