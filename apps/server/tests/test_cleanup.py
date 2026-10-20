# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Tests for cleaning up a microphone's recordings: noise reduction, the rumble filter and tone.

Scope: Noise reduction lowers steady hiss while speech keeps its level; the rumble filter lowers hum;
the cleanup never clips and leaves recordings alone when it's off; the background measure and the
suggestions it drives (none for a clean or failed recording, stronger for louder noise, the rumble
filter for hum); the preview and quick-voice endpoints apply a cleanup; and sessions saved with the
older tone-only correction still load after the migration.
Does NOT belong: Speech quality metrics (test_voice_sessions.py) or building voices (test_studio_voices.py).
"""

from __future__ import annotations

import io
import sqlite3
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import SAMPLE_RATE, speech_like, wav_bytes
from ltts.db import MIGRATIONS, Database
from ltts.voices.cleanup import Cleanup, apply_cleanup, background, reduce_noise, suggest_cleanup
from ltts.voices.quality import CHECK_RULES, analyze

RNG = np.random.default_rng(3)


def voice(seconds: float = 6.0) -> np.ndarray:
    """A harmonic-rich voice (130 Hz with vibrato) in syllables, closer to speech than a pure tone."""
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    phase = 2 * np.pi * np.cumsum(130 * (1 + 0.03 * np.sin(2 * np.pi * 5 * t))) / SAMPLE_RATE
    harmonics = sum(np.sin(k * phase) / k for k in range(1, 60) if k * 130 < 9_000)
    syllables = np.sin(2 * np.pi * 3.0 * t) > -0.6
    return (0.15 * harmonics / np.max(np.abs(harmonics)) * syllables).astype(np.float32)


def with_pause(clip: np.ndarray) -> np.ndarray:
    return np.concatenate([np.zeros(2 * SAMPLE_RATE, dtype=np.float32), clip])


def hiss(length: int, dbfs: float) -> np.ndarray:
    return RNG.normal(0, 10 ** (dbfs / 20), length).astype(np.float32)


def hum(length: int, level: float = 0.01) -> np.ndarray:
    return (level * np.sin(2 * np.pi * 50 * np.arange(length) / SAMPLE_RATE)).astype(np.float32)


def rms_db(samples: np.ndarray) -> float:
    return float(20 * np.log10(np.sqrt(np.mean(samples.astype(np.float64) ** 2))))


def test_noise_reduction_lowers_hiss_and_keeps_speech() -> None:
    clean = with_pause(voice())
    noisy = clean + hiss(len(clean), -48)
    speech = slice(int(2.2 * SAMPLE_RATE), int(7.8 * SAMPLE_RATE))
    for strength, quieter_by in ((0.5, 5), (1.0, 18)):
        cleaned = reduce_noise(noisy, SAMPLE_RATE, strength)
        assert cleaned.shape == noisy.shape and cleaned.dtype == np.float32
        assert rms_db(cleaned[: 2 * SAMPLE_RATE]) < -48 - quieter_by  # the pause
        assert abs(rms_db(cleaned[speech]) - rms_db(clean[speech])) < 1.0  # speech keeps its level
    assert reduce_noise(noisy, SAMPLE_RATE, 0.0) is noisy
    empty = np.zeros(0, dtype=np.float32)
    assert reduce_noise(empty, SAMPLE_RATE, 0.5) is empty


def test_the_rumble_filter_lowers_hum_and_the_cleanup_never_clips() -> None:
    clip = with_pause(voice())
    hummed = clip + hum(len(clip))
    filtered = apply_cleanup(hummed, SAMPLE_RATE, Cleanup(low_cut=True))
    middle = slice(SAMPLE_RATE // 2, 3 * SAMPLE_RATE // 2)  # of the pause, away from the edges
    assert rms_db(filtered[middle]) < rms_db(hummed[middle]) - 15  # 50 Hz, below the 80 Hz cutoff
    both = apply_cleanup(hummed, SAMPLE_RATE, Cleanup(noise_reduction=1.0, low_cut=True))
    assert rms_db(both[middle]) < rms_db(hummed[middle]) - 30
    assert apply_cleanup(clip, SAMPLE_RATE, Cleanup()) is clip  # off: untouched
    t = np.arange(SAMPLE_RATE) / SAMPLE_RATE
    square = (0.98 * np.sign(np.sin(2 * np.pi * 40 * t))).astype(np.float32)  # a high-pass overshoots this
    assert float(np.max(np.abs(apply_cleanup(square, SAMPLE_RATE, Cleanup(low_cut=True))))) <= 0.99
    shaped = apply_cleanup(hummed, SAMPLE_RATE, Cleanup(noise_reduction=0.5, low_cut=True, treble_db=-3, bass_db=2))
    assert shaped.shape == hummed.shape and float(np.max(np.abs(shaped))) <= 0.99


def test_background_and_suggestions() -> None:
    assert background(np.zeros(100, dtype=np.float32), SAMPLE_RATE) == (-120.0, 0.0)  # too short to measure
    clean = with_pause(voice())
    assert background(clean, SAMPLE_RATE) == (-120.0, 0.0)  # digital silence

    def suggested(samples: np.ndarray) -> Cleanup | None:
        return suggest_cleanup(analyze(samples, SAMPLE_RATE, CHECK_RULES), samples, SAMPLE_RATE)

    assert suggested(clean) is None
    level, rumble = background(clean + hiss(len(clean), -55), SAMPLE_RATE)
    assert -57 < level < -53 and rumble < 0.1
    assert suggested(clean + hiss(len(clean), -55)) == Cleanup(noise_reduction=0.5)
    assert suggested(clean + hiss(len(clean), -45)) == Cleanup(noise_reduction=0.75)
    hummed = suggested(clean + hum(len(clean)))
    assert hummed is not None and hummed.low_cut and background(clean + hum(len(clean)), SAMPLE_RATE)[1] > 0.9
    silent = np.zeros(4 * SAMPLE_RATE, dtype=np.float32) + hiss(4 * SAMPLE_RATE, -45)
    assert suggested(silent) is None  # no speech: fix that first


def test_previewing_and_creating_a_quick_voice_apply_the_cleanup(client: TestClient, tmp_path: Path) -> None:
    clip = with_pause(speech_like(10, noise=0.0)) + hiss(12 * SAMPLE_RATE, -50) + hum(12 * SAMPLE_RATE)
    checked = client.post("/api/voice-profiles/analyze", content=wav_bytes(clip)).json()
    assert checked["suggested"] == {"noiseReduction": 0.75, "lowCut": True, "trebleDb": 0.0, "bassDb": 0.0}
    params = {"noiseReduction": 0.75, "lowCut": "true"}
    preview = client.post("/api/voice-profiles/cleanup-preview", params=params, content=wav_bytes(clip))
    assert preview.status_code == 200 and preview.headers["content-type"] == "audio/wav"
    cleaned, rate = sf.read(io.BytesIO(preview.content), dtype="float32")
    assert rate == SAMPLE_RATE and background(cleaned, rate)[0] < background(clip, rate)[0] - 8
    refused = client.post("/api/voice-profiles/cleanup-preview", params={"noiseReduction": 2}, content=b"x")
    assert refused.status_code == 422

    created = client.post(
        "/api/voice-profiles", params={"name": "Clean", "consent": "true", **params}, content=wav_bytes(clip)
    )
    assert created.status_code == 201
    plain = client.post("/api/voice-profiles", params={"name": "Plain", "consent": "true"}, content=wav_bytes(clip))
    stored = {}
    for name, response in (("clean", created), ("plain", plain)):
        reference = client.get(f"/api/voice-profiles/{response.json()['id']}/reference")
        (tmp_path / f"{name}.wav").write_bytes(reference.content)
        samples, _ = sf.read(tmp_path / f"{name}.wav", dtype="float32")
        stored[name] = background(samples, SAMPLE_RATE)
    assert stored["clean"][0] < stored["plain"][0] - 8 and stored["clean"][1] < stored["plain"][1]


def test_sessions_saved_with_a_tone_correction_still_load_after_the_migration(tmp_path: Path) -> None:
    path = tmp_path / "old.db"
    with sqlite3.connect(path) as conn:
        for number, script in enumerate(MIGRATIONS[:3], start=1):
            conn.executescript(f"BEGIN; {script}; PRAGMA user_version = {number}; COMMIT;")
        conn.execute(
            "INSERT INTO voice_sessions (id, tone_json, created_at, updated_at) VALUES ('s', ?, 'now', 'now')",
            ('{"trebleDb": -4.5, "bassDb": 0.0}',),
        )
    Database(path).migrate()
    with sqlite3.connect(path) as conn:
        stored = conn.execute("SELECT cleanup_json FROM voice_sessions WHERE id = 's'").fetchone()[0]
    assert Cleanup.model_validate_json(stored) == Cleanup(treble_db=-4.5)
