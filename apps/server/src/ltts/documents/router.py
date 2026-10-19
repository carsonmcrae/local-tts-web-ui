"""Purpose: HTTP endpoints for the document library.

Scope: Raw-body uploads (no multipart parser), pasted text, library listing, document detail,
section contents, reading progress and deletion. Blocking work runs in the thread pool.
Does NOT belong: Ingestion rules (``service.py``) or audio (``synthesis``).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, Response
from fastapi.concurrency import run_in_threadpool

from ltts.common import ensure_free_space, new_id, save_request_body
from ltts.container import ServicesDep
from ltts.documents.schemas import (
    DocumentDetail,
    DocumentSummary,
    PasteTextRequest,
    ProgressUpdate,
    SectionContent,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])
DocumentId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]


@router.get("", response_model=list[DocumentSummary])
def list_documents(services: ServicesDep) -> list[DocumentSummary]:
    return services.document_repo.list_all()


@router.post("/upload", response_model=DocumentDetail, status_code=201)
async def upload_document(
    request: Request,
    services: ServicesDep,
    filename: Annotated[str, Query(min_length=1, max_length=255)],
) -> DocumentDetail:
    settings = services.settings
    tmp_dir = settings.path("tmp")
    ensure_free_space(tmp_dir, settings.max_upload_bytes, settings.min_free_disk_mb)
    target = tmp_dir / f"{new_id()}.upload"
    size, digest = await save_request_body(request, target, settings.max_upload_bytes)
    return await run_in_threadpool(services.document_service.ingest_file, target, filename, size, digest)


@router.post("/text", response_model=DocumentDetail, status_code=201)
def paste_text(body: PasteTextRequest, services: ServicesDep) -> DocumentDetail:
    return services.document_service.ingest_text(body.text, body.title)


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: DocumentId, services: ServicesDep) -> DocumentDetail:
    return services.document_repo.get(document_id)


@router.get("/{document_id}/sections/{section_index}", response_model=SectionContent)
def get_section(
    document_id: DocumentId, section_index: Annotated[int, Path(ge=0)], services: ServicesDep
) -> SectionContent:
    return services.document_repo.section(document_id, section_index)


@router.put("/{document_id}/progress", status_code=204)
def save_progress(document_id: DocumentId, body: ProgressUpdate, services: ServicesDep) -> Response:
    services.document_repo.save_progress(document_id, body.segment_index, body.voice_id)
    return Response(status_code=204)


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: DocumentId, services: ServicesDep) -> Response:
    services.document_repo.delete(document_id)
    return Response(status_code=204)
