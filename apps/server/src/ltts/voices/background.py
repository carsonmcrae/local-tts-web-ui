# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Name what a recording's background sounds like, so the advice about it can say what to fix.

Scope: Looks only between the speaker's words (the quietest moments, and longer pauses), so the
speaker's own voice never counts, and names what it hears: a steady ``hum`` (peaks at multiples of 50
or 60 Hz: mains electricity, a nearby device), a low ``rumble`` (mostly below 150 Hz: air
conditioning, a fan, traffic), ``hiss`` (flat, high-frequency noise: a noisy preamp or a gain set too
high), ``clicks`` (short isolated bursts: a desk, a keyboard, mouth clicks) and ``voices`` (pitched
sound in the pauses: other people, a TV or music). Steady kinds are named only when the background
is loud enough to hear. Deterministic NumPy, no models; advice only, never a reason to refuse a take.
Does NOT belong: Judging a take (``take_checks.py``) or reducing noise (``cleanup.py``).
"""

from __future__ import annotations

from typing import Literal

import numpy as np
import numpy.typing as npt

from ltts.audio import Float32Array

Kind = Literal["hum", "rumble", "hiss", "clicks", "voices"]
AUDIBLE_DB = -60.0  # a steady background quieter than this is masked by speech
AUDIBLE_BELOW_SPEECH_DB = 25.0  # ... unless the speech is so quiet that the background is within this of it
MIN_QUIET_S = 0.25  # less audio between words than this is too little to judge
_FRAME_S = 0.04
_CLICK_FRAME_S = 0.005
_Spectrum = tuple[npt.NDArray[np.float64], npt.NDArray[np.float64]]


def _frames(samples: Float32Array, size: int) -> npt.NDArray[np.float64]:
    usable = len(samples) - len(samples) % size
    return samples[:usable].astype(np.float64).reshape(-1, size)


def _levels(frames: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    return np.asarray(10 * np.log10(np.mean(frames**2, axis=1) + 1e-12), dtype=np.float64)


def _spectrum(audio: npt.NDArray[np.float64], sample_rate: int) -> _Spectrum:
    """An averaged power spectrum (Hann windows of about 0.34 s, half overlapping) and its frequencies."""
    size = int(2 ** np.floor(np.log2(min(len(audio), sample_rate * 0.34))))
    hop = size // 2
    starts = range(0, len(audio) - size + 1, hop)
    window = np.hanning(size)
    power = np.mean([np.abs(np.fft.rfft(audio[i : i + size] * window)) ** 2 for i in starts], axis=0)
    return np.asarray(power, dtype=np.float64), np.fft.rfftfreq(size, 1 / sample_rate)


def _hum(power: npt.NDArray[np.float64], freqs: npt.NDArray[np.float64]) -> bool:
    """Narrow peaks at the mains frequency's multiples, well above the spectrum just beside them."""
    for base in (50.0, 60.0):
        ratios: list[float] = []
        for harmonic in range(1, 9):
            centre = base * harmonic
            if centre > 480:
                break
            distance = np.abs(freqs - centre)
            peak, around = power[distance <= 2.5], power[(distance >= 14) & (distance <= 24)]
            if peak.size and around.size:
                ratios.append(10 * float(np.log10(peak.max() / max(float(np.median(around)), 1e-20))))
        if sum(ratio >= 10 for ratio in ratios) >= 2 or max(ratios, default=0.0) >= 18:
            return True
    return False


def _share(
    power: npt.NDArray[np.float64],
    freqs: npt.NDArray[np.float64],
    low: float,
    high: float,
    part: npt.NDArray[np.float64] | None = None,
) -> float:
    """The share of the power between 20 Hz and 8 kHz that lies in ``low``-``high`` (of ``part``, if given)."""
    total = float(power[(freqs >= 20) & (freqs < 8_000)].sum())
    inside = (power if part is None else part)[(freqs >= low) & (freqs < high)]
    return float(inside.sum()) / total if total > 0 else 0.0


def _flat(power: npt.NDArray[np.float64], freqs: npt.NDArray[np.float64], low: float, high: float) -> bool:
    """Spectral flatness of a band: near 1 for hiss, near 0 for tones and voices."""
    band = power[(freqs >= low) & (freqs < high)]
    if band.size < 8:
        return False
    return float(np.exp(np.mean(np.log(band + 1e-20))) / (np.mean(band) + 1e-20)) > 0.3


