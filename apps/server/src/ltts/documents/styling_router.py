# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for how a document's sentences are read: styling, characters and takes.

Scope: Read and change a document's sentence styling (voice, effect, sound, speaking style, take and
pause) and its cast (the dialogue voice and whether quoted speech in narration is voiced apart).
List the characters dialogue tags name and give each a voice; save a document's cast as a reusable
preset and apply one to another document. Make a candidate take of one sentence to listen to before
keeping it. Only one candidate is made at a time, so repeated clicks can't queue GPU work. Voices
must exist and sentences must belong to the document.
Does NOT belong: Storage and planning (``styling.py``, ``casting.py``) or synthesis.
"""

from __future__ import annotations

import asyncio
import dataclasses
from typing import Annotated

from fastapi import APIRouter, Path, Request, Response
from pydantic import Field

from ltts.common import ApiModel
from ltts.container import Services, ServicesDep
from ltts.documents.casting import CastPresetIn, CastPresetOut, CharacterAssignment, CharacterOut
from ltts.documents.styling import MAX_TAKE, CastUpdate, DocumentStylesOut, SegmentStyleUpdate
from ltts.errors import BusyError, ConflictError
from ltts.synthesis.scheduler import PRIORITY_PLAYBACK

router = APIRouter(prefix="/api", tags=["documents"])
DocumentId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
PresetId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
_making_take = asyncio.Lock()


class TakeRequest(ApiModel):
    voice_id: str = Field(max_length=120, pattern=r"^[a-z]+:[A-Za-z0-9_\-]+$")
    pace: float = Field(default=1.0, ge=0.5, le=2.0)
    take: int | None = Field(default=None, ge=0, le=MAX_TAKE)  # None: the one after the sentence's current take


class SentenceTakeOut(ApiModel):
    take: int
    audio_url: str
    duration_s: float


def _check_voice(services: Services, voice_id: str | None) -> None:
    if voice_id is not None:
        services.engines.resolve(voice_id)  # raises voice_not_found for a voice that doesn't exist


def _check_sentences(services: Services, document_id: str, indexes: list[int]) -> None:
    count = services.document_repo.get(document_id).segment_count
    if any(not 0 <= index < count for index in indexes):
        raise ConflictError("Those sentences aren't part of this document.", code="segment_not_found")


@router.get("/documents/{document_id}/styles")
def get_styles(document_id: DocumentId, services: ServicesDep) -> DocumentStylesOut:
    services.document_repo.get(document_id)
    return services.styling.get(document_id)


@router.put("/documents/{document_id}/styles")
def update_styles(document_id: DocumentId, body: SegmentStyleUpdate, services: ServicesDep) -> DocumentStylesOut:
    """Set (or, with null, clear) a voice, effect, sound, style, take or pause on the chosen sentences."""
    _check_sentences(services, document_id, body.indexes)
    _check_voice(services, body.voice_id)
    return services.styling.update(document_id, body)


@router.put("/documents/{document_id}/cast")
def update_cast(document_id: DocumentId, body: CastUpdate, services: ServicesDep) -> DocumentStylesOut:
    """Choose the voice for quoted dialogue (null: the reading voice) and whether it is split from narration."""
    services.document_repo.get(document_id)
    _check_voice(services, body.dialogue_voice_id)
    return services.styling.set_cast(document_id, body)


@router.get("/documents/{document_id}/characters")
def list_characters(document_id: DocumentId, services: ServicesDep) -> list[CharacterOut]:
    services.document_repo.get(document_id)
    return services.casting.list_for(document_id)


@router.put("/documents/{document_id}/characters")
def assign_character(document_id: DocumentId, body: CharacterAssignment, services: ServicesDep) -> list[CharacterOut]:
    """Give a character a voice (or, with null, take it away); a name not found in the text is kept too."""
    services.document_repo.get(document_id)
    _check_voice(services, body.voice_id)
    return services.casting.assign(document_id, body)


@router.get("/cast-presets")
def list_presets(services: ServicesDep) -> list[CastPresetOut]:
    return services.casting.presets()


@router.post("/documents/{document_id}/cast-presets", status_code=201)
def save_preset(document_id: DocumentId, body: CastPresetIn, services: ServicesDep) -> CastPresetOut:
    services.document_repo.get(document_id)
    return services.casting.save_preset(document_id, body)


@router.post("/documents/{document_id}/cast-presets/{preset_id}/apply")
def apply_preset(document_id: DocumentId, preset_id: PresetId, services: ServicesDep) -> list[CharacterOut]:
    services.document_repo.get(document_id)
    return services.casting.apply_preset(document_id, preset_id)


@router.delete("/cast-presets/{preset_id}", status_code=204)
def delete_preset(preset_id: PresetId, services: ServicesDep) -> Response:
    services.casting.delete_preset(preset_id)
    return Response(status_code=204)


@router.post("/documents/{document_id}/segments/{index}/takes")
async def make_take(
    document_id: DocumentId,
    index: Annotated[int, Path(ge=0)],
    body: TakeRequest,
    request: Request,
    services: ServicesDep,
) -> SentenceTakeOut:
    """Generate another take of one sentence to listen to; keep it by setting the sentence's take."""
    if _making_take.locked():
        raise BusyError("Still making the last take. Try again in a moment.", code="take_busy")
    async with _making_take:
        text, boundary = services.document_repo.segment(document_id, index)
        plan = services.synthesis.plan_segment(document_id, index, text, body.voice_id)
        if not services.synthesis.supports_takes(plan):
            raise ConflictError(
                "Built-in voices read a sentence the same way every time. Give the sentence a custom voice, "
                "or change its effect or style instead.",
                code="take_not_supported",
            )
        take = plan.take + 1 if body.take is None else body.take
        candidate = dataclasses.replace(plan, take=take)
        audio = await services.synthesis.render(
            candidate, text, boundary, body.pace, PRIORITY_PLAYBACK, request.is_disconnected
        )
    return SentenceTakeOut(take=take, audio_url=f"/api/audio/{audio.key}", duration_s=round(audio.duration_s, 3))
