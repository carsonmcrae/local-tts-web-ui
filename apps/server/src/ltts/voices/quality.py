"""Purpose: Objective quality checks for a voice reference recording.

Scope: Measures speech duration, loudness, peak/clipping, pause share and an estimated
signal-to-noise ratio, and turns them into blocking errors or advisory warnings with plain-language
fixes. The browser runs the same checks live, but this server-side result is authoritative.
Does NOT belong: Storing profiles (``profiles.py``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from ltts.audio import Float32Array, frame_rms_db
from ltts.common import ApiModel

MIN_SPEECH_S = 6.0
RECOMMENDED_SPEECH_S = 10.0
SILENCE_DB = -45.0


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
_RULES = (
    _Rule("speech_s", True, MIN_SPEECH_S, "too_short", "error",
          f"There's too little speech. Record at least {MIN_SPEECH_S:.0f} seconds of continuous reading."),
    _Rule("speech_s", True, RECOMMENDED_SPEECH_S, "short", "warning",
          "This works, but 10–20 seconds of speech gives a more faithful voice."),
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
    _Rule("pause_ratio", False, 0.5, "pauses", "warning",
          "More than half the recording is silence. Read continuously at a natural pace."),
)  # fmt: skip


def _issues(report: dict[str, float]) -> list[QualityIssue]:
    issues: list[QualityIssue] = []
    flagged: set[str] = set()
    for rule in _RULES:
        value = report[rule.metric]
        failed = value < rule.threshold if rule.below else value > rule.threshold
        if failed and rule.metric not in flagged:
            flagged.add(rule.metric)
            issues.append(QualityIssue(code=rule.code, severity=rule.severity, message=rule.message))
    return issues


def analyze(samples: Float32Array, sample_rate: int) -> QualityReport:
    levels = frame_rms_db(samples, sample_rate)
    frame_s = 0.03
    speech_frames = levels > SILENCE_DB
    # The frame mask covers whole frames only; align the samples to it (the remainder is < 30 ms).
    mask = np.repeat(speech_frames, max(int(sample_rate * frame_s), 1))
    speech = samples[: len(mask)][mask] if speech_frames.any() else samples
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    values = {
        "duration_s": round(len(samples) / sample_rate, 2),
        "speech_s": round(float(speech_frames.sum()) * frame_s, 2),
        "rms_dbfs": _db(float(np.sqrt(np.mean(speech**2))) if speech.size else 0.0),
        "peak_dbfs": _db(peak),
        "clipping_ratio": round(float(np.mean(np.abs(samples) >= 0.99)) if samples.size else 0.0, 5),
        "pause_ratio": round(1 - float(speech_frames.mean()), 3),
        # Loud speech frames vs. the quietest frames (gaps between words) approximates SNR.
        "snr_db": round(float(np.percentile(levels, 95) - np.percentile(levels, 5)), 1),
    }
    issues = _issues(values)
    return QualityReport(**values, ok=not any(i.severity == "error" for i in issues), issues=issues)