def _steady(quiet: npt.NDArray[np.float64], sample_rate: int) -> list[Kind]:
    power, freqs = _spectrum(quiet, sample_rate)
    kinds: list[Kind] = []
    if _hum(power, freqs):
        kinds.append("hum")
    mains = np.zeros_like(freqs, dtype=bool)
    for centre in (*range(50, 500, 50), *range(60, 500, 60)):
        mains |= np.abs(freqs - centre) <= 14  # the hum, spread a little by the joins between pauses
    # With a hum, only what lies between its peaks counts as rumble, against everything heard.
    if _share(power, freqs, 20, 150, np.where(mains, 0.0, power) if kinds else None) > 0.5:
        kinds.append("rumble")
    top = min(sample_rate * 0.45, 10_000)
    if top > 5_000 and _share(power, freqs, 2_500, 8_000) > 0.35 and _flat(power, freqs, 2_500, top):
        kinds.append("hiss")
    return kinds


def _clicks(samples: Float32Array, sample_rate: int) -> bool:
    """At least two short bursts (at most 30 ms) with quiet on both sides: taps, knocks or mouth clicks."""
    levels = _levels(_frames(samples, max(int(sample_rate * _CLICK_FRAME_S), 1)))
    if levels.size < 40:
        return False
    floor = float(np.percentile(levels, 20))
    loud = levels > floor + 18
    edges = np.flatnonzero(np.diff(np.concatenate(([0], loud.astype(np.int8), [0]))))
    found = 0
    for start, end in zip(edges[::2], edges[1::2], strict=True):
        before, after = levels[max(start - 12, 0) : start], levels[end : end + 12]
        isolated = before.size == 12 and after.size == 12 and max(before.max(), after.max()) < floor + 8
        found += int(end - start <= 6 and isolated)
    return found >= 2


def _voices(frames: npt.NDArray[np.float64], levels: npt.NDArray[np.float64], sample_rate: int) -> bool:
    """Pitched sound (80-400 Hz) in the pauses, away from the speaker's words, for at least 0.6 s."""
    speech_db, floor_db = float(np.percentile(levels, 95)), float(np.percentile(levels, 10))
    speaking = levels >= speech_db - 15
    near = np.convolve(speaking.astype(np.float64), np.ones(7), mode="same") > 0  # 120 ms either side
    candidates = frames[(levels > floor_db + 10) & ~near]
    if len(candidates) * _FRAME_S < 0.6:
        return False
    spectra = np.fft.rfft(candidates * np.hanning(frames.shape[1]), n=2 * frames.shape[1], axis=1)
    correlation = np.fft.irfft(np.abs(spectra) ** 2, axis=1)
    lags = slice(int(sample_rate / 400), int(sample_rate / 80) + 1)
    periodic = correlation[:, lags].max(axis=1) / np.maximum(correlation[:, 0], 1e-20) > 0.6
    return bool(periodic.sum() * _FRAME_S >= 0.6 and periodic.mean() >= 0.4)


def classify(samples: Float32Array, sample_rate: int) -> list[Kind]:
    """What can be heard behind the speaker in a whole (untrimmed) recording, steadiest first."""
    frames = _frames(samples, max(int(sample_rate * _FRAME_S), 1))
    if len(frames) < 10:
        return []
    levels = _levels(frames)
    speech_db, floor_db = float(np.percentile(levels, 95)), float(np.percentile(levels, 10))
    quiet = frames[levels <= min(floor_db + 6, speech_db - 6)].ravel()  # the quietest moments, never the words
    background_db = 10 * float(np.log10(np.mean(quiet**2) + 1e-12)) if quiet.size else -120.0
    audible = background_db > AUDIBLE_DB or speech_db - background_db < AUDIBLE_BELOW_SPEECH_DB
    kinds = _steady(quiet, sample_rate) if audible and quiet.size >= sample_rate * MIN_QUIET_S else []
    if _clicks(samples, sample_rate):
        kinds.append("clicks")
    if "hum" not in kinds and _voices(frames, levels, sample_rate):
        kinds.append("voices")
    return kinds
