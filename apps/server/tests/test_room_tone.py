# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for room tone in the pauses the app adds after sentences and between their pieces.

Scope: A clip with an audible background gets steady noise at about its level (not silence) in its pause,
faded in and out and the same every time, never copies of the clicks or murmur in its quiet moments; a
clean clip and a clip that is all speech get silence; the pause after a rendered sentence and the gap
between its narration and quoted speech carry it.
Does NOT belong: Pauses inside speech (test_voice_styles.py, ``polish``).
"""

from __future__ import annotations

import numpy as np

from ltts.audio import finalize_segment
from ltts.engines.base import AudioClip, VoiceSpec
from ltts.engines.registry import ResolvedVoice
from ltts.room_tone import room_tone
from ltts.synthesis.render import PIECE_GAP_S, Piece, RenderJob, render

RATE = 24_000


def _speech_with_hiss(hiss_db: float, seconds: float = 3.0, seed: int = 0) -> np.ndarray:
    """Bursts of a loud tone (speech) with steady hiss underneath, and hiss-only gaps between them."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(RATE * seconds)) / RATE
    hiss = rng.normal(0, 10 ** (hiss_db / 20), t.size)
    voiced = (np.sin(2 * np.pi * 1.5 * t) > 0).astype(float)  # on and off, like words and gaps
    return (hiss + 0.2 * voiced * np.sin(2 * np.pi * 180 * t)).astype(np.float32)


def _db(samples: np.ndarray) -> float:
    return float(20 * np.log10(np.sqrt(np.mean(samples.astype(np.float64) ** 2)) + 1e-12))


def test_a_clip_with_audible_hiss_keeps_it_through_the_pause() -> None:
    clip = _speech_with_hiss(-48.0)
    tone = room_tone(clip, RATE, 0.6)
    assert tone.size == int(RATE * 0.6)
    middle = tone[int(RATE * 0.05) : -int(RATE * 0.05)]
    assert abs(_db(middle) - -48.0) < 3  # the same level as the hiss under the speech
    assert tone[0] == 0 and tone[-1] == 0  # faded in and out: no clicks against the clip's own fades
    assert np.array_equal(tone, room_tone(clip, RATE, 0.6))  # the same sentence always sounds the same
    assert np.max(np.abs(np.diff(middle))) < 10 ** (-48 / 20) * 12  # joined without jumps


def test_clicks_and_murmur_in_the_quiet_moments_are_never_copied() -> None:
    clip = _speech_with_hiss(-48.0, seconds=4.0)
    quiet = np.flatnonzero(np.abs(clip) < 0.02)
    clip[quiet[:: RATE // 7]] = 0.3  # lip clicks in the gaps
    tone = room_tone(clip, RATE, 1.0)[int(RATE * 0.02) : -int(RATE * 0.02)]
    rms = np.sqrt(np.mean(tone.astype(np.float64) ** 2))
    assert np.max(np.abs(tone)) / rms < 6  # Gaussian-like noise, no copied spikes
    frames = tone[: len(tone) - len(tone) % 240].reshape(-1, 240).astype(np.float64)
    assert np.std(20 * np.log10(np.sqrt(np.mean(frames**2, axis=1)))) < 2.5  # steady, not murmuring


def test_clean_clips_and_all_speech_get_silence() -> None:
    assert not room_tone(_speech_with_hiss(-90.0), RATE, 0.5).any()  # a built-in voice's clean pauses
    t = np.arange(RATE * 2) / RATE
    tone_only = (0.2 * np.sin(2 * np.pi * 180 * t)).astype(np.float32)  # no background to copy
    assert not room_tone(tone_only, RATE, 0.5).any()
    assert room_tone(_speech_with_hiss(-48.0), RATE, 0.0).size == 0


def test_the_pause_after_a_sentence_carries_the_background() -> None:
    clip = _speech_with_hiss(-50.0)
    out = finalize_segment(clip, RATE, "sentence")
    pause = out[clip.size :]
    assert pause.size == int(RATE * 0.28) and pause.any()
    clean = finalize_segment(_speech_with_hiss(-95.0), RATE, "sentence", 0.4)
    assert not clean[-int(RATE * 0.4) :].any()


def test_the_gap_between_narration_and_quoted_speech_keeps_the_background() -> None:
    class Hissy:
        id = "chatterbox"

        def synthesize(self, text: str, spec: VoiceSpec, pace: float) -> AudioClip:
            return AudioClip(_speech_with_hiss(-50.0, seconds=1.0, seed=len(text)), RATE)

    voice = ResolvedVoice("custom:me", Hissy(), VoiceSpec(key="me"), "r1")  # type: ignore[arg-type]
    job = RenderJob((Piece(voice, voice.spec, '"Hello,"'), Piece(voice, voice.spec, "she said.")), "sentence", 1.0)
    out = render(job).samples
    gap = out[RATE : RATE + int(RATE * PIECE_GAP_S)]
    assert gap.size and _db(gap[240:-240]) > -60  # not digital silence between the two pieces
