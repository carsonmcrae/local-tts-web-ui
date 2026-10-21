# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The verdict on one studio session take: what really went wrong, and only that.

Scope: Measures the take (``quality.measure``), estimates how much of the passage was read (the
syllables heard in the audio and the speech time, against the passage's syllables and the speaker's
own pace and voice from earlier takes) and compares its background with the speaker's other takes.
Then picks the issues that explain the take: one message for a take with no speech (instead of
every measurement that follows from it), the quiet voice or the early stop for a short take, and for
a full take its level, noise, completeness and pauses. Noise and an incomplete reading are advice
and never block a take.
Does NOT belong: The measurements themselves (``quality.py``) or storing takes (``sessions.py``).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median

import numpy as np

from ltts.audio import Float32Array
from ltts.engines.cloned_speech import count_syllables
from ltts.voices.quality import (
    LEVEL_RULES,
    MIN_TAKE_SPEECH_S,
    QualityIssue,
    QualityReport,
    build_report,
    measure,
    rule_issues,
)

NO_SPEECH_S = 0.6  # less speech than this is a take that stopped (or never started) before the reading
SILENT_PEAK_DBFS = -42.0  # nothing louder than this reached the microphone at all
DEFAULT_PACE = 5.0  # syllables per second of speech when reading aloud; replaced by the speaker's own
DEFAULT_DETECTION = 1.0  # syllables heard per syllable read (0.86-1.21 on varied voices); replaced by the speaker's
INCOMPLETE = 0.65  # below this share of the passage, the take most likely stopped early
LOUDER_NOISE_DB = 6.0  # a background this much louder than the speaker's other takes is worth a retake
CALIBRATION_TAKES = 3


