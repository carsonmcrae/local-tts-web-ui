# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for naming a recording's background: hum, rumble, hiss, clicks and other voices.

Scope: Synthetic readings (bursts of a voice-like sound with pauses) over each kind of background, at
24 and 48 kHz, plus a clean room and backgrounds too quiet to hear, which must name nothing; the guards
for too little audio to judge (hiss, clicks, a cut-off); and how the take verdict words its advice for
each kind.
Does NOT belong: Measuring loudness or SNR (test_take_checks.py) or noise reduction (test_cleanup*).
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
import pytest

from ltts.voices.background import _clicks, _flat, classify
from ltts.voices.quality import QualityReport
from ltts.voices.take_checks import TakeContext, cut_off, judge_take

RATES = (24_000, 48_000)
Background = Callable[[np.ndarray, int], np.ndarray]


def reading(rate: int, seconds: float = 12.0) -> np.ndarray:
    """A speaker reading: 1.2 s of voice-like sound (pitch 150 Hz with harmonics, syllable rhythm), 0.6 s pauses."""
    t = np.arange(int(seconds * rate)) / rate
    voice = sum(np.sin(2 * np.pi * 150 * k * t) / k for k in range(1, 12))
    syllables = (np.sin(2 * np.pi * 4 * t) > -0.7).astype(np.float64)
    phrases = ((t % 1.8) >= 0.4) & ((t % 1.8) < 1.6)
    return (0.12 * voice * syllables * phrases).astype(np.float32)


def pauses(rate: int, seconds: float = 12.0) -> np.ndarray:
    t = np.arange(int(seconds * rate)) / rate
    return ((t % 1.8) < 0.35).astype(np.float64)


def noise(rate: int, seconds: float = 12.0, seed: int = 3) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(int(seconds * rate))


def band(signal: np.ndarray, rate: int, low: float, high: float) -> np.ndarray:
    spectrum = np.fft.rfft(signal)
    freqs = np.fft.rfftfreq(signal.size, 1 / rate)
    spectrum[(freqs < low) | (freqs > high)] = 0
    shaped = np.fft.irfft(spectrum, n=signal.size)
    return np.asarray(shaped / np.sqrt(np.mean(shaped**2)))


def at(signal: np.ndarray, dbfs: float) -> np.ndarray:
    return signal * 10 ** (dbfs / 20) / np.sqrt(np.mean(signal**2))


def hum(t: np.ndarray, mains: float) -> np.ndarray:
    return (
        np.sin(2 * np.pi * mains * t)
        + 0.6 * np.sin(2 * np.pi * 2 * mains * t)
        + 0.3 * np.sin(2 * np.pi * 3 * mains * t)
    )


def heard(rate: int, background: np.ndarray) -> list[str]:
    room = at(noise(rate, seed=9), -82)
    return list(classify((reading(rate) + background + room).astype(np.float32), rate))


@pytest.mark.parametrize("rate", RATES)
def test_a_quiet_room_names_nothing(rate: int) -> None:
    assert heard(rate, np.zeros(int(12 * rate))) == []


@pytest.mark.parametrize("rate", RATES)
@pytest.mark.parametrize("mains", [50.0, 60.0])
def test_mains_hum_is_named(rate: int, mains: float) -> None:
    t = np.arange(int(12 * rate)) / rate
    assert heard(rate, at(hum(t, mains), -50)) == ["hum"]


@pytest.mark.parametrize("rate", RATES)
def test_a_low_rumble_is_named(rate: int) -> None:
    assert heard(rate, at(band(noise(rate), rate, 20, 130), -48)) == ["rumble"]


@pytest.mark.parametrize("rate", RATES)
def test_hiss_is_named(rate: int) -> None:
    assert heard(rate, at(noise(rate), -52)) == ["hiss"]
    assert heard(rate, at(band(noise(rate), rate, 3_000, rate / 2), -55)) == ["hiss"]


