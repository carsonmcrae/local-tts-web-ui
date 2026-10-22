# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for audiobook exports.

Scope: Start an export, list recent exports with what each has saved, how busy the export queue is
(and why a new export can't start), read one, pause, cancel (which discards its saved sentences),
resume a stopped one under the same job, download the finished file (WAV, MP3, M4B, EPUB or a ZIP),
send it to Audiobookshelf and delete an export. A full queue answers 429 ``export_queue_full``; too
little disk space, 507 ``insufficient_disk_space``.
Does NOT belong: Export logic (``service.py``).
"""

from __future__ import annotations

from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Path, Response
from fastapi.responses import FileResponse

from ltts.container import ServicesDep
from ltts.exports.models import ExportOut, ExportQueueOut, ExportRequest
from ltts.jobs import JobOut

router = APIRouter(prefix="/api/exports", tags=["exports"])
JobId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
MEDIA_TYPES = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "m4b": "audio/mp4",
    "epub": "application/epub+zip",
    "zip": "application/zip",
}


@router.post("", status_code=202)
def start_export(body: ExportRequest, services: ServicesDep) -> JobOut:
    return services.exports.start(body)


@router.get("")
def list_exports(services: ServicesDep) -> list[ExportOut]:
    return services.exports.recent()


@router.get("/queue")  # before /{job_id}, which would otherwise match it
def export_queue(services: ServicesDep) -> ExportQueueOut:
    return services.exports.queue()


@router.get("/{job_id}")
def get_export(job_id: JobId, services: ServicesDep) -> ExportOut:
    return services.exports.describe(job_id)


@router.post("/{job_id}/pause", status_code=202)
def pause_export(job_id: JobId, services: ServicesDep) -> JobOut:
    return services.exports.pause(job_id)


@router.post("/{job_id}/cancel", status_code=202)
def cancel_export(job_id: JobId, services: ServicesDep) -> JobOut:
    return services.exports.cancel(job_id)


@router.post("/{job_id}/resume", status_code=202)
def resume_export(job_id: JobId, services: ServicesDep) -> JobOut:
    return services.exports.resume(job_id)


@router.get("/{job_id}/download", response_class=FileResponse)
def download_export(job_id: JobId, services: ServicesDep) -> FileResponse:
    path, filename = services.exports.output(job_id)
    media = MEDIA_TYPES.get(path.suffix.lstrip(".").lower(), "application/octet-stream")
    ascii_name = filename.encode("ascii", "ignore").decode() or "export"
    disposition = f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"
    return FileResponse(path, media_type=media, headers={"Content-Disposition": disposition})


@router.post("/{job_id}/audiobookshelf", status_code=202)
def send_to_audiobookshelf(job_id: JobId, services: ServicesDep) -> JobOut:
    return services.exports.send_to_audiobookshelf(job_id, services.audiobookshelf)


@router.delete("/{job_id}", status_code=204)
def delete_export(job_id: JobId, services: ServicesDep) -> Response:
    services.exports.delete(job_id)
    return Response(status_code=204)
