# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for styling a document's sentences.

Scope: Read a document's styling (per-sentence voice, effect and sound, the dialogue voice and a
revision), change the styling of chosen sentences, and choose the voice that reads quoted dialogue.
Voices must exist and sentences must belong to the document.
Does NOT belong: Storage and planning (``styling.py``) or synthesis.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path

from ltts.container import Services, ServicesDep
from ltts.documents.styling import CastUpdate, DocumentStylesOut, SegmentStyleUpdate
from ltts.errors import ConflictError

router = APIRouter(prefix="/api/documents", tags=["documents"])
DocumentId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]


def _check_voice(services: Services, voice_id: str | None) -> None:
    if voice_id is not None:
        services.engines.resolve(voice_id)  # raises voice_not_found for a voice that doesn't exist


@router.get("/{document_id}/styles")
def get_styles(document_id: DocumentId, services: ServicesDep) -> DocumentStylesOut:
    services.document_repo.get(document_id)
    return services.styling.get(document_id)


@router.put("/{document_id}/styles")
def update_styles(document_id: DocumentId, body: SegmentStyleUpdate, services: ServicesDep) -> DocumentStylesOut:
    """Set (or, with null, clear) a voice, an effect or a sound on the chosen sentences."""
    count = services.document_repo.get(document_id).segment_count
    if any(not 0 <= index < count for index in body.indexes):
        raise ConflictError("Those sentences aren't part of this document.", code="segment_not_found")
    _check_voice(services, body.voice_id)
    return services.styling.update(document_id, body)


@router.put("/{document_id}/cast")
def update_cast(document_id: DocumentId, body: CastUpdate, services: ServicesDep) -> DocumentStylesOut:
    """Choose the voice that reads quoted dialogue in this document (null: the reading voice)."""
    services.document_repo.get(document_id)
    _check_voice(services, body.dialogue_voice_id)
    return services.styling.set_cast(document_id, body)