@pytest.mark.parametrize("rate", RATES)
def test_backgrounds_too_quiet_to_hear_name_nothing(rate: int) -> None:
    t = np.arange(int(12 * rate)) / rate
    assert heard(rate, at(hum(t, 60.0), -76)) == []
    assert heard(rate, at(noise(rate), -74)) == []
    assert heard(rate, at(band(noise(rate), rate, 20, 130), -74)) == []


@pytest.mark.parametrize("rate", RATES)
def test_clicks_in_the_pauses_are_named(rate: int) -> None:
    clicks = np.zeros(int(12 * rate))
    burst = 0.3 * np.exp(-np.arange(int(0.004 * rate)) / (0.0008 * rate)) * np.sign(noise(rate, 0.004))
    for second in (0.15, 1.95, 3.75, 5.55):
        start = int(second * rate)
        clicks[start : start + burst.size] += burst
    assert heard(rate, clicks) == ["clicks"]
    one = np.pad(clicks[: int(1 * rate)], (0, int(11 * rate)))
    assert heard(rate, one) == []  # a single click is nothing to mention


@pytest.mark.parametrize("rate", RATES)
def test_another_voice_in_the_pauses_is_named(rate: int) -> None:
    t = np.arange(int(12 * rate)) / rate
    other = sum(np.sin(2 * np.pi * 215 * k * t) / k for k in range(1, 8)) * (np.sin(2 * np.pi * 3 * t) > -0.5)
    assert heard(rate, 0.02 * other * pauses(rate)) == ["voices"]


def test_short_or_silent_recordings_name_nothing() -> None:
    assert classify(np.zeros(1_000, dtype=np.float32), 24_000) == []
    assert classify(np.zeros(24_000 * 3, dtype=np.float32), 24_000) == []


def test_too_little_audio_to_judge_names_no_hiss_or_clicks() -> None:
    freqs = np.linspace(0, 12_000, 25)  # 500 Hz bins: fewer than eight of them between 2.5 and 6 kHz
    assert not _flat(np.ones(25), freqs, 2_500, 6_000)
    assert not _clicks(np.zeros(int(0.1 * 24_000), dtype=np.float32), 24_000)  # 100 ms: too few frames


def verdict(rate: int, background: np.ndarray) -> QualityReport:
    recording = (reading(rate) + background).astype(np.float32)
    return judge_take(recording, rate, TakeContext(), recorded=recording)


def test_the_noise_advice_names_what_it_heard() -> None:
    rate = 24_000
    t = np.arange(int(12 * rate)) / rate
    report = verdict(rate, at(hum(t, 60.0), -38))
    assert report.background == ["hum"]
    noisy = next(issue for issue in report.issues if issue.code == "noisy")
    assert "It sounds like a steady hum (mains electricity, a charger or a device nearby)." in noisy.message
    assert noisy.severity == "warning" and report.ok


def test_clicks_or_voices_get_their_own_advice_even_in_a_quiet_room() -> None:
    rate = 24_000
    t = np.arange(int(12 * rate)) / rate
    other = sum(np.sin(2 * np.pi * 215 * k * t) / k for k in range(1, 8)) * (np.sin(2 * np.pi * 3 * t) > -0.5)
    report = verdict(rate, 0.02 * other * pauses(rate))
    assert [issue.code for issue in report.issues if issue.code in ("noisy", "background")] == ["background"]
    assert "We heard other voices, a TV or music in the pauses." in report.issues[-1].message


def test_a_take_cut_off_mid_word_is_pointed_out() -> None:
    rate = 24_000
    whole = reading(rate)
    assert cut_off(whole, rate) is None  # starts and ends in a pause
    assert cut_off(whole[: int(10.55 * rate)], rate) == "end"  # Stop pressed while reading
    assert cut_off(whole[int(0.6 * rate) :], rate) == "start"
    assert cut_off(whole[: int(0.3 * rate)], rate) is None  # too short to tell
    stopped = whole[: int(10.55 * rate)]
    assert "cut_off" in [issue.code for issue in judge_take(stopped, rate, TakeContext(), recorded=stopped).issues]
    assert "cut_off" not in [issue.code for issue in judge_take(stopped, rate, TakeContext()).issues]
