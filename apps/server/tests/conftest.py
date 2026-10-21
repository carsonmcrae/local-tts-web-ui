# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Shared pytest fixtures for the server test suite.

Scope: Isolated settings (temporary data dir), a deterministic ``FakeEngine`` (sine tones whose
length follows the text, so API/caching/export logic is testable without models; as a cloning engine
it also fakes studio-voice measuring, building, auditioning and fine-tuning), the wired service
container, a TestClient that sends the app's required client header, and shared helpers for
speech-like recordings, WAV encoding, waiting for background jobs and saving a studio voice.
Does NOT belong: Real-inference fixtures (see test_inference_*.py, marked ``inference``).
"""

from __future__ import annotations

import io
import re
import time
from collections.abc import Iterator, Sequence
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from ltts.app import create_app
from ltts.config import Settings
from ltts.container import Services, build_services
from ltts.engines.base import (
    AudioClip,
    Audition,
    EngineInfo,
    SpeakerIdentity,
    TakeFeatures,
    TuningProgress,
    TuningTake,
    VoiceInfo,
    VoiceSpec,
)
from ltts.jobs import JobContext

SAMPLE_RATE = 24_000


class FakeEngine:
    def __init__(self, engine_id: str = "kokoro", *, ready: bool = True, cloning: bool = False) -> None:
        self.id = engine_id
        self.ready = ready
        self.cloning = cloning
        self.update_available = False
        self.damaged: list[str] = []  # model files a real engine would report as failing verification
        self.calls: list[tuple[str, str, float, Path | None]] = []
        self.specs: list[VoiceSpec] = []
        self.built: list[tuple[str, SpeakerIdentity | None]] = []
        self.styled: list[tuple[str, list[str]]] = []  # (style, prompt file names) per built style
        self.tunings: list[dict[str, Any]] = []  # each fine-tuning run: its takes, epochs trained, stopped
        self.tuning_losses = [4.0, 3.9, 3.85, 3.86, 3.9, 3.95, 4.0, 4.1, 4.2]  # held-out loss by epoch (0: before)

    def info(self) -> EngineInfo:
        return EngineInfo(
            id=self.id,
            name=self.id.title(),
            description="Deterministic test engine",
            license="test",
            optional=self.cloning,
            status="needs_repair" if self.damaged else "ready" if self.ready else "not_installed",
            status_message=f"{self.id.title()} needs repair: {', '.join(self.damaged)} is damaged."
            if self.damaged
            else "",
            supports_cloning=self.cloning,
            controls=[],
            languages=["English"],
            sample_rate=SAMPLE_RATE,
            device="cpu",
            hardware_note="",
            install_options=[],
            installed_bytes=0,
            update_available=self.update_available,
            damaged_files=list(self.damaged),
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
        return self.ready and not self.damaged

    def revision(self) -> str:
        return f"{self.id}-fake-1"

    def synthesize(self, text: str, voice: VoiceSpec, pace: float) -> AudioClip:
        self.calls.append((text, voice.key, pace, voice.reference_path))
        self.specs.append(voice)
        seconds = max(0.2, len(text) / 30) / pace
        t = np.arange(int(SAMPLE_RATE * seconds)) / SAMPLE_RATE
        return AudioClip((0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32), SAMPLE_RATE)

    def install(self, context: JobContext, option: str | None) -> dict[str, Any]:
        self.ready = True
        return {"option": option}

    def update(self, context: JobContext) -> dict[str, Any]:
        self.update_available = False
        return {"updated": True}

    def repair(self, context: JobContext) -> dict[str, Any]:
        repaired, self.damaged = self.damaged, []
        return {"repaired": repaired}

    def uninstall(self) -> None:
        self.ready = False

    def warm_up(self) -> None:
        return None

    def close(self) -> None:
        return None

    # Studio voices: every take sounds like the same speaker; a voice scores by its prompt take's number.
    def measure_takes(self, paths: Sequence[Path]) -> list[TakeFeatures]:
        return [TakeFeatures(path, (1.0, 0.0, 0.0), (0.0, 1.0), 1.0 + take_number(path) % 4, 0.6) for path in paths]

    def build_voice(self, prompt: Path, output: Path, identity: SpeakerIdentity | None) -> None:
        self.built.append((prompt.name, identity))
        output.write_text(prompt.name, encoding="utf-8")

    def build_style(self, prompts: Sequence[Path], output: Path) -> float:
        self.styled.append((output.stem, [prompt.name for prompt in prompts]))
        output.write_text(",".join(prompt.name for prompt in prompts), encoding="utf-8")
        return 15.0

    def audition(self, request: Audition) -> list[float]:
        for output in request.outputs:
            output.write_bytes(wav_bytes(speech_like(0.5)))
        score = 0.8 + take_number(Path(request.conditioning.read_text("utf-8"))) % 10 / 100
        return [round(score, 4)] * len(request.outputs)

    # Fine-tuning: the held-out loss follows ``tuning_losses`` epoch by epoch.
    def start_tuning(self, takes: Sequence[TuningTake], conditioning: Path, epochs: int, seed: int) -> TuningProgress:
        self.tunings.append({"takes": list(takes), "conditioning": conditioning, "epochs": 0, "stopped": False})
        return TuningProgress(0, self.tuning_losses[0], 0)

    def _best_epoch(self) -> int:
        trained = self.tunings[-1]["epochs"]
        return min(range(trained + 1), key=lambda epoch: self.tuning_losses[epoch])

    def tune_epoch(self) -> TuningProgress:
        self.tunings[-1]["epochs"] += 1
        epoch = self.tunings[-1]["epochs"]
        return TuningProgress(epoch, self.tuning_losses[epoch], self._best_epoch(), self.tuning_losses[epoch])

    def save_tuning(self, output: Path) -> TuningProgress:
        best = self._best_epoch()
        output.write_text(f"adapter from epoch {best}", encoding="utf-8")
        return TuningProgress(best, self.tuning_losses[best], best)

    def stop_tuning(self) -> None:
        if self.tunings:
            self.tunings[-1]["stopped"] = True


def take_number(path: Path) -> int:
    digits = re.findall(r"\d+", path.stem)
    return int(digits[-1]) if digits else 0


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


def wav_bytes(samples: np.ndarray, rate: int = SAMPLE_RATE) -> bytes:
    """16-bit PCM WAV bytes, as the browser uploads a recording."""
    buffer = io.BytesIO()
    sf.write(buffer, samples, rate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


def wait_job(client: TestClient, job_id: str) -> dict[str, Any]:
    """Poll a background job until it leaves the queued/running states (10 s at most)."""
    for _ in range(200):
        job: dict[str, Any] = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] not in ("queued", "running"):
            return job
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def saved_studio_voice(client: TestClient, numbers: Sequence[int]) -> dict[str, Any]:
    """A studio voice recorded, built and saved through the API, keeping a take of each passage number."""
    session_id = client.post("/api/voice-sessions").json()["id"]
    for number in numbers:
        client.put(f"/api/voice-sessions/{session_id}/takes/{number}", content=wav_bytes(speech_like(12)))
    wait_job(client, client.post(f"/api/voice-sessions/{session_id}/build").json()["id"])
    best = client.get(f"/api/voice-sessions/{session_id}").json()["candidates"][0]["index"]
    profile: dict[str, Any] = client.post(
        f"/api/voice-sessions/{session_id}/finish", json={"candidate": best, "name": "Me", "consent": True}
    ).json()
    return profile
