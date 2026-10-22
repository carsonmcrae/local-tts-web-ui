# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Make cloned speech sound natural sentence after sentence.

Scope: The style a sentence is read in (its final punctuation, or dialogue), an English syllable
estimate (to know how long a sentence should take), whether a generated clip is plausibly the whole
sentence (not cut short, not running on with noise or repeats), and polishing a clip: silent edges
trimmed, long pauses inside it shortened, and its loudness brought to the level of the built-in
voices so sentences, characters and voices don't jump in volume.
Does NOT belong: Generating speech (the engine and its worker) or choosing a voice's style prompts
(``ltts.voices.styles``).
"""

from __future__ import annotations

import re

import numpy as np

from ltts.audio import Float32Array

NARRATION = "narration"
TARGET_RMS_DBFS = -23.0  # the built-in voices measure -22 to -25 dBFS on speech
PEAK_DBFS = -1.0
EDGE_PAD_S = 0.05
LONG_PAUSE_S = 0.7  # pauses longer than this inside one sentence are shortened
SHORT_PAUSE_S = 0.3
SYLLABLES_PER_S = 4.5
_CLOSERS = "\"')] ”’»"  # closing quotes and brackets after a sentence's final punctuation
_QUOTE = re.compile(
    '["\N{LEFT DOUBLE QUOTATION MARK}\N{RIGHT DOUBLE QUOTATION MARK}'
    "\N{LEFT-POINTING DOUBLE ANGLE QUOTATION MARK}\N{RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK}]"
)
_WORD = re.compile("[a-z']+|[0-9]+")
_VOWELS = re.compile("[aeiouy]+")


def sentence_style(text: str) -> str:
    """The style a sentence is read in: its final punctuation first, then whether it is spoken dialogue."""
    end = text.rstrip(_CLOSERS)[-1:]
    if end == "?":
        return "question"
    if end == "!":
        return "lively"
    return "dialogue" if _QUOTE.search(text) else NARRATION


def is_dialogue(text: str) -> bool:
    """Whether a sentence holds quoted speech."""
    return _QUOTE.search(text) is not None


def count_syllables(text: str) -> int:
    """English syllables in ``text``, by vowel groups with the common silent endings (a close estimate)."""
    total = 0
    for match in _WORD.findall(text.lower()):
        word = match.strip("'")
        if not word:
            continue
        if word.isdigit():
            total += max(1, round(1.3 * len(word)))  # "1969" is five syllables, "305" three
            continue
        groups = len(_VOWELS.findall(word))
        silent_e = word.endswith("e") and not word.endswith(("le", "ee", "ye"))
        silent_ending = word.endswith(("ed", "es")) and len(word) > 3 and word[-3] not in "tdsxzhc"
        if groups > 1 and (silent_e or silent_ending):
            groups -= 1
        total += max(groups, 1)
    return total


def _frame_levels(samples: Float32Array, frame: int) -> np.ndarray:
    usable = len(samples) - len(samples) % frame
    if usable == 0:
        return np.full(1, -120.0)
    frames = samples[:usable].reshape(-1, frame)
    return 20 * np.log10(np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1)) + 1e-9)


def polish(samples: Float32Array, sample_rate: int) -> Float32Array:
    """Trim the silent edges, shorten long pauses and bring the speech to the built-in voices' loudness."""
    frame = max(sample_rate // 100, 1)  # 10 ms
    levels = _frame_levels(samples, frame)
    voiced = levels > float(levels.max()) - 40.0
    indexes = np.nonzero(voiced)[0]
    if indexes.size == 0 or float(levels.max()) < -70:
        return samples
    pad = round(EDGE_PAD_S * sample_rate / frame)
    first, last = max(int(indexes[0]) - pad, 0), min(int(indexes[-1]) + pad + 1, len(voiced))
    keep = np.zeros(len(voiced), dtype=bool)
    keep[first:last] = True
    # A pause is shortened only when it is long; shorter ones keep their natural length.
    longest, run = round(SHORT_PAUSE_S * sample_rate / frame), 0
    for index in range(first, last):
        if voiced[index]:
            if run * frame > LONG_PAUSE_S * sample_rate:
                keep[index - run + longest : index] = False
            run = 0
        else:
            run += 1
    usable = len(voiced) * frame
    body = samples[:usable].reshape(-1, frame)[keep].reshape(-1)
    tail = samples[usable:] if last == len(voiced) else samples[:0]
    clip = np.concatenate([body, tail]).astype(np.float32)
    speech = samples[:usable].reshape(-1, frame)[voiced].reshape(-1)
    rms = float(np.sqrt(np.mean(speech.astype(np.float64) ** 2))) if speech.size else 0.0
    if rms <= 1e-6:  # pragma: no cover - voiced frames lie within 40 dB of a peak above -70 dBFS, never this quiet
        return clip
    gain = 10 ** (TARGET_RMS_DBFS / 20) / rms
    peak = float(np.max(np.abs(clip))) * gain
    if peak > 10 ** (PEAK_DBFS / 20):
        gain *= 10 ** (PEAK_DBFS / 20) / peak
    return (clip * gain).astype(np.float32)


def plausibility(samples: Float32Array, sample_rate: int, text: str) -> float:
    """How long a clip is against how long the sentence should take (1.0 = typical).

    Far below 1 the clip stopped early; far above it the model ran on (noise, repeats, a hallucination).
    """
    expected = max(count_syllables(text) / SYLLABLES_PER_S, 0.6)
    return round(len(samples) / sample_rate / expected, 3)


def acceptable(ratio: float) -> bool:
    return 0.35 <= ratio <= 2.6
