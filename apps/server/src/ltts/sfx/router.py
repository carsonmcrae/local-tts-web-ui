# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for sound effects: the bundled library and a document's arrangement.

Scope: Read the library (sounds, events, categories); list a document's effects and analyses; add,
change and remove an effect; accept or dismiss suggestions in bulk; analyse one section on request.
Every body is a validated model with unknown fields refused; ids must match the app's hex form.
Analysis runs inside the request (a chapter takes well under a second) and leaves nothing behind.
Does NOT belong: Rules and storage (``store.py``), detection (``detect.py``) or the files (static assets).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Response

from ltts.container import ServicesDep
from ltts.sfx import catalogue
from ltts.sfx.store import (
    AnalysisIn,
    AnalysisOut,
    DocumentEffectsOut,
    EffectIn,
    EffectOut,
    EffectUpdate,
    ReviewIn,
)

router = APIRouter(prefix="/api", tags=["sound-effects"])
DocumentId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
EffectId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]


@router.get("/sound-effects/library")
def get_library() -> catalogue.LibraryOut:
    return catalogue.library()


@router.get("/documents/{document_id}/sound-effects")
def list_effects(document_id: DocumentId, services: ServicesDep) -> DocumentEffectsOut:
    return services.sfx.list_for(document_id)


@router.post("/documents/{document_id}/sound-effects", status_code=201)
def add_effect(document_id: DocumentId, body: EffectIn, services: ServicesDep) -> EffectOut:
    return services.sfx.add(document_id, body)


@router.patch("/documents/{document_id}/sound-effects/{effect_id}")
def update_effect(document_id: DocumentId, effect_id: EffectId, body: EffectUpdate, services: ServicesDep) -> EffectOut:
    return services.sfx.update(document_id, effect_id, body)


@router.delete("/documents/{document_id}/sound-effects/{effect_id}", status_code=204)
def delete_effect(document_id: DocumentId, effect_id: EffectId, services: ServicesDep) -> Response:
    services.sfx.delete(document_id, effect_id)
    return Response(status_code=204)


@router.post("/documents/{document_id}/sound-effects/review")
def review_effects(document_id: DocumentId, body: ReviewIn, services: ServicesDep) -> DocumentEffectsOut:
    return services.sfx.review(document_id, body)


@router.post("/documents/{document_id}/sound-effects/analyse")
def analyse_section(document_id: DocumentId, body: AnalysisIn, services: ServicesDep) -> AnalysisOut:
    return services.sfx.analyse(document_id, body)
