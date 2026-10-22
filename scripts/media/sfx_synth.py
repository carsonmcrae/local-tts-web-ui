# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Small, deterministic sound-synthesis primitives for building the bundled sound effects.

Scope: Seeded noise (white, pink, brown), smooth band-pass filtering in the frequency domain,
envelopes, decaying sine partials (bells, impacts), impulse scatters (rain, crackle), frequency
sweeps (chirps, howls, passing vehicles), slow random modulation, a simple room tail and loop
blending. Everything is mono float64 at one sample rate and uses NumPy only, so the whole library
can be rebuilt from the repository by anyone, with no recordings and no third-party rights.
Does NOT belong: The recipes for particular sounds, levels or encoding (sound-library.py).
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np

from ltts.effects import _room  # the voice effects' reverb; this script runs in the server's environment

RATE = 48_000
Signal = np.ndarray


def seconds(duration: float) -> int:
    return int(round(duration * RATE))


def silence(duration: float) -> Signal:
    return np.zeros(seconds(duration))


def white(duration: float, seed: int) -> Signal:
    return np.random.default_rng(seed).standard_normal(seconds(duration))


def pink(duration: float, seed: int) -> Signal:
    """Noise whose power falls 3 dB per octave (shaped in the frequency domain)."""
    noise = white(duration, seed)
    spectrum = np.fft.rfft(noise)
    freqs = np.fft.rfftfreq(noise.size, 1 / RATE)
    spectrum /= np.sqrt(np.maximum(freqs, 20.0))
    return np.fft.irfft(spectrum, n=noise.size) * np.sqrt(RATE / 2)


def brown(duration: float, seed: int) -> Signal:
    """Noise whose power falls 6 dB per octave: deep rumbles."""
    noise = white(duration, seed)
    spectrum = np.fft.rfft(noise)
    freqs = np.fft.rfftfreq(noise.size, 1 / RATE)
    spectrum /= np.maximum(freqs, 20.0)
    return np.fft.irfft(spectrum, n=noise.size) * RATE / 20


def band(signal: Signal, low: float, high: float, order: float = 2.0) -> Signal:
    """Keep ``low``..``high`` Hz with gentle Butterworth-shaped skirts (no ringing, no phase shift)."""
    spectrum = np.fft.rfft(signal)
    freqs = np.fft.rfftfreq(signal.size, 1 / RATE)
    safe = np.maximum(freqs, 1e-3)
    gain = 1 / np.sqrt(1 + (low / safe) ** (2 * order)) / np.sqrt(1 + (safe / high) ** (2 * order))
    return np.fft.irfft(spectrum * gain, n=signal.size)


def envelope(duration: float, attack: float, decay: float, hold: float = 0.0, curve: float = 1.0) -> Signal:
    """Rise over ``attack`` seconds, hold, then fall exponentially so it is ~60 dB down after ``decay``."""
    n = seconds(duration)
    t = np.arange(n) / RATE
    rise = np.clip(t / max(attack, 1e-4), 0, 1) ** curve
    fall_from = attack + hold
    fall = np.where(t > fall_from, np.exp(-6.9 * (t - fall_from) / max(decay, 1e-4)), 1.0)
    return rise * fall


def linear_fade(signal: Signal, fade_in: float = 0.005, fade_out: float = 0.02) -> Signal:
    out = signal.copy()
    a, b = min(seconds(fade_in), out.size // 2), min(seconds(fade_out), out.size // 2)
    if a:
        out[:a] *= np.linspace(0, 1, a)
    if b:
        out[-b:] *= np.linspace(1, 0, b)
    return out


def partials(duration: float, freq: float, ratios: list[tuple[float, float, float]], seed: int = 0) -> Signal:
    """Decaying sine partials: each ratio is (frequency multiple, relative level, decay seconds)."""
    t = np.arange(seconds(duration)) / RATE
    rng = np.random.default_rng(seed)
    out = np.zeros_like(t)
    for ratio, level, decay in ratios:
        phase = rng.uniform(0, 2 * np.pi)
        out += level * np.sin(2 * np.pi * freq * ratio * t + phase) * np.exp(-6.9 * t / decay)
    return out


def sweep(duration: float, start_hz: float, end_hz: float, shape: Callable[[Signal], Signal] | None = None) -> Signal:
    """A sine whose frequency glides from ``start_hz`` to ``end_hz`` (``shape`` maps 0..1 progress to 0..1)."""
    n = seconds(duration)
    progress = np.linspace(0, 1, n)
    if shape is not None:
        progress = shape(progress)
    freq = start_hz + (end_hz - start_hz) * progress
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    return np.sin(phase)


def harmonics(duration: float, freq_curve: Signal, levels: list[float]) -> Signal:
    """A buzzing tone with the given harmonic levels, following a per-sample frequency curve."""
    phase = 2 * np.pi * np.cumsum(freq_curve) / RATE
    out = np.zeros(seconds(duration))
    for number, level in enumerate(levels, start=1):
        out += level * np.sin(number * phase[: out.size])
    return out


def wobble(duration: float, rate_hz: float, depth: float, seed: int) -> Signal:
    """Slow random modulation around 1.0: smoothed noise, ±``depth``."""
    n = seconds(duration)
    coarse = np.random.default_rng(seed).standard_normal(int(duration * rate_hz) + 2)
    fine = np.interp(np.linspace(0, coarse.size - 1, n), np.arange(coarse.size), coarse)
    fine /= max(np.max(np.abs(fine)), 1e-9)
    return 1.0 + depth * fine


def scatter(duration: float, per_second: float, grain: Signal, seed: int, level_spread: float = 0.6) -> Signal:
    """``grain`` dropped at random moments (``per_second`` on average) with random levels."""
    out = silence(duration)
    rng = np.random.default_rng(seed)
    count = int(duration * per_second)
    for at in rng.integers(0, max(out.size - grain.size, 1), count):
        out[at : at + grain.size] += grain * rng.uniform(1 - level_spread, 1.0)
    return out


def at(target: Signal, moment: float, piece: Signal, level: float = 1.0) -> None:
    """Mix ``piece`` into ``target`` starting ``moment`` seconds in (clipped to the end)."""
    start = seconds(moment)
    end = min(start + piece.size, target.size)
    if start < end:
        target[start:end] += level * piece[: end - start]


def room(signal: Signal, seconds_long: float, mix: float, seed: int) -> Signal:
    """A simple reverberant tail: the server's own room (decaying-noise convolution), so there is one."""
    return _room(np.asarray(signal, dtype=np.float64), RATE, seconds_long, mix, seed)


def loopable(signal: Signal, blend: float) -> Signal:
    """Blend the last ``blend`` seconds into the first so the end leads straight back to the start."""
    x = seconds(blend)
    body = signal[:-x].copy()
    head, tail = body[:x], signal[-x:]
    ramp = np.linspace(0, np.pi / 2, x)
    body[:x] = head * np.sin(ramp) + tail * np.cos(ramp)
    return body


def mix(*signals: Signal) -> Signal:
    """The sum of signals of any lengths, padded to the longest."""
    length = max(signal.size for signal in signals)
    out = np.zeros(length)
    for signal in signals:
        out[: signal.size] += signal
    return out
