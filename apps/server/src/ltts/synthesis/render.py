# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Turn one planned sentence into audio: its pieces, voices, effect and pause.

Scope: A render job holds one or more pieces. Each piece is the spoken text, the resolved voice and
that voice's spec with the sentence's speaking style, take and steadiness applied. A sentence that
mixes narration and quoted speech has a piece per voice, joined with a short gap.

The cache key covers everything that changes the sound. A plain single-voice sentence keeps exactly
the key it always had, and an extra (effect, style, take, steadiness, pause) is part of the key only
when it applies, so existing cached audio stays valid. Rendering resamples pieces to one rate,
applies the effect, then fades the clip and adds its pause.
Does NOT belong: Planning (``documents/styling.py``), scheduling or caching (``service.py``).
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import Any

import numpy as np

from ltts.audio import Float32Array, finalize_segment
from ltts.effects import Effect, apply_effect
from ltts.engines.base import AudioClip, VoiceSpec
from ltts.engines.registry import ResolvedVoice
from ltts.errors import SynthesisError
from ltts.synthesis.cache import cache_key

TAKE_ENGINES = frozenset({"chatterbox"})  # engines whose output varies with the seed, so a new take differs
PIECE_GAP_S = 0.12


@dataclass(frozen=True, slots=True)
class Piece:
    voice: ResolvedVoice
    spec: VoiceSpec
    spoken: str

    def extras(self) -> dict[str, Any]:
        """What besides text and voice changes this piece's sound (only what applies to its engine)."""
        found: dict[str, Any] = {}
        if self.spec.styles and self.spec.style:
            found["style"] = self.spec.style
        if self.spec.take and self.voice.engine.id in TAKE_ENGINES:
            found["take"] = self.spec.take
        if self.spec.steady and self.voice.engine.id in TAKE_ENGINES:
            found["steady"] = True
        return found


def tuned(voice: ResolvedVoice, style: str | None, take: int, steady: bool) -> VoiceSpec:
    """The voice's spec with the sentence's style (studio voices only), take and steadiness."""
    return dataclasses.replace(voice.spec, style=style if voice.spec.styles else None, take=take, steady=steady)


@dataclass(frozen=True, slots=True)
class RenderJob:
    pieces: tuple[Piece, ...]
    boundary: str
    pace: float
    effect: Effect | None = None
    pause_ms: int | None = None

    @property
    def engine_id(self) -> str:
        """The queue this job waits in: a cloning engine when any piece needs one (it is the bottleneck)."""
        engines = [piece.voice.engine.id for piece in self.pieces]
        return next((engine for engine in engines if engine in TAKE_ENGINES), engines[0])

    @property
    def voice_id(self) -> str:
        return self.pieces[0].voice.voice_id

    def key(self) -> str:
        extra: dict[str, Any] = {}
        if self.effect:
            extra["effect"] = self.effect
        if self.pause_ms is not None:
            extra["pause_ms"] = self.pause_ms
        if len(self.pieces) == 1:
            piece = self.pieces[0]
            return cache_key(
                engine=piece.voice.engine.revision(),
                voice=piece.voice.voice_id,
                voice_revision=piece.voice.revision,
                pace=round(self.pace, 2),
                boundary=self.boundary,
                text=piece.spoken,
                **piece.extras(),
                **extra,
            )
        parts = [
            {"engine": p.voice.engine.revision(), "voice": p.voice.voice_id, "voice_revision": p.voice.revision,
             "text": p.spoken, **p.extras()}
            for p in self.pieces
        ]  # fmt: skip
        return cache_key(parts=parts, pace=round(self.pace, 2), boundary=self.boundary, **extra)


def _resample(samples: Float32Array, rate: int, target: int) -> Float32Array:
    if rate == target or samples.size == 0:
        return samples
    positions = np.linspace(0, samples.size - 1, round(samples.size * target / rate))
    return np.interp(positions, np.arange(samples.size), samples).astype(np.float32)


def render(job: RenderJob) -> AudioClip:
    """Synthesise every piece, join them, apply the effect, then fade and add the pause."""
    clips = [piece.voice.engine.synthesize(piece.spoken, piece.spec, job.pace) for piece in job.pieces]
    if any(clip.samples.size == 0 for clip in clips):
        raise SynthesisError("The engine returned no audio for this passage.", code="empty_audio")
    rate = clips[0].sample_rate
    gap = np.zeros(int(PIECE_GAP_S * rate), dtype=np.float32)
    joined: list[Float32Array] = []
    for position, clip in enumerate(clips):
        if position:
            joined.append(gap)
        joined.append(_resample(clip.samples, clip.sample_rate, rate))
    samples = np.concatenate(joined).astype(np.float32)
    raw = apply_effect(job.effect, samples, rate) if job.effect else samples
    pause = None if job.pause_ms is None else job.pause_ms / 1000
    return AudioClip(finalize_segment(raw, rate, job.boundary, pause), rate)
