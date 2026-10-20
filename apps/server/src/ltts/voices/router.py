"""Purpose: HTTP endpoints for Voice Studio.

Scope: Analyse a recording without storing it, create a profile from a raw WAV body (with explicit
consent), list/rename/delete profiles, change a profile's delivery, and play back a profile's stored
reference recording.
Does NOT belong: Validation and storage rules (``profiles.py``).
"""

from __future__ import annotations

from pathlib import Path as FsPath
from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import Field

from ltts.common import MB, ApiModel, ensure_free_space, new_id, save_request_body
from ltts.container import ServicesDep
from ltts.engines.base import Delivery
from ltts.voices.profiles import CONSENT_STATEMENT, VoiceProfileOut
from ltts.voices.quality import QualityReport

router = APIRouter(prefix="/api/voice-profiles", tags=["voice studio"])
ProfileId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
MAX_REFERENCE_BYTES = 20 * MB


class ProfileUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    delivery: Delivery | None = None


class ConsentInfo(ApiModel):
    statement: str


async def receive_upload(request: Request, services: ServicesDep, max_bytes: int = MAX_REFERENCE_BYTES) -> FsPath:
    """Save a raw audio request body to ``data/tmp``; the caller deletes it when done."""
    tmp = services.settings.path("tmp")
    ensure_free_space(tmp, max_bytes, services.settings.min_free_disk_mb)
    target = tmp / f"{new_id()}.audio"
    await save_request_body(request, target, max_bytes)
    return target


@router.get("/consent")
def consent_statement() -> ConsentInfo:
    return ConsentInfo(statement=CONSENT_STATEMENT)


@router.post("/analyze")
async def analyze_recording(request: Request, services: ServicesDep) -> QualityReport:
    target = await receive_upload(request, services)
    try:
        return await run_in_threadpool(services.voices.analyze_file, target)
    finally:
        target.unlink(missing_ok=True)


@router.post("", status_code=201)
async def create_profile(
    request: Request,
    services: ServicesDep,
    name: Annotated[str, Query(min_length=1, max_length=60)],
    consent: Annotated[bool, Query()],
    source: Annotated[Literal["recording", "import"], Query()] = "recording",
) -> VoiceProfileOut:
    target = await receive_upload(request, services)
    try:
        return await run_in_threadpool(services.voices.create, target, name.strip(), consent, source)
    finally:
        target.unlink(missing_ok=True)


@router.get("")
def list_profiles(services: ServicesDep) -> list[VoiceProfileOut]:
    return services.voices.list_all()


@router.patch("/{profile_id}")
def update_profile(profile_id: ProfileId, body: ProfileUpdate, services: ServicesDep) -> VoiceProfileOut:
    name = body.name.strip() if body.name else None
    return services.voices.update(profile_id, name=name or None, delivery=body.delivery)


@router.get("/{profile_id}/reference", response_class=FileResponse)
def reference_audio(profile_id: ProfileId, services: ServicesDep) -> FileResponse:
    services.voices.get(profile_id)
    return FileResponse(services.voices.reference_path(profile_id), media_type="audio/wav")


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: ProfileId, services: ServicesDep) -> Response:
    services.voices.delete(profile_id)
    return Response(status_code=204)
