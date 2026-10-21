# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Sound effects a reader can put on chosen sentences: a loudspeaker, a phone call, a radio.

Scope: Six deterministic effects on a mono clip, in plain NumPy: ``loudspeaker`` (a public-address
announcement: narrow band, driven, with slap echoes in a big space), ``telephone`` (narrow band, a
little distortion), ``radio`` (broadcast band, compressed, faint static), ``hall`` (a large room),
``distant`` (muffled, far away) and ``robot`` (ring-modulated, metallic). Every effect keeps the
clip's speech loudness, stays below -1 dBFS, and may add a short tail for its echo. Noise and room
responses come from fixed seeds, so the same sentence always sounds the same (and caches).
Does NOT belong: Choosing which sentences get an effect (``documents.styling``) or synthesis.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Literal

import numpy as np

from ltts.audio import Float32Array

Effect = Literal["loudspeaker", "telephone", "radio", "hall", "distant", "robot"]
EFFECTS: tuple[Effect, ...] = ("loudspeaker", "telephone", "radio", "hall", "distant", "robot")
PEAK = 10 ** (-1 / 20)


def _band(samples: np.ndarray, rate: int, low: float, high: float) -> np.ndarray:
    """Keep ``low``-``high`` Hz, with gentle (half-octave cosine) edges so the cut doesn't ring."""
    spectrum = np.fft.rfft(samples)
    freqs = np.fft.rfftfreq(samples.size, 1 / rate)
    gain = np.ones_like(freqs)
    below, above = freqs < low, freqs > high
    gain[below] = 0.5 + 0.5 * np.cos(np.pi * np.clip(np.log2(low / np.maximum(freqs[below], 1.0)) * 2, 0, 1))
    gain[above] = 0.5 + 0.5 * np.cos(np.pi * np.clip(np.log2(freqs[above] / high) * 2, 0, 1))
    return np.asarray(np.fft.irfft(spectrum * gain, n=samples.size), dtype=np.float64)


def _drive(samples: np.ndarray, amount: float) -> np.ndarray:
    peak = float(np.max(np.abs(samples))) or 1.0
    return np.asarray(np.tanh(amount * samples / peak) / np.tanh(amount) * peak, dtype=np.float64)


def _tail(samples: np.ndarray, rate: int, seconds: float) -> np.ndarray:
    return np.concatenate([samples, np.zeros(int(seconds * rate))])


def _room(samples: np.ndarray, rate: int, seconds: float, mix: float, seed: int) -> np.ndarray:
    """A room: decaying noise as the impulse response, mixed with the dry sound (tail included)."""
    length = int(seconds * rate)
    rng = np.random.default_rng(seed)
    response = rng.standard_normal(length) * np.exp(-6.9 * np.arange(length) / length)  # -60 dB at the end
    response /= np.sqrt(np.sum(response**2))
    dry = _tail(samples, rate, seconds)
    size = 1 << int(np.ceil(np.log2(dry.size + length)))
    wet = np.fft.irfft(np.fft.rfft(dry, size) * np.fft.rfft(response, size), size)[: dry.size]
    return (1 - mix) * dry + mix * wet


def _echo(samples: np.ndarray, rate: int, delays: tuple[float, ...], gains: tuple[float, ...]) -> np.ndarray:
    out = _tail(samples, rate, max(delays))
    for delay, gain in zip(delays, gains, strict=True):
        start = int(delay * rate)
        out[start : start + samples.size] += gain * samples
    return out


def _noise(length: int, level: float, seed: int) -> np.ndarray:
    return np.asarray(level * np.random.default_rng(seed).standard_normal(length), dtype=np.float64)


def _loudspeaker(x: np.ndarray, rate: int) -> np.ndarray:
    horn = _drive(_band(x, rate, 450, 3_200), 3.0)
    return _room(_echo(horn, rate, (0.11, 0.23), (0.35, 0.18)), rate, 1.4, 0.35, seed=11)


def _telephone(x: np.ndarray, rate: int) -> np.ndarray:
    line = _drive(_band(x, rate, 320, 3_300), 2.0)
    return np.asarray(line + _noise(line.size, 0.002 * float(np.max(np.abs(line)) or 1.0), seed=12))


def _radio(x: np.ndarray, rate: int) -> np.ndarray:
    band = _band(x, rate, 180, 5_500)
    squeezed = band / (1 + 2.5 * np.abs(band) / (float(np.max(np.abs(band))) or 1.0))
    static = _band(_noise(band.size, 1.0, seed=13), rate, 1_000, 8_000)
    return squeezed + 0.01 * float(np.max(np.abs(squeezed)) or 1.0) * static / (float(np.max(np.abs(static))) or 1.0)


def _hall(x: np.ndarray, rate: int) -> np.ndarray:
    return _room(x, rate, 2.2, 0.35, seed=14)


def _distant(x: np.ndarray, rate: int) -> np.ndarray:
    return 0.5 * _room(_band(x, rate, 90, 2_400), rate, 1.6, 0.55, seed=15)


def _robot(x: np.ndarray, rate: int) -> np.ndarray:
    t = np.arange(x.size) / rate
    ringed = 0.75 * x * np.sin(2 * np.pi * 55 * t) + 0.25 * x
    return _echo(ringed, rate, (0.007, 0.014), (0.5, 0.25))


_EFFECTS: dict[Effect, Callable[[np.ndarray, int], np.ndarray]] = {
    "loudspeaker": _loudspeaker,
    "telephone": _telephone,
    "radio": _radio,
    "hall": _hall,
    "distant": _distant,
    "robot": _robot,
}


def _rms(samples: np.ndarray) -> float:
    loud = samples[np.abs(samples) > 0.02 * (float(np.max(np.abs(samples))) or 1.0)]
    return float(np.sqrt(np.mean(loud**2))) if loud.size else 0.0


def apply_effect(effect: Effect, samples: Float32Array, rate: int) -> Float32Array:
    """``samples`` through ``effect``, at the same speech loudness and never above -1 dBFS."""
    if samples.size == 0:
        return samples
    dry = samples.astype(np.float64)
    wet = _EFFECTS[effect](dry, rate)
    level, before = _rms(wet), _rms(dry)
    if level > 0 and before > 0:
        wet *= before / level
    peak = float(np.max(np.abs(wet)))
    if peak > PEAK:
        wet *= PEAK / peak
    return wet.astype(np.float32)
