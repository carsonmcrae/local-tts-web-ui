# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Small, dependency-light audio utilities shared by synthesis, export and voice profiles.

Scope: Natural pauses after segments (by boundary type), click-free fades, peak normalisation,
silence trimming, splitting a long recording into takes at pauses, gentle shelving tone correction,
mono conversion, and WAV encode/decode through soundfile (libsndfile).
Does NOT belong: Engine inference or recording-quality analysis (``voices/quality.py``).
"""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import numpy.typing as npt
import soundfile as sf

Float32Array = npt.NDArray[np.float32]

PAUSE_SECONDS = {"sentence": 0.28, "paragraph": 0.62, "section": 1.2}
FADE_SECONDS = 0.006


def to_mono(samples: npt.NDArray[np.floating]) -> Float32Array:
    data = np.asarray(samples, dtype=np.float32)
    return data.mean(axis=1).astype(np.float32) if data.ndim == 2 else data


def apply_fades(samples: Float32Array, sample_rate: int, seconds: float = FADE_SECONDS) -> Float32Array:
    out = samples.copy()
    n = min(int(sample_rate * seconds), len(out) // 2)
    if n > 0:
        ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)
        out[:n] *= ramp
        out[-n:] *= ramp[::-1]
    return out


def finalize_segment(samples: Float32Array, sample_rate: int, boundary: str) -> Float32Array:
    """Fade the clip edges and append the pause that follows this kind of boundary."""
    pause = np.zeros(int(sample_rate * PAUSE_SECONDS.get(boundary, 0.3)), dtype=np.float32)
    clipped = np.clip(apply_fades(samples, sample_rate), -1.0, 1.0)
    return np.concatenate([clipped, pause])


def normalize_peak(samples: Float32Array, target_dbfs: float = -1.0) -> Float32Array:
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    if peak <= 1e-6:
        return samples
    gain = (10 ** (target_dbfs / 20)) / peak
    return (samples * gain).astype(np.float32)


def frame_rms_db(samples: Float32Array, sample_rate: int, frame_s: float = 0.03) -> Float32Array:
    frame = max(int(sample_rate * frame_s), 1)
    usable = len(samples) - len(samples) % frame
    if usable == 0:
        return np.array([-120.0], dtype=np.float32)
    frames = samples[:usable].reshape(-1, frame)
    rms = np.sqrt(np.mean(frames**2, axis=1) + 1e-12)
    return (20 * np.log10(rms)).astype(np.float32)


def trim_silence(samples: Float32Array, sample_rate: int, threshold_db: float = -45.0) -> Float32Array:
    frame = max(int(sample_rate * 0.03), 1)
    levels = frame_rms_db(samples, sample_rate)
    voiced = np.nonzero(levels > threshold_db)[0]
    if voiced.size == 0:
        return samples[:0]
    start = max(int(voiced[0]) - 2, 0) * frame
    end = min((int(voiced[-1]) + 3) * frame, len(samples))
    return samples[start:end]


def _voiced_runs(voiced: npt.NDArray[np.bool_], gap_frames: int) -> list[tuple[int, int]]:
    """Frame ranges of speech, ending wherever at least ``gap_frames`` silent frames follow."""
    runs: list[tuple[int, int]] = []
    start: int | None = None
    last = 0
    for index, is_voiced in enumerate(voiced):
        if is_voiced:
            start = index if start is None else start
            last = index
        elif start is not None and index - last >= gap_frames:
            runs.append((start, last + 1))
            start = None
    if start is not None:
        runs.append((start, last + 1))
    return runs


def _join_runs(runs: list[tuple[int, int]], min_frames: int, max_frames: int) -> list[tuple[int, int]]:
    """Join consecutive runs while the take is shorter than ``min_frames`` and stays within ``max_frames``."""
    takes: list[list[int]] = []
    for start, end in runs:
        if takes and takes[-1][1] - takes[-1][0] < min_frames and end - takes[-1][0] <= max_frames:
            takes[-1][1] = end
        else:
            takes.append([start, end])
    return [(start, end) for start, end in takes]


def split_at_pauses(
    samples: Float32Array, sample_rate: int, *, min_s: float = 5.0, max_s: float = 20.0, gap_s: float = 0.6
) -> list[Float32Array]:
    """Cut a long recording into takes at pauses of at least ``gap_s``, keeping a little room tone around each."""
    frame_s = 0.03
    frame = max(int(sample_rate * frame_s), 1)
    levels = frame_rms_db(samples, sample_rate, frame_s)
    # Speech is anything clearly above this recording's own quiet floor.
    voiced = levels > max(float(np.percentile(levels, 10)) + 12, -50.0)
    runs = _join_runs(_voiced_runs(voiced, round(gap_s / frame_s)), round(min_s / frame_s), round(max_s / frame_s))
    pad = round(0.15 / frame_s)
    return [samples[max(0, (start - pad) * frame) : (end + pad) * frame] for start, end in runs]


TREBLE_SHELF_HZ = 4_000.0
BASS_SHELF_HZ = 250.0


def apply_tone(samples: Float32Array, sample_rate: int, treble_db: float, bass_db: float) -> Float32Array:
    """Shelving EQ as a smooth, zero-phase gain curve: ``treble_db`` above ~4 kHz, ``bass_db`` below ~250 Hz.

    The result is scaled down if the boost would clip.
    """
    if not treble_db and not bass_db:
        return samples
    freqs = np.maximum(np.fft.rfftfreq(len(samples), 1 / sample_rate), 1.0)
    gain_db = treble_db / (1 + (TREBLE_SHELF_HZ / freqs) ** 4) + bass_db / (1 + (freqs / BASS_SHELF_HZ) ** 4)
    shaped = np.fft.irfft(np.fft.rfft(samples) * 10 ** (gain_db / 20), n=len(samples)).astype(np.float32)
    peak = float(np.max(np.abs(shaped))) if shaped.size else 0.0
    return shaped * np.float32(0.99 / peak) if peak > 0.99 else shaped


def encode_wav(samples: Float32Array, sample_rate: int) -> bytes:
    buffer = io.BytesIO()
    sf.write(buffer, samples, sample_rate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


def read_audio(path: Path) -> tuple[Float32Array, int]:
    data, sample_rate = sf.read(str(path), dtype="float32", always_2d=False)
    return to_mono(data), int(sample_rate)
