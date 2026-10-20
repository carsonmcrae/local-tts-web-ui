# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Objective quality checks for a voice recording, and the tone correction a microphone needs.

Scope: Measures speech duration, loudness, peak/clipping, pause share, an estimated signal-to-noise
ratio and the microphone's tone on vowels (sibilants like "s" and "sh" are left out, since they are
naturally bright): brightness (4-8 kHz against 2-4 kHz) and body (low end against presence). Turns
them into blocking errors or advisory warnings with plain-language fixes. Three rule sets: a quick
voice's single clip, a studio session take (tone is checked once, in the microphone check), and a
microphone check. The browser runs the clip checks live, but this server-side result is
authoritative.
Does NOT belong: Suggesting or applying a cleanup (``cleanup.py``) or storing profiles (``profiles.py``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import numpy.typing as npt

from ltts.audio import Float32Array, frame_rms_db
from ltts.common import ApiModel

MIN_SPEECH_S = 6.0
RECOMMENDED_SPEECH_S = 10.0
MIN_TAKE_SPEECH_S = 3.0
MIN_CHECK_SPEECH_S = 2.0
SILENCE_DB = -45.0
# Tone on vowels (median frame). Natural speech measured from -11 to -3 dB brightness and 10 to 21 dB body.
BRIGHT_DB = 0.0
THIN_DB = 7.0
_SPECTRUM_FRAME = 2048
SILENT_POWER = 1e-6  # per-sample power below which a frame holds no usable sound
PRESENCE_FLOOR = 1e-4  # 2-4 kHz more than 40 dB below the low band holds no speech, only noise


class QualityIssue(ApiModel):
    code: str
    severity: Literal["error", "warning"]
    message: str


class QualityReport(ApiModel):
    duration_s: float
    speech_s: float
    rms_dbfs: float
    peak_dbfs: float
    clipping_ratio: float
    pause_ratio: float
    snr_db: float
    # Tone on vowels; None when there was too little voiced speech or for reports saved before these existed.
    brightness_db: float | None = None
    body_db: float | None = None
    ok: bool
    issues: list[QualityIssue]


def _db(value: float) -> float:
    return round(20 * float(np.log10(max(value, 1e-9))), 1)


@dataclass(frozen=True, slots=True)
class _Rule:
    metric: str
    below: bool  # True: problem when metric < threshold; False: when metric > threshold
    threshold: float
    code: str
    severity: Literal["error", "warning"]
    message: str


# Ordered so that, per metric, the blocking error is checked before the advisory warning.
_SOUND_RULES = (
    _Rule("rms_dbfs", True, -40, "too_quiet", "error",
          "The recording is very quiet. Move closer to the microphone and try again."),
    _Rule("rms_dbfs", True, -30, "quiet", "warning",
          "The recording is a little quiet; speaking closer to the mic will help."),
    _Rule("clipping_ratio", False, 0.01, "clipping", "error",
          "The audio is distorted (clipping). Lower the input volume or move back slightly."),
    _Rule("clipping_ratio", False, 0.001, "clipping", "warning",
          "A few peaks clipped. It may still work; a quieter take is safer."),
    _Rule("snr_db", True, 12, "noisy", "error",
          "There's a lot of background noise. Find a quieter room and try again."),
    _Rule("snr_db", True, 20, "noisy", "warning",
          "Some background noise is audible; a quieter room gives cleaner results."),
)  # fmt: skip
_TONE_RULES = (
    _Rule("brightness_db", False, BRIGHT_DB, "bright", "warning",
          "The microphone sounds bright or harsh, and the voice will copy that. The app can correct "
          "the tone for you; you can also angle the mic slightly away from your mouth."),
    _Rule("body_db", True, THIN_DB, "thin", "warning",
          "The microphone sounds thin, with little low end, and the voice will copy that. The app can "
          "correct the tone for you; a USB or XLR microphone, a little closer, sounds fuller."),
)  # fmt: skip
_PAUSES = _Rule("pause_ratio", False, 0.5, "pauses", "warning",
                "More than half the recording is silence. Read continuously at a natural pace.")  # fmt: skip
CLIP_RULES = (
    _Rule("speech_s", True, MIN_SPEECH_S, "too_short", "error",
          f"There's too little speech. Record at least {MIN_SPEECH_S:.0f} seconds of continuous reading."),
    _Rule("speech_s", True, RECOMMENDED_SPEECH_S, "short", "warning",
          "This works, but 10–20 seconds of speech gives a more faithful voice."),
    *_SOUND_RULES,
    *_TONE_RULES,
    _PAUSES,
)  # fmt: skip
TAKE_RULES = (
    _Rule("speech_s", True, MIN_TAKE_SPEECH_S, "too_short", "error",
          "This take is too short. Read the whole passage."),
    *_SOUND_RULES,
    _PAUSES,
)  # fmt: skip
CHECK_RULES = (
    _Rule("speech_s", True, MIN_CHECK_SPEECH_S, "no_speech", "error",
          "We couldn't hear you. Check that the right microphone is selected and read the line aloud."),
    *_SOUND_RULES,
    *_TONE_RULES,
)  # fmt: skip
Rules = tuple[_Rule, ...]


def _issues(report: dict[str, float | None], rules: Rules) -> list[QualityIssue]:
    issues: list[QualityIssue] = []
    flagged: set[str] = set()
    for rule in rules:
        value = report[rule.metric]
        if value is None:
            continue
        failed = value < rule.threshold if rule.below else value > rule.threshold
        if failed and rule.metric not in flagged:
            flagged.add(rule.metric)
            issues.append(QualityIssue(code=rule.code, severity=rule.severity, message=rule.message))
    return issues


def _median_ratio_db(numerator: npt.NDArray[np.float64], denominator: npt.NDArray[np.float64]) -> float:
    """The typical frame's ratio in dB; a median, so frames where a sibilant overlaps a vowel don't dominate."""
    return round(float(np.median(10 * np.log10(np.maximum(numerator, 1e-12) / np.maximum(denominator, 1e-12)))), 1)


def _tone(speech: Float32Array, sample_rate: int) -> tuple[float | None, float | None]:
    """Brightness and body of the vowels in dB, or (None, None) when there is too little voiced speech."""
    usable = len(speech) - len(speech) % _SPECTRUM_FRAME
    if usable == 0:
        return None, None
    frames = speech[:usable].reshape(-1, _SPECTRUM_FRAME) * np.hanning(_SPECTRUM_FRAME)
    power = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    freqs = np.fft.rfftfreq(_SPECTRUM_FRAME, 1 / sample_rate)

    def band(low: float, high: float) -> npt.NDArray[np.float64]:
        return np.asarray(power[:, (freqs >= low) & (freqs < high)].sum(axis=1), dtype=np.float64)

    air = band(4_000, 8_000)
    low = band(80, 2_000)
    # Vowels: real sound (not silence) with less energy above 4 kHz than below 2 kHz, unlike sibilants.
    voiced = (air <= low) & (low > SILENT_POWER * _SPECTRUM_FRAME)
    if not voiced.any():
        return None, None
    presence = band(2_000, 4_000)
    # Brightness needs real presence content; band-limited audio (or a test tone) has only noise there.
    present = voiced & (presence > low * PRESENCE_FLOOR)
    brightness = _median_ratio_db(air[present], presence[present]) if present.any() else None
    body = _median_ratio_db(band(80, 500)[voiced], band(1_000, 4_000)[voiced])
    return brightness, body


def analyze(samples: Float32Array, sample_rate: int, rules: Rules = CLIP_RULES) -> QualityReport:
    levels = frame_rms_db(samples, sample_rate)
    frame_s = 0.03
    speech_frames = levels > SILENCE_DB
    # The frame mask covers whole frames only; align the samples to it (the remainder is < 30 ms).
    mask = np.repeat(speech_frames, max(int(sample_rate * frame_s), 1))
    speech = samples[: len(mask)][mask] if speech_frames.any() else samples
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    brightness, body = _tone(speech, sample_rate)
    values: dict[str, float | None] = {
        "duration_s": round(len(samples) / sample_rate, 2),
        "speech_s": round(float(speech_frames.sum()) * frame_s, 2),
        "rms_dbfs": _db(float(np.sqrt(np.mean(speech**2))) if speech.size else 0.0),
        "peak_dbfs": _db(peak),
        "clipping_ratio": round(float(np.mean(np.abs(samples) >= 0.99)) if samples.size else 0.0, 5),
        "pause_ratio": round(1 - float(speech_frames.mean()), 3),
        # Loud speech frames vs. the quietest frames (gaps between words) approximates SNR.
        "snr_db": round(float(np.percentile(levels, 95) - np.percentile(levels, 5)), 1),
        "brightness_db": brightness,
        "body_db": body,
    }
    issues = _issues(values, rules)
    return QualityReport.model_validate(
        {**values, "ok": not any(i.severity == "error" for i in issues), "issues": issues}
    )
