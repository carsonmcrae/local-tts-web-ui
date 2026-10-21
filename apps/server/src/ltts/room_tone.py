# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Room tone: the faint background a clip carries, to fill the pauses the app adds around it.

Scope: A cloned voice reproduces the hiss or hum of the recordings it was built from while it speaks, so
the digital silence added after a sentence (and between a sentence's narration and quoted speech) makes
that background switch off and on. ``room_tone`` finds a clip's quiet stretches and, when its background
is audible, joins and repeats them with short crossfades to the length wanted, fading in and out; a clean
clip (a built-in voice) gets true silence, as before. It is deterministic, so a sentence always sounds the
same and exports match playback.
Does NOT belong: Trimming or shortening pauses inside speech (``engines/cloned_speech.polish``).
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

Float32Array = npt.NDArray[np.float32]  # as in ``ltts.audio``, which uses this module

FRAME_S = 0.01
AUDIBLE_DBFS = -66.0  # a quieter background is left as silence
SPEECH_MARGIN_DB = 20.0  # the background must be this far below the speech to be background, not speech
QUIET_DB = 4.0  # frames this close to the background's level count as background
MIN_RUN_FRAMES = 3  # stretches shorter than 30 ms are left out (they are gaps between sounds)
MIN_TONE_S = 0.08  # with less background than this to repeat, the pause stays silent
CROSSFADE_S = 0.01


def _frame_levels(samples: Float32Array, frame: int) -> np.ndarray:
    usable = len(samples) - len(samples) % frame
    frames = samples[:usable].reshape(-1, frame).astype(np.float64)
    return 20 * np.log10(np.sqrt(np.mean(frames**2, axis=1)) + 1e-12)


def _join(parts: list[Float32Array], overlap: int) -> Float32Array:
    """Pieces of background joined end to start with equal-power crossfades (no clicks)."""
    if not parts:
        return np.zeros(0, dtype=np.float32)
    out = parts[0].astype(np.float32)
    for part in parts[1:]:
        n = min(overlap, len(out) // 2, len(part) // 2)
        if n < 2:
            out = np.concatenate([out, part])
            continue
        t = np.linspace(0.0, np.pi / 2, n, dtype=np.float32)
        mixed = out[-n:] * np.cos(t) + part[:n] * np.sin(t)
        out = np.concatenate([out[:-n], mixed, part[n:]])
    return out.astype(np.float32)


def _background(samples: Float32Array, rate: int) -> Float32Array:
    """The clip's quiet stretches joined together, or nothing when its background is inaudible."""
    frame = max(int(rate * FRAME_S), 1)
    if len(samples) < frame * MIN_RUN_FRAMES * 2:
        return np.zeros(0, dtype=np.float32)
    levels = _frame_levels(samples, frame)
    floor, speech = float(np.percentile(levels, 10)), float(np.percentile(levels, 95))
    if floor < AUDIBLE_DBFS or speech - floor < SPEECH_MARGIN_DB:
        return np.zeros(0, dtype=np.float32)
    quiet = levels <= floor + QUIET_DB
    quiet[:1] = quiet[-1:] = False  # the clip's own edges are faded, not background
    runs: list[Float32Array] = []
    start = None
    for index, is_quiet in enumerate([*quiet, False]):
        if is_quiet and start is None:
            start = index
        elif not is_quiet and start is not None:
            if index - start >= MIN_RUN_FRAMES:
                runs.append(samples[start * frame : index * frame])
            start = None
    tone = _join(runs, int(rate * CROSSFADE_S))
    return tone if len(tone) >= rate * MIN_TONE_S else np.zeros(0, dtype=np.float32)


def room_tone(samples: Float32Array, rate: int, seconds: float) -> Float32Array:
    """``seconds`` of the clip's own background (faded in and out), or of silence for a clean clip."""
    length = max(int(rate * seconds), 0)
    background = _background(samples, rate) if length else np.zeros(0, dtype=np.float32)
    if background.size == 0:
        return np.zeros(length, dtype=np.float32)
    overlap = int(rate * CROSSFADE_S)
    parts = [background]
    while sum(len(part) for part in parts) - overlap * (len(parts) - 1) < length:
        parts.append(background[::-1] if len(parts) % 2 else background)  # reversed copies repeat less audibly
    tone = _join(parts, overlap)[:length].copy()
    fade = min(int(rate * CROSSFADE_S), length // 2)
    if fade:
        ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
        tone[:fade] *= ramp
        tone[-fade:] *= ramp[::-1]
    return tone
