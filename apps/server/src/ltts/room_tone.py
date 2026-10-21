# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Room tone: the faint background a clip carries, to fill the pauses the app adds around it.

Scope: A cloned voice reproduces the hiss or hum of the recordings it was built from while it speaks, so
the digital silence added after a sentence (and between a sentence's narration and quoted speech) makes
that background switch off and on. ``room_tone`` measures the spectrum and level of a clip's quietest
moments and, when its background is audible, makes steady noise with that spectrum, a little quieter,
faded in and out. Nothing of the clip itself is copied, so breaths, lip noises and the tails of words in
its quiet moments are never repeated. A clean clip (a built-in voice) gets true silence, as before. The
noise is seeded from the clip, so a sentence always sounds the same and exports match playback.
Does NOT belong: Trimming or shortening pauses inside speech (``engines/cloned_speech.polish``).
"""

from __future__ import annotations

import zlib

import numpy as np
import numpy.typing as npt

Float32Array = npt.NDArray[np.float32]  # as in ``ltts.audio``, which uses this module

FRAME_S = 0.02
AUDIBLE_DBFS = -66.0  # a quieter background is left as silence
SPEECH_MARGIN_DB = 20.0  # the background must be this far below the speech to be background, not speech
QUIETEST = 10.0  # percent of the clip's frames, its quietest, that describe the background
MIN_FRAMES = 4  # with fewer quiet frames than this (80 ms), the pause stays silent
BELOW_DB = 2.0  # the fill sits this much under the measured background, so it never stands out
SMOOTH_BINS = 5  # the background's spectrum is smoothed, so no tone of the clip is copied either
FADE_S = 0.01


def _frames(samples: Float32Array, frame: int) -> np.ndarray:
    usable = len(samples) - len(samples) % frame
    return samples[:usable].reshape(-1, frame).astype(np.float64)


def _background(samples: Float32Array, rate: int) -> tuple[np.ndarray, float] | None:
    """The smoothed magnitude spectrum and RMS of the clip's quietest frames, when its background is audible."""
    frame = max(int(rate * FRAME_S), 2)
    frames = _frames(samples, frame)[1:-1]  # the clip's own edges are faded, not background
    if len(frames) < MIN_FRAMES * 3:
        return None
    levels = 20 * np.log10(np.sqrt(np.mean(frames**2, axis=1)) + 1e-12)
    floor, speech = float(np.percentile(levels, QUIETEST)), float(np.percentile(levels, 95))
    if floor < AUDIBLE_DBFS or speech - floor < SPEECH_MARGIN_DB:
        return None
    quiet = frames[levels <= floor]
    if len(quiet) < MIN_FRAMES:
        return None
    power = np.mean(np.abs(np.fft.rfft(quiet * np.hanning(frame), axis=1)) ** 2, axis=0)
    spectrum = np.sqrt(np.convolve(power, np.ones(SMOOTH_BINS) / SMOOTH_BINS, mode="same"))
    return spectrum, float(np.sqrt(np.mean(quiet**2)))


def room_tone(samples: Float32Array, rate: int, seconds: float) -> Float32Array:
    """``seconds`` of steady noise shaped like the clip's background (faded in and out), or silence."""
    length = max(int(rate * seconds), 0)
    background = _background(samples, rate) if length else None
    if background is None:
        return np.zeros(length, dtype=np.float32)
    spectrum, rms = background
    size = 1 << max(int(np.ceil(np.log2(length))), 1)
    rng = np.random.default_rng(zlib.crc32(samples.tobytes()))  # the same clip always gets the same noise
    white = np.fft.rfft(rng.standard_normal(size))
    shape = np.interp(np.linspace(0, 1, len(white)), np.linspace(0, 1, len(spectrum)), spectrum)
    noise = np.fft.irfft(white * shape, size)[:length]
    level = float(np.sqrt(np.mean(noise**2)))
    tone = (noise * (rms * 10 ** (-BELOW_DB / 20) / level if level > 0 else 0.0)).astype(np.float32)
    fade = min(int(rate * FADE_S), length // 2)
    if fade:
        ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
        tone[:fade] *= ramp
        tone[-fade:] *= ramp[::-1]
    return tone
