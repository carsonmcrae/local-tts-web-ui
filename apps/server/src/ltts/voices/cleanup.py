# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Clean up a microphone's recordings: background noise, low rumble and tone.

Scope: The ``Cleanup`` a speaker chooses (or accepts as suggested) and applying it to a recording;
measuring a recording's background (its level and how much of it is low rumble) and suggesting the
cleanup it needs, together with the tone correction a bright or thin microphone needs. Noise
reduction is stationary spectral gating, re-implemented in NumPy after the approach of noisereduce
(Tim Sainburg, MIT licence, https://github.com/timsainb/noisereduce): each frequency's noise level is
learnt from the recording's quietest moments, sound that doesn't rise clearly above it is turned down
by the chosen strength, and the mask is smoothed across time and frequency so the result doesn't
warble. The rumble filter is a gentle zero-phase high-pass at 80 Hz; tone is ``audio.apply_tone``.
Does NOT belong: Measuring speech quality (``quality.py``) or storing sessions (``sessions.py``).
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt
from pydantic import Field

from ltts.audio import Float32Array, apply_tone
from ltts.common import ApiModel
from ltts.voices.quality import QualityReport

MAX_TREBLE_CUT_DB = 9.0
MAX_BASS_BOOST_DB = 6.0
NATURAL_BRIGHTNESS_DB = -6.0
NATURAL_BODY_DB = 15.0
LOW_CUT_HZ = 80.0
# Background quieter than this (dBFS) is inaudible next to speech; louder is worth reducing.
AUDIBLE_NOISE_DB = -60.0
LOUD_NOISE_DB = -50.0
RUMBLE_HZ = 100.0
RUMBLE_SHARE = 0.5  # the background is mostly rumble when more than half its power is below 100 Hz
# Spectral gating, as in noisereduce's stationary mode.
_THRESHOLD_STD = 1.5
_SMOOTH_HZ = 500.0
_SMOOTH_MS = 50.0
_QUIET_SHARE = 0.25  # the noise profile is learnt from the quietest quarter of the frames


class Cleanup(ApiModel):
    """How a microphone's recordings are cleaned up before a voice is made from them."""

    noise_reduction: float = Field(default=0.0, ge=0.0, le=1.0)  # 0 off .. 1 strongest
    low_cut: bool = False  # filter out rumble and hum below about 80 Hz
    treble_db: float = Field(default=0.0, ge=-MAX_TREBLE_CUT_DB, le=0.0)  # shelf above about 4 kHz
    bass_db: float = Field(default=0.0, ge=0.0, le=MAX_BASS_BOOST_DB)  # shelf below about 250 Hz

    @property
    def active(self) -> bool:
        return bool(self.noise_reduction or self.low_cut or self.treble_db or self.bass_db)


class RecordingCheck(ApiModel):
    """A recording's quality checks and the cleanup suggested for it (None when it needs none)."""

    report: QualityReport
    suggested: Cleanup | None


# -- applying -----------------------------------------------------------------
def _fit(samples: Float32Array) -> Float32Array:
    """Scale down only if a change pushed the peak past the clipping point."""
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    return samples * np.float32(0.99 / peak) if peak > 0.99 else samples


def _high_pass(samples: Float32Array, sample_rate: int, cutoff: float = LOW_CUT_HZ) -> Float32Array:
    """A 4th-order Butterworth-shaped magnitude response, applied without phase shift."""
    freqs = np.maximum(np.fft.rfftfreq(len(samples), 1 / sample_rate), 1e-3)
    gain = 1 / np.sqrt(1 + (cutoff / freqs) ** 8)
    return np.fft.irfft(np.fft.rfft(samples) * gain, n=len(samples)).astype(np.float32)


def _frame_size(sample_rate: int) -> int:
    """About 40 ms: 1024 samples at 24 kHz, 2048 at 48 kHz."""
    return int(2 ** round(np.log2(sample_rate * 0.04)))


def _stft(samples: Float32Array, size: int) -> tuple[npt.NDArray[np.complex64], int]:
    """Hann-windowed frames every quarter frame; returns the spectra and the padded length."""
    hop = size // 4
    padded = np.pad(samples, (size, size + (-len(samples)) % hop))
    frames = np.lib.stride_tricks.sliding_window_view(padded, size)[::hop] * np.hanning(size + 1)[:-1]
    return np.fft.rfft(frames.astype(np.float32), axis=1).astype(np.complex64), len(padded)


def _istft(spectra: npt.NDArray[np.complex64], size: int, length: int) -> Float32Array:
    """Overlap-add the frames back, dividing out the summed squared window."""
    hop = size // 4
    window = np.hanning(size + 1)[:-1]
    frames = np.fft.irfft(spectra, n=size, axis=1) * window
    out = np.zeros(length)
    norm = np.zeros(length)
    for i, frame in enumerate(frames):
        out[i * hop : i * hop + size] += frame
        norm[i * hop : i * hop + size] += window**2
    return (out / np.maximum(norm, 1e-8)).astype(np.float32)


def _smooth(mask: npt.NDArray[np.float64], width: int, axis: int) -> npt.NDArray[np.float64]:
    """Smooth along one axis with a triangular kernel ``2 * width + 1`` long (edges repeat)."""
    kernel = 1 - np.abs(np.arange(-width, width + 1)) / (width + 1)
    kernel /= kernel.sum()
    moved = np.moveaxis(mask, axis, -1)
    padded = np.pad(moved, [(0, 0), (width, width)], mode="edge")
    out = np.zeros_like(moved)
    for offset, weight in enumerate(kernel):
        out += weight * padded[:, offset : offset + moved.shape[-1]]
    return np.moveaxis(out, -1, axis)


def reduce_noise(samples: Float32Array, sample_rate: int, strength: float) -> Float32Array:
    """Turn down steady background noise by ``strength`` (0..1) wherever speech doesn't rise above it."""
    if strength <= 0 or samples.size == 0:
        return samples
    size = _frame_size(sample_rate)
    spectra, padded = _stft(samples, size)
    level_db = 20 * np.log10(np.maximum(np.abs(spectra), 1e-10))
    energy = level_db.mean(axis=1)
    quiet = level_db[energy <= np.quantile(energy, _QUIET_SHARE)]
    threshold = quiet.mean(axis=0) + _THRESHOLD_STD * quiet.std(axis=0)
    above = (level_db > threshold).astype(np.float64)
    # Kernel spans as in noisereduce: about 100 ms across time and 500 Hz across frequencies. Sound that
    # stays above the noise (speech) keeps full level; brief, isolated peaks (the noise itself) don't.
    steady = _smooth(above, int(_SMOOTH_MS / (1000 * (size // 4) / sample_rate)), axis=0)
    mask = np.maximum(steady, _smooth(steady, int(_SMOOTH_HZ / (sample_rate / (size / 2))), axis=1))
    gain = mask * strength + (1 - strength)
    cleaned = _istft((spectra * gain).astype(np.complex64), size, padded)
    return cleaned[size : size + len(samples)]


def apply_cleanup(samples: Float32Array, sample_rate: int, cleanup: Cleanup) -> Float32Array:
    """Rumble filter, then noise reduction, then tone; never clips."""
    if not cleanup.active:
        return samples
    out = _high_pass(samples, sample_rate) if cleanup.low_cut else samples
    out = reduce_noise(out, sample_rate, cleanup.noise_reduction)
    return _fit(apply_tone(out, sample_rate, cleanup.treble_db, cleanup.bass_db))


# -- suggesting ---------------------------------------------------------------
def background(samples: Float32Array, sample_rate: int) -> tuple[float, float]:
    """The background's level in dBFS (the quietest frames) and the share of its power below 100 Hz."""
    size = _frame_size(sample_rate)
    if samples.size < size:
        return -120.0, 0.0
    usable = len(samples) - len(samples) % size
    frames = samples[:usable].reshape(-1, size)
    power = np.abs(np.fft.rfft(frames * np.hanning(size), axis=1)) ** 2
    energy = np.mean(frames.astype(np.float64) ** 2, axis=1)
    quiet = energy <= np.quantile(energy, 0.1)
    level = round(10 * float(np.log10(max(float(energy[quiet].mean()), 1e-12))), 1)
    freqs = np.fft.rfftfreq(size, 1 / sample_rate)
    total = float(power[quiet][:, freqs >= 20].sum())
    rumble = float(power[quiet][:, (freqs >= 20) & (freqs < RUMBLE_HZ)].sum())
    return level, round(rumble / total, 3) if total > 0 else 0.0


def _tone(report: QualityReport) -> tuple[float, float]:
    codes = {issue.code for issue in report.issues}
    treble = bass = 0.0
    if "bright" in codes and report.brightness_db is not None:
        treble = -min(report.brightness_db - NATURAL_BRIGHTNESS_DB, MAX_TREBLE_CUT_DB)
    if "thin" in codes and report.body_db is not None:
        bass = min(NATURAL_BODY_DB - report.body_db, MAX_BASS_BOOST_DB)
    return round(treble * 2) / 2, round(bass * 2) / 2


def _strength(level: float, noisy: bool) -> float:
    """Noise reduction for a background at ``level`` dBFS: stronger when it's loud or flagged as noisy."""
    if noisy or level > LOUD_NOISE_DB:
        return 0.75
    if level > AUDIBLE_NOISE_DB:
        return 0.5
    return 0.0


def suggest_cleanup(report: QualityReport, samples: Float32Array, sample_rate: int) -> Cleanup | None:
    """The cleanup this recording needs: noise reduction, the rumble filter and tone, or None."""
    if not report.ok:
        return None  # fix the blocking problem (no speech, clipping, noise) first
    level, rumble = background(samples, sample_rate)
    noisy = any(issue.code == "noisy" for issue in report.issues)
    treble, bass = _tone(report)
    suggested = Cleanup(
        noise_reduction=_strength(level, noisy),
        low_cut=level > AUDIBLE_NOISE_DB - 10 and rumble > RUMBLE_SHARE,
        treble_db=treble,
        bass_db=bass,
    )
    return suggested if suggested.active else None
