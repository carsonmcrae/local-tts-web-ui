# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for a document's audiobook details and cover.

Scope: Read and change the author, narrator and description; upload (raw JPEG or PNG body), view and
remove the cover. The cover is served with its own media type and the app's security headers.
Does NOT belong: Validation and storage rules (``details.py``).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Request, Response
from fastapi.responses import FileResponse

from ltts.common import new_id, save_request_body
from ltts.container import ServicesDep
from ltts.documents.details import MAX_COVER_BYTES, DetailsIn, DetailsOut
from ltts.errors import NotFoundError

router = APIRouter(prefix="/api/documents", tags=["documents"])
DocumentId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]


@router.get("/{document_id}/details")
def get_details(document_id: DocumentId, services: ServicesDep) -> DetailsOut:
    services.document_repo.get(document_id)
    return services.details.get(document_id)


@router.put("/{document_id}/details")
def update_details(document_id: DocumentId, body: DetailsIn, services: ServicesDep) -> DetailsOut:
    services.document_repo.get(document_id)
    return services.details.update(document_id, body)


@router.put("/{document_id}/cover")
async def upload_cover(document_id: DocumentId, request: Request, services: ServicesDep) -> DetailsOut:
    services.document_repo.get(document_id)
    target = services.settings.path("tmp") / f"{new_id()}.cover"
    try:
        await save_request_body(request, target, MAX_COVER_BYTES + 1)
        return services.details.set_cover(document_id, target)
    finally:
        target.unlink(missing_ok=True)


@router.get("/{document_id}/cover", response_class=FileResponse)
def get_cover(document_id: DocumentId, services: ServicesDep) -> FileResponse:
    cover = services.details.cover(document_id)
    if cover is None:
        raise NotFoundError("This document has no cover.", code="cover_not_found")
    return FileResponse(cover.path, media_type=cover.media_type)


@router.delete("/{document_id}/cover", status_code=204)
def delete_cover(document_id: DocumentId, services: ServicesDep) -> Response:
    services.details.remove_cover(document_id)
    return Response(status_code=204)
