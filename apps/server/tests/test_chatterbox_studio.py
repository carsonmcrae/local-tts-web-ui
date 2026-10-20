"""Purpose: Tests for the Chatterbox engine's studio-voice operations over the real stdio protocol.

Scope: ``measure_takes`` parses the worker's per-take features; ``build_voice`` sends the session
identity only when there is one; ``audition`` sends the seed and the delivery's sampling settings
and returns scores; synthesis with a built voice sends its conditioning and delivery. Uses
``fake_worker.py`` (its ``history`` op shows exactly what reached the worker).
Does NOT belong: Real inference (test_inference.py) or session handling.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from chatterbox_harness import fake_chatterbox
from ltts.config import Settings
from ltts.engines.base import Audition, SpeakerIdentity, VoiceSpec
from ltts.engines.chatterbox import ChatterboxEngine
from ltts.engines.chatterbox_env import write_marker


@pytest.fixture
def engine(settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[ChatterboxEngine]:
    instance = fake_chatterbox(settings, tmp_path / "worker", monkeypatch)
    write_marker(instance._marker, "cpu", None, instance._venv)
    yield instance
    instance.close()


def last_request(engine: ChatterboxEngine, op: str) -> dict[str, Any]:
    assert engine._worker is not None
    requests = engine._worker.call("history", 5)["requests"]
    return next(request for request in reversed(requests) if request["op"] == op)


def test_measure_takes_returns_features_per_take(engine: ChatterboxEngine, tmp_path: Path) -> None:
    takes = engine.measure_takes([tmp_path / "take-001.flac", tmp_path / "take-002.flac"])
    assert [take.path.name for take in takes] == ["take-001.flac", "take-002.flac"]
    assert takes[1].speaker_emb == (1.0, 0.2, 0.0, 0.0) and takes[1].xvector == (0.0, 1.0, 0.0)
    assert takes[1].pitch_spread == 3.0 and takes[1].voiced_ratio == 0.6


def test_build_voice_sends_the_session_identity_only_when_given(engine: ChatterboxEngine, tmp_path: Path) -> None:
    output = tmp_path / "voice.safetensors"
    engine.build_voice(tmp_path / "take-007.flac", output, SpeakerIdentity((1.0, 0.0), (0.0, 1.0)))
    sent = last_request(engine, "build")
    assert (
        sent["prompt"].endswith("take-007.flac") and sent["speakerEmb"] == [1.0, 0.0] and sent["xvector"] == [0.0, 1.0]
    )
    assert output.is_file()
    engine.build_voice(tmp_path / "take-008.flac", output, None)
    assert "speakerEmb" not in last_request(engine, "build")


def test_audition_sends_seed_and_delivery_and_returns_scores(engine: ChatterboxEngine, tmp_path: Path) -> None:
    conditioning = tmp_path / "voice.safetensors"
    engine.build_voice(tmp_path / "take-004.flac", conditioning, None)
    outputs = [tmp_path / "a.wav", tmp_path / "b.wav"]
    request = Audition(conditioning, ["One.", "Two."], outputs, (1.0, 0.0), seed=7, delivery="expressive")
    assert engine.audition(request) == [0.84, 0.84]
    sent = last_request(engine, "audition")
    assert (
        sent["seed"] == 7 and sent["temperature"] == 0.95 and sent["topP"] == 0.98 and sent["speakerEmb"] == [1.0, 0.0]
    )
    assert all(output.is_file() for output in outputs)


def test_synthesis_with_a_built_voice_sends_its_conditioning_and_delivery(
    engine: ChatterboxEngine, tmp_path: Path
) -> None:
    voice = VoiceSpec("profile:x", reference_path=tmp_path / "ref.wav", conditioning_path=tmp_path / "v.safetensors")
    clip = engine.synthesize("Hello.", voice, 1.0)
    assert clip.sample_rate == 24_000
    sent = last_request(engine, "synthesize")
    assert sent["conditioning"].endswith("v.safetensors") and sent["reference"].endswith("ref.wav")
    assert sent["temperature"] == 0.8  # "natural" is Turbo's default sampling
    engine.synthesize("Hello.", VoiceSpec("default", delivery="steady"), 1.0)
    sent = last_request(engine, "synthesize")
    assert sent["conditioning"] is None and sent["reference"] is None and sent["temperature"] == 0.6