def syllables_heard(samples: Float32Array, sample_rate: int) -> int:
    """Syllable nuclei in a recording: peaks of the vowel band's loudness with a dip between them.

    The approach of de Jong and Wempe (2009): vowels are the loud, voiced cores of syllables, so
    counting separate loudness peaks in the 300-2500 Hz band counts syllables without recognising words.
    """
    if samples.size < sample_rate // 5:
        return 0
    spectrum = np.fft.rfft(samples.astype(np.float64))
    freqs = np.fft.rfftfreq(samples.size, 1 / sample_rate)
    spectrum[(freqs < 300) | (freqs > 2500)] = 0
    band = np.fft.irfft(spectrum, n=samples.size)
    hop = max(sample_rate // 100, 1)  # 10 ms
    usable = band.size - band.size % hop
    power = (band[:usable] ** 2).reshape(-1, hop).mean(axis=1)
    kernel = np.hanning(7)
    level = 10 * np.log10(np.convolve(power, kernel / kernel.sum(), mode="same") + 1e-12)
    threshold = float(np.percentile(level, 99)) - 25.0
    peaks = [
        i
        for i in range(1, len(level) - 1)
        if level[i] >= level[i - 1] and level[i] > level[i + 1] and level[i] > threshold
    ]
    accepted: list[int] = []
    for peak in peaks:
        if not accepted:
            accepted.append(peak)
            continue
        last = accepted[-1]
        dip = float(level[last : peak + 1].min())
        if peak - last >= 8 and min(level[last], level[peak]) - dip >= 2.0:
            accepted.append(peak)
        elif level[peak] > level[last]:
            accepted[-1] = peak  # the same syllable: keep its loudest point
    return len(accepted)


@dataclass(frozen=True, slots=True)
class TakeContext:
    """What the speaker's earlier takes say about this one, and the passage it reads."""

    syllables_expected: int | None = None
    pace: float | None = None  # the speaker's syllables per second of speech
    detection: float | None = None  # syllables heard per syllable read, for this voice and microphone
    noise_dbfs: float | None = None  # the speaker's usual background


def context_for(earlier: Sequence[QualityReport], text: str | None) -> TakeContext:
    """Calibrate from the earlier takes that read their whole passage (at least three of them)."""
    complete = [
        r
        for r in earlier
        if r.ok and r.syllables_expected and r.syllables_heard and r.speech_s > 0 and r.coverage is not None
        and not any(issue.code == "incomplete" for issue in r.issues)
    ]  # fmt: skip
    calibrated = len(complete) >= CALIBRATION_TAKES
    noises = [r.noise_dbfs for r in earlier if r.noise_dbfs is not None and r.speech_s >= MIN_TAKE_SPEECH_S]
    return TakeContext(
        syllables_expected=count_syllables(text) or None if text else None,
        pace=median((r.syllables_expected or 0) / r.speech_s for r in complete) if calibrated else None,
        detection=median((r.syllables_heard or 0) / (r.syllables_expected or 1) for r in complete)
        if calibrated
        else None,
        noise_dbfs=median(noises) if len(noises) >= 2 else None,
    )


def _coverage(speech_s: float, heard: int, context: TakeContext) -> float | None:
    """The share of the passage read: the average of what the speech time and the syllables heard say."""
    expected = context.syllables_expected
    if not expected:
        return None
    by_time = speech_s * min(max(context.pace or DEFAULT_PACE, 2.5), 7.5) / expected
    by_syllables = heard / (expected * min(max(context.detection or DEFAULT_DETECTION, 0.4), 1.6))
    return round(min((by_time + by_syllables) / 2, 1.0), 2)


def _issue(code: str, severity: str, message: str) -> QualityIssue:
    return QualityIssue.model_validate({"code": code, "severity": severity, "message": message})


def _no_speech(values: dict[str, float | None]) -> QualityIssue:
    if (values["peak_dbfs"] or -120.0) < SILENT_PEAK_DBFS:
        return _issue(
            "no_sound",
            "error",
            "We couldn't hear anything. Check that the right microphone is selected and isn't muted, then "
            "read the passage aloud.",
        )
    return _issue(
        "no_speech",
        "error",
        f"The take stopped after {values['duration_s'] or 0:.1f} s, before the reading started. Press Record, "
        "read the whole passage, then press Stop.",
    )


def _short(values: dict[str, float | None], context: TakeContext) -> list[QualityIssue]:
    """A take with a little speech: a voice too quiet to be heard, or a reading that stopped early."""
    if (values["rms_dbfs"] or -120.0) < -40:
        return [
            _issue(
                "too_quiet",
                "error",
                "We could barely hear you. Move closer to the microphone or raise its input level, then try again.",
            )
        ]
    pace = context.pace or DEFAULT_PACE
    needed = (
        f" (this passage takes about {context.syllables_expected / pace:.0f} s)" if context.syllables_expected else ""
    )
    issues = [
        _issue(
            "too_short",
            "error",
            f"This take has only {values['speech_s'] or 0:.1f} s of speech{needed}. Read the whole passage, then "
            "press Stop.",
        )
    ]
    return issues + [issue for issue in rule_issues(values, LEVEL_RULES) if issue.code == "clipping"]


def _noise(values: dict[str, float | None], context: TakeContext) -> list[QualityIssue]:
    snr, noise = values["snr_db"] or 0.0, values["noise_dbfs"]
    louder = noise - context.noise_dbfs if noise is not None and context.noise_dbfs is not None else 0.0
    if snr < 12:
        message = (
            "There's a lot of background noise in this take, and the voice can copy it. Record it again somewhere "
            "quieter if you can; it still counts."
        )
    elif louder >= LOUDER_NOISE_DB:
        message = (
            f"The background was about {louder:.0f} dB louder than in your other takes (a fan, traffic or "
            "voices?). Consider recording this one again; it still counts."
        )
    elif snr < 20:
        message = "Some background noise is audible; a quieter room gives cleaner results."
    else:
        return []
    return [_issue("noisy", "warning", message)]


def _completeness(coverage: float | None) -> list[QualityIssue]:
    if coverage is None or coverage >= INCOMPLETE:
        return []
    return [
        _issue(
            "incomplete",
            "warning",
            f"It sounds like about {coverage:.0%} of the passage was read. Listen back, and record it again if "
            "the take stopped early or skipped a part; it still counts.",
        )
    ]


def judge_take(samples: Float32Array, sample_rate: int, context: TakeContext) -> QualityReport:
    """Measure a take and report the issues that explain it, the root cause first."""
    values = measure(samples, sample_rate)
    speech_s = values["speech_s"] or 0.0
    heard = syllables_heard(samples, sample_rate) if speech_s >= NO_SPEECH_S else 0
    coverage = _coverage(speech_s, heard, context)
    values |= {
        "coverage": coverage,
        "syllables_heard": heard,
        "syllables_expected": context.syllables_expected,
    }
    if speech_s < NO_SPEECH_S:
        return build_report(values, [_no_speech(values)])
    if speech_s < MIN_TAKE_SPEECH_S:
        return build_report(values, _short(values, context))
    pauses = (values["pause_ratio"] or 0.0) > 0.5 and (coverage is None or coverage >= INCOMPLETE)
    issues = [
        *rule_issues(values, LEVEL_RULES),
        *_noise(values, context),
        *_completeness(coverage),
        *(
            [
                _issue(
                    "pauses",
                    "warning",
                    "More than half of this take is silence. Read continuously at a natural pace; short pauses "
                    "at commas and full stops are fine.",
                )
            ]
            if pauses
            else []
        ),
    ]
    return build_report(values, issues)
