# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""
Purpose: Prove that sound effects cannot overpower the narration: the files' mastering and the gain chain.
Scope: Every bundled sound is mastered at or below the target (loud moments at most -19 dBFS, peaks at
  most -4.5 dBFS); with the app's defaults (effects at 40 %, Balanced) every sound sits at least 6 dB
  under the narration, Immersive included; at the loudest settings a reader can choose (effects at
  100 %, Immersive, an effect at 150 %) the engine's gain cap keeps every sound at the narration's own
  level within the clips' spread, never above it. The narration reference is measured from Kokoro
  (twelve af_heart clips: loud moments -19.1 to -21.7 dBFS, peaks -7.3 to -10.3 dBFS); an inference
  test re-measures it when the model is installed. Background music is the music feature's: tracks at
  -28 LUFS, true peak at most -10 dBTP, default 10 % (22 dB under the voice), 100 % still under it.
Does NOT belong: The limiter and fades (web engine tests), or what the sounds sound like (a listener).
"""

from __future__ import annotations

import io
import math
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from ltts.sfx import catalogue
from ltts.sfx.store import MAX_VOLUME
from test_inference import real  # noqa: F401 - the module-scoped Kokoro client, skipped without the model

ROOT = Path(__file__).resolve().parents[3]
SFX_DIR = ROOT / "apps/web/public/sfx"

# The same numbers as the web app's (features/sfx/preferences.ts and engine.ts), which its tests assert.
DEFAULT_EFFECTS_VOLUME = 0.40
INTENSITY_GAIN = {"minimal": 0.8, "balanced": 1.0, "immersive": 1.15}
GAIN_CAP = 1.0  # MAX_GAIN: an effect never plays above its mastered level
# Measured from Kokoro af_heart narration (loud = 95th-percentile RMS over 100 ms windows).
NARRATION_LOUD_DBFS = -20.5
NARRATION_SPREAD_DB = 1.5
MASTERING_LOUD_DBFS = -19.0
MASTERING_PEAK_DBFS = -4.5


def db(value: float) -> float:
    return 20 * math.log10(value) if value > 0 else -120.0


def levels(samples: np.ndarray, rate: int) -> tuple[float, float]:
    """(loud, peak) in dBFS: the 95th-percentile RMS over 100 ms windows, and the sample peak."""
    mono = samples.mean(axis=1) if samples.ndim == 2 else samples
    window = max(1, rate // 10)
    usable = len(mono) - len(mono) % window
    frames = mono[:usable].reshape(-1, window) if usable else mono[None, :]
    loud = float(np.percentile(np.sqrt((frames**2).mean(axis=1)), 95))
    return db(loud), db(float(np.abs(mono).max()))


def sound_levels() -> dict[str, tuple[float, float, float]]:
    """Each bundled sound's (loud, peak, gain)."""
    out = {}
    for sound in catalogue.library().sounds:
        samples, rate = sf.read(SFX_DIR / sound.file, dtype="float32", always_2d=True)
        loud, peak = levels(samples, rate)
        out[sound.id] = (loud, peak, sound.gain)
    return out


def test_every_sound_is_mastered_at_or_below_the_target() -> None:
    for sound_id, (loud, peak, _) in sound_levels().items():
        assert loud <= MASTERING_LOUD_DBFS, (sound_id, loud)
        assert peak <= MASTERING_PEAK_DBFS, (sound_id, peak)


@pytest.mark.parametrize("intensity", list(INTENSITY_GAIN))
def test_by_default_every_sound_sits_well_under_the_narration(intensity: str) -> None:
    chain = DEFAULT_EFFECTS_VOLUME * INTENSITY_GAIN[intensity]
    for sound_id, (loud, _, gain) in sound_levels().items():
        heard = loud + db(min(gain * chain, GAIN_CAP))
        assert heard <= NARRATION_LOUD_DBFS - 6, (intensity, sound_id, heard)


def test_at_the_loudest_settings_no_sound_rises_above_the_narration() -> None:
    chain = 1.0 * INTENSITY_GAIN["immersive"] * (MAX_VOLUME / 100)  # effects 100 %, Immersive, effect at 150 %
    capped = 0
    for sound_id, (loud, _, gain) in sound_levels().items():
        capped += gain * chain > GAIN_CAP
        heard = loud + db(min(gain * chain, GAIN_CAP))
        assert heard <= NARRATION_LOUD_DBFS + NARRATION_SPREAD_DB, (sound_id, heard)
    assert capped > 0  # the cap, not luck, is what holds the loudest sounds at the line


@pytest.mark.inference
def test_the_narration_reference_still_matches_kokoro(real: TestClient) -> None:  # noqa: F811 - the fixture
    doc = real.post(
        "/api/documents/text",
        json={
            "text": "The lighthouse keeper climbed the stairs and counted every step on the way up.",
            "title": "Level",
        },
    ).json()
    response = real.get(f"/api/documents/{doc['id']}/segments/0/audio", params={"voice": "kokoro:af_heart"})
    assert response.status_code == 200, response.text
    samples, rate = sf.read(io.BytesIO(response.content), dtype="float32")
    loud, peak = levels(samples, rate)
    assert abs(loud - NARRATION_LOUD_DBFS) <= 3, loud
    assert peak <= -3, peak
