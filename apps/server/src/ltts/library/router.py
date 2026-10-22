# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for the bundled literary catalog (Explore).

Scope: List the works with where each stands in this library, open one as a document (the existing
document when there is one), serve a work's cover and the credits, and hide a work from Explore or
show it again. Work ids are checked against their pattern and must be in the catalog. For a document
that is a bundled work with a reading preset: what the preset offers, applying the components the
reader chose, and taking them out again.
Does NOT belong: Reading the catalog or opening works (``catalog.py``), or the presets' logic (``presets.py``).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import PlainTextResponse

from ltts.container import ServicesDep
from ltts.documents.schemas import DocumentDetail
from ltts.library.catalog import WORK_ID_PATTERN, HiddenUpdate, WorkOut
from ltts.library.presets import PresetApplyRequest, ReadingPresetOut

router = APIRouter(prefix="/api/library/works", tags=["library"])
presets_router = APIRouter(prefix="/api/documents", tags=["library"])
WorkId = Annotated[str, Path(pattern=WORK_ID_PATTERN)]
DocumentId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]


@router.get("")
def list_works(services: ServicesDep) -> list[WorkOut]:
    return services.catalog.list_all()


@router.post("/{work_id}/open", status_code=201)
async def open_work(work_id: WorkId, services: ServicesDep) -> DocumentDetail:
    """Add the book to the library (read through the ordinary document pipeline), or return it if it is there."""
    return await run_in_threadpool(services.catalog.open, work_id)


@router.get("/{work_id}/cover")
def work_cover(work_id: WorkId, services: ServicesDep) -> Response:
    cover = services.catalog.cover(work_id)
    return Response(cover.data, media_type=cover.media_type, headers={"Cache-Control": "public, max-age=86400"})


@router.put("/{work_id}/hidden")
def set_hidden(work_id: WorkId, body: HiddenUpdate, services: ServicesDep) -> WorkOut:
    """Hide a work from Explore (or show it again); the library's documents are untouched."""
    return services.catalog.set_hidden(work_id, body.hidden)


@router.get("/credits", response_class=PlainTextResponse)
def credits(services: ServicesDep) -> str:
    return services.catalog.credits()


@presets_router.get("/{document_id}/preset")
def document_preset(document_id: DocumentId, services: ServicesDep) -> ReadingPresetOut:
    """What the book's reading preset offers this document: voices found here, anchors that resolve, what's applied."""
    preset = services.presets.for_document(document_id)
    return services.presets.report(document_id, preset)


@presets_router.post("/{document_id}/preset/apply")
def apply_preset(document_id: DocumentId, body: PresetApplyRequest, services: ServicesDep) -> ReadingPresetOut:
    """Apply the chosen components (voices and speakers today); music and effects are never started here."""
    preset = services.presets.for_document(document_id)
    return services.presets.apply(document_id, preset, body.components)


@presets_router.delete("/{document_id}/preset", status_code=204)
def remove_preset(document_id: DocumentId, services: ServicesDep) -> Response:
    """Take out what the preset wrote; the reader's own voices and styling stay."""
    services.presets.for_document(document_id)
    services.presets.remove(document_id)
    return Response(status_code=204)
