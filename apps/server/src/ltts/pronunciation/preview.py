# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Hear a word as written and as respelled, in a chosen voice, before saving its pronunciation.

Scope: The request (a voice, a short word or respelling, which of the two it is) and its answer (where
the cached clip is), the rate limit, and rendering through the usual synthesis path (queue, cache,
normalisation) at preview priority with the dictionary left out, so a word is heard exactly as
written and a respelling exactly as it would be spoken in its place.
Does NOT belong: The rules (``store.py``) or HTTP routing (``router.py``).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from pydantic import ConfigDict, Field, field_validator

from ltts.common import ApiModel
from ltts.errors import BusyError
from ltts.pronunciation.store import MAX_SAY_AS_CHARS, PronunciationStore, spoken_respelling, tidy
from ltts.synthesis.scheduler import PRIORITY_PREVIEW
from ltts.synthesis.service import SpokenPlan, SynthesisService

VOICE_ID = r"^[a-z]+:[A-Za-z0-9_\-]+$"


class PronunciationPreviewIn(ApiModel):
    model_config = ConfigDict(extra="forbid")

    voice_id: str = Field(min_length=3, max_length=120, pattern=VOICE_ID)
    text: str = Field(min_length=1, max_length=MAX_SAY_AS_CHARS)  # a word or name, or its respelling
    respelling: bool = False  # read as a respelling ("NYOH-kee": capitals mark stress) instead of as written
    pace: float = Field(default=1.0, ge=0.5, le=2.0)

    @field_validator("text")
    @classmethod
    def _tidy(cls, value: str) -> str:
        return tidy(value)


class PronunciationPreviewOut(ApiModel):
    audio_url: str  # the cached clip (GET /api/audio/{key})
    duration_s: float


async def preview(
    store: PronunciationStore,
    synthesis: SynthesisService,
    body: PronunciationPreviewIn,
    disconnected: Callable[[], Awaitable[bool]],
) -> PronunciationPreviewOut:
    wait = store.previews.hit("")
    if wait is not None:
        raise BusyError(
            "That's a lot of previews. Wait a moment, then listen again.",
            code="rate_limited",
            headers={"Retry-After": str(wait)},
        )
    text = spoken_respelling(body.text) if body.respelling else body.text
    plan = SpokenPlan(body.voice_id, dictionary=False)
    audio = await synthesis.render(plan, text, "sentence", body.pace, PRIORITY_PREVIEW, disconnected)
    return PronunciationPreviewOut(audio_url=f"/api/audio/{audio.key}", duration_s=round(audio.duration_s, 3))
