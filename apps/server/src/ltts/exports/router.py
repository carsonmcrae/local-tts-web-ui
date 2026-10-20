# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: HTTP endpoints for starting, resuming, downloading and deleting audio exports.

Scope: Thin wrappers over ``ExportService``; downloads use a sanitised attachment filename.
Does NOT belong: Export assembly (``service.py``).
"""

from __future__ import annotations

from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Path, Response
from fastapi.responses import FileResponse

from ltts.container import ServicesDep
from ltts.exports.service import ExportRequest
from ltts.jobs import JobOut

router = APIRouter(prefix="/api/exports", tags=["exports"])
JobId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]


@router.post("", status_code=202)
def start_export(body: ExportRequest, services: ServicesDep) -> JobOut:
    return services.exports.start(body)


@router.post("/{job_id}/resume", status_code=202)
def resume_export(job_id: JobId, services: ServicesDep) -> JobOut:
    return services.exports.resume(job_id)


@router.get("/{job_id}/download", response_class=FileResponse)
def download_export(job_id: JobId, services: ServicesDep) -> FileResponse:
    path, filename = services.exports.output(job_id)
    media = {"mp3": "audio/mpeg", "wav": "audio/wav", "zip": "application/zip"}[path.suffix.lstrip(".")]
    ascii_name = filename.encode("ascii", "ignore").decode() or "export"
    disposition = f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"
    return FileResponse(path, media_type=media, headers={"Content-Disposition": disposition})


@router.delete("/{job_id}", status_code=204)
def delete_export(job_id: JobId, services: ServicesDep) -> Response:
    services.exports.delete(job_id)
    return Response(status_code=204)
