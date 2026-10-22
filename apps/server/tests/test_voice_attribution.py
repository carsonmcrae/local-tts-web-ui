# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Every voice says plainly that it is synthetic, where it comes from and under what licence.

Scope: The built-in voices of both real engines carry an attribution naming the model and its licence and
calling the voice synthetic, and the voice list API exposes the field for every voice.
Does NOT belong: Engine install or synthesis behaviour (``test_engine_runtime.py``).
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from ltts.config import Settings
from ltts.engines.chatterbox import ChatterboxEngine
from ltts.engines.kokoro import KokoroEngine
from ltts.modelstore.store import ModelStore


def test_built_in_voices_name_their_model_licence_and_synthetic_nature(tmp_path: Path) -> None:
    kokoro = KokoroEngine(ModelStore(tmp_path / "models", reserve_mb=0)).voices()
    assert len(kokoro) == 54
    assert all("Synthetic" in v.attribution and "Apache-2.0" in v.attribution for v in kokoro)
    assert all("Not a recording of a person" in v.attribution for v in kokoro)
    settings = Settings(env="test", data_dir=tmp_path / "data")
    (chatterbox,) = ChatterboxEngine(settings, ModelStore(settings.resolved_models_dir, reserve_mb=0)).voices()
    assert "Synthetic" in chatterbox.attribution and "MIT" in chatterbox.attribution
    assert "watermark" in chatterbox.attribution


def test_voice_list_exposes_an_attribution_for_every_voice(client: TestClient) -> None:
    voices = client.get("/api/voices").json()
    assert voices and all("attribution" in voice for voice in voices)
