# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for the pronunciation dictionary.

Scope: List, add, change and remove rules (for every document, or for one), and hear a word as
written and as respelled before saving it. The preview lives outside ``/api/pronunciations`` so it
stays on this computer until the LAN policy lists it.
Does NOT belong: Matching or storage rules (``store.py``) or rendering previews (``preview.py``).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Request, Response

from ltts.container import ServicesDep
from ltts.pronunciation.preview import PronunciationPreviewIn, PronunciationPreviewOut, preview
from ltts.pronunciation.store import PronunciationIn, PronunciationOut
from ltts.synthesis.service import ClientGoneError

router = APIRouter(prefix="/api", tags=["pronunciation"])
RuleId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]


@router.get("/pronunciations")
def list_pronunciations(services: ServicesDep) -> list[PronunciationOut]:
    return services.pronunciations.list_all()


@router.post("/pronunciations", status_code=201)
def create_pronunciation(body: PronunciationIn, services: ServicesDep) -> PronunciationOut:
    return services.pronunciations.create(body)


@router.put("/pronunciations/{rule_id}")
def update_pronunciation(rule_id: RuleId, body: PronunciationIn, services: ServicesDep) -> PronunciationOut:
    return services.pronunciations.update(rule_id, body)


@router.delete("/pronunciations/{rule_id}", status_code=204)
def delete_pronunciation(rule_id: RuleId, services: ServicesDep) -> Response:
    services.pronunciations.delete(rule_id)
    return Response(status_code=204)


@router.post("/pronunciation-preview", response_model=PronunciationPreviewOut)
async def preview_pronunciation(
    body: PronunciationPreviewIn, request: Request, services: ServicesDep
) -> PronunciationPreviewOut | Response:
    """Render a word as written, or its respelling, in a voice; play the clip from ``audioUrl``."""
    try:
        return await preview(services.pronunciations, services.synthesis, body, request.is_disconnected)
    except ClientGoneError:
        return Response(status_code=499)
