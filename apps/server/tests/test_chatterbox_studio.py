# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the Chatterbox engine's studio-voice operations over the real stdio protocol.

Scope: ``measure_takes`` parses the worker's per-take features; ``build_voice`` sends the session
identity only when there is one; ``audition`` sends the seed, the delivery's sampling settings and
an adapter, and returns scores; synthesis with a built voice sends its conditioning, delivery and
fine-tuned adapter; fine-tuning runs epoch by epoch on a GPU only. Uses ``fake_worker.py`` (its
``history`` op shows exactly what reached the worker).
Does NOT belong: Real inference (test_inference.py) or session handling.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from chatterbox_harness import fake_chatterbox
from ltts.config import Settings
from ltts.engines.base import AudioClip, Audition, SpeakerIdentity, TuningTake, VoiceSpec
from ltts.engines.chatterbox import ChatterboxEngine
from ltts.engines.chatterbox_env import write_marker
from ltts.errors import ConflictError, EngineUnavailableError


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
    assert sent["conditioning"] is None and sent["reference"] is None and sent["temperature"] == 0.7
    assert sent["topK"] == 600 and sent["style"] is None


def test_each_sentence_uses_the_style_that_fits_it(engine: ChatterboxEngine, tmp_path: Path) -> None:
    styles = tuple((name, tmp_path / f"{name}.safetensors") for name in ("narration", "question", "dialogue"))
    voice = VoiceSpec("profile:x", conditioning_path=tmp_path / "v.safetensors", styles=styles)
    for text, style in [
        ("Are you coming tonight?", "question"),
        ("“Sure,” she said.", "dialogue"),
        ("The river was wide.", "narration"),
        ("That's amazing!", "narration"),  # no lively style built: narration stands in
    ]:
        engine.synthesize(text, voice, 1.0)
        assert last_request(engine, "synthesize")["style"].endswith(f"{style}.safetensors")
    quick = VoiceSpec("profile:q", reference_path=tmp_path / "ref.wav", styles=styles)
    engine.synthesize("Are you coming tonight?", quick, 1.0)
    assert last_request(engine, "synthesize")["style"] is None  # styles belong to a built studio voice


def test_a_sentence_is_seeded_from_its_text_and_retried_when_implausible(engine: ChatterboxEngine) -> None:
    voice = VoiceSpec("default")
    engine.synthesize("The same sentence.", voice, 1.0)
    first = last_request(engine, "synthesize")["seed"]
    engine.synthesize("The same sentence.", voice, 1.0)
    assert last_request(engine, "synthesize")["seed"] == first  # the same text always sounds the same
    assert engine._worker is not None
    before = sum(1 for r in engine._worker.call("history", 5)["requests"] if r["op"] == "synthesize")
    clip = engine.synthesize("CUT short, this whole sentence never arrives in full.", voice, 1.0)
    requests = [r for r in engine._worker.call("history", 5)["requests"] if r["op"] == "synthesize"]
    assert len(requests) - before == 3 and len({r["seed"] for r in requests[before:]}) == 3
    assert clip.samples.size > 0


def test_a_retry_that_sounds_more_plausible_replaces_the_first_clip(
    engine: ChatterboxEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    cut_short = AudioClip(np.zeros(2_400, dtype=np.float32), 24_000)
    whole = AudioClip(np.ones(2_400, dtype=np.float32), 24_000)
    attempts = iter([(cut_short, 0.2), (whole, 0.9)])
    monkeypatch.setattr(engine, "_attempt", lambda *_args: next(attempts))
    assert engine.synthesize("Hello there.", VoiceSpec("default"), 1.0) is whole


def test_build_style_sends_its_prompts(engine: ChatterboxEngine, tmp_path: Path) -> None:
    output = tmp_path / "styles" / "question.safetensors"
    output.parent.mkdir()
    assert engine.build_style([tmp_path / "025.flac", tmp_path / "026.flac"], output) == 15.0
    assert last_request(engine, "style")["prompts"][1].endswith("026.flac") and output.is_file()


def test_a_fine_tuned_voice_sends_its_adapter_and_only_with_its_built_voice(
    engine: ChatterboxEngine, tmp_path: Path
) -> None:
    adapter = tmp_path / "adapter-abc.safetensors"
    voice = VoiceSpec("profile:x", conditioning_path=tmp_path / "v.safetensors", adapter_path=adapter)
    engine.synthesize("Hello.", voice, 1.0)
    assert last_request(engine, "synthesize")["adapter"] == str(adapter)
    engine.synthesize("Hello.", VoiceSpec("profile:q", reference_path=tmp_path / "ref.wav", adapter_path=adapter), 1.0)
    assert last_request(engine, "synthesize")["adapter"] is None  # an adapter belongs to a built voice
    conditioning = tmp_path / "voice.safetensors"
    engine.build_voice(tmp_path / "take-004.flac", conditioning, None)
    engine.audition(Audition(conditioning, ["One."], [tmp_path / "a.wav"], (), seed=3, adapter=adapter))
    sent = last_request(engine, "audition")
    assert sent["adapter"] == str(adapter) and "speakerEmb" not in sent  # scored against the voice's own speaker


def test_fine_tuning_needs_a_gpu(engine: ChatterboxEngine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    takes = [TuningTake(tmp_path / "001.flac", "Hi.")]
    with pytest.raises(ConflictError) as raised:
        engine.start_tuning(takes, tmp_path / "v.safetensors", 8, 1)
    assert raised.value.code == "needs_gpu"
    monkeypatch.setattr(engine, "is_ready", lambda: False)  # and the engine itself, first of all
    with pytest.raises(EngineUnavailableError) as missing:
        engine.start_tuning(takes, tmp_path / "v.safetensors", 8, 1)
    assert missing.value.code == "engine_not_installed"


def test_fine_tuning_runs_epoch_by_epoch_over_the_worker(
    settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    gpu = fake_chatterbox(settings, tmp_path / "gpu", monkeypatch)
    write_marker(gpu._marker, "cuda", None, gpu._venv)
    try:
        takes = [TuningTake(tmp_path / "001.flac", "One."), TuningTake(tmp_path / "008.flac", "Eight.", held_out=True)]
        start = gpu.start_tuning(takes, tmp_path / "v.safetensors", 8, 1234)
        assert start.epoch == 0 and start.held_out_loss == 4.0
        sent = last_request(gpu, "tune_start")
        assert sent["takes"][1] == {"path": str(tmp_path / "008.flac"), "text": "Eight.", "heldOut": True}
        assert sent["epochs"] == 8 and sent["seed"] == 1234
        first, second = gpu.tune_epoch(), gpu.tune_epoch()
        assert (first.epoch, second.epoch) == (1, 2) and second.held_out_loss < first.held_out_loss
        saved = gpu.save_tuning(tmp_path / "adapter.safetensors")
        assert saved.best_epoch == 2 and (tmp_path / "adapter.safetensors").is_file()
        gpu.stop_tuning()
        assert last_request(gpu, "tune_stop")["op"] == "tune_stop"
    finally:
        gpu.close()
    gpu.stop_tuning()  # nothing to stop once the worker is gone
