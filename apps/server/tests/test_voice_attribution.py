# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Every voice says plainly that it is synthetic, where it comes from and under what licence.

Scope: Each source of voices has a one-line credit for its card and a full attribution: both call the voice
synthetic and name its model and licence; the full Kokoro wording credits everything the Windows installer's
Kokoro licence notice credits; the built-in voices of both real engines, a cloned voice and a blend carry their
source's credit and attribution through the voice list API.
Does NOT belong: Engine install or synthesis behaviour (``test_engine_runtime.py``) or how the web app shows them.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine
from ltts.config import Settings
from ltts.engines import credits
from ltts.engines.chatterbox import ChatterboxEngine
from ltts.engines.kokoro import KokoroEngine
from ltts.modelstore.store import ModelStore
from speech_api_support import custom_voice

SOURCES = {"kokoro": credits.KOKORO, "chatterbox": credits.CHATTERBOX, "cloned": credits.CLONED,
           "blend": credits.BLEND}  # fmt: skip
LICENCES = {"kokoro": "Apache-2.0", "chatterbox": "MIT", "cloned": "MIT", "blend": "Apache-2.0"}
INSTALLER_NOTICE = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "licenses" / "kokoro" / "README.txt"


@pytest.mark.parametrize("source", sorted(SOURCES))
def test_every_source_has_a_short_credit_and_a_full_attribution(source: str) -> None:
    credit = SOURCES[source]
    assert len(credit.short) <= 52 and "\n" not in credit.short  # a short line for the card, never a paragraph
    assert "Synthetic" in credit.short or "synthetic" in credit.short
    assert LICENCES[source] in credit.short and LICENCES[source] in credit.full
    assert re.search(r"[Ss]ynthetic", credit.full) and len(credit.full) > len(credit.short)


def test_the_full_kokoro_wording_credits_what_the_installers_licence_notice_credits() -> None:
    notice = INSTALLER_NOTICE.read_text("utf-8")
    named_in_both = (
        "Kokoro-82M",
        "hexgrad",
        "Apache",
        "StyleTTS 2",
        "yl4579",
        "Koniwa",
        "tnc",
        "CC BY 3.0",
        "SIWIS",
        "CC BY 4.0",
    )
    for named in named_in_both:
        assert named in notice, f"the installer's notice no longer names {named}; update this test and credits.py"
        assert named in credits.KOKORO.full
    assert "not affiliated" in notice and "not affiliated" in credits.KOKORO.full
    assert credits.KOKORO.full in credits.BLEND.full  # a blend is made of Kokoro voices, so it carries their credit


def test_built_in_voices_carry_their_engines_credit(tmp_path: Path) -> None:
    kokoro = KokoroEngine(ModelStore(tmp_path / "models", reserve_mb=0)).voices()
    assert len(kokoro) == 54
    assert {(v.credit, v.attribution) for v in kokoro} == {(credits.KOKORO.short, credits.KOKORO.full)}
    settings = Settings(env="test", data_dir=tmp_path / "data")
    (chatterbox,) = ChatterboxEngine(settings, ModelStore(settings.resolved_models_dir, reserve_mb=0)).voices()
    assert (chatterbox.credit, chatterbox.attribution) == (credits.CHATTERBOX.short, credits.CHATTERBOX.full)


def test_cloned_voices_and_blends_carry_theirs_through_the_voice_list(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    cloned = custom_voice(client)
    kokoro = engines["kokoro"]
    first = FakeEngine.voices(kokoro)[0]
    kokoro.voices = lambda: [first, first.model_copy(update={"id": "kokoro:bravo", "name": "Bravo"})]  # type: ignore[method-assign]
    parts = [{"voiceId": "kokoro:alpha", "weight": 1}, {"voiceId": "kokoro:bravo", "weight": 1}]
    made = client.post("/api/voice-profiles/blends", json={"name": "Mix", "parts": parts})
    assert made.status_code == 201
    listed: dict[str, dict[str, Any]] = {v["id"]: v for v in client.get("/api/voices").json()}
    assert (listed[cloned]["credit"], listed[cloned]["attribution"]) == (credits.CLONED.short, credits.CLONED.full)
    blend = listed[made.json()["voiceId"]]
    assert (blend["credit"], blend["attribution"]) == (credits.BLEND.short, credits.BLEND.full)
    assert all("credit" in voice and "attribution" in voice for voice in listed.values())
