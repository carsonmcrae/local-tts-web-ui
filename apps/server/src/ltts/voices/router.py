# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for Voice Studio.

Scope: Analyse a recording without storing it (its quality and the cleanup it needs), preview a
cleanup on it, create a profile from a raw WAV body (with explicit consent and an optional cleanup:
noise reduction, rumble filter, tone), list/rename/delete profiles, change a profile's delivery,
build a studio voice's speaking styles from its kept takes, export a voice as a ``.ttsvoice``
package (after an explicit confirmation) or import one shared with you (with explicit consent), and
play back a profile's stored reference recording.
Does NOT belong: Validation and storage rules (``profiles.py``).
"""

from __future__ import annotations

from pathlib import Path as FsPath
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import Field

from ltts.common import MB, ApiModel, ensure_free_space, new_id, save_request_body
from ltts.container import ServicesDep
from ltts.engines.base import Delivery
from ltts.errors import ConflictError
from ltts.jobs import JobOut
from ltts.voices.blends import BlendIn, BlendOut
from ltts.voices.cleanup import MAX_BASS_BOOST_DB, MAX_TREBLE_CUT_DB, Cleanup, RecordingCheck
from ltts.voices.profiles import CONSENT_STATEMENT, VoiceProfileOut
from ltts.voices.sharing import MAX_PACKAGE_BYTES, VoicePreview, package_name

router = APIRouter(prefix="/api/voice-profiles", tags=["voice studio"])
ProfileId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
MAX_REFERENCE_BYTES = 20 * MB


class ProfileUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    delivery: Delivery | None = None


class ConsentInfo(ApiModel):
    statement: str


def cleanup_params(
    noise_reduction: Annotated[float, Query(alias="noiseReduction", ge=0.0, le=1.0)] = 0.0,
    low_cut: Annotated[bool, Query(alias="lowCut")] = False,
    treble_db: Annotated[float, Query(alias="trebleDb", ge=-MAX_TREBLE_CUT_DB, le=0.0)] = 0.0,
    bass_db: Annotated[float, Query(alias="bassDb", ge=0.0, le=MAX_BASS_BOOST_DB)] = 0.0,
) -> Cleanup:
    """A cleanup from query parameters (uploads carry the audio as the raw body)."""
    return Cleanup(noise_reduction=noise_reduction, low_cut=low_cut, treble_db=treble_db, bass_db=bass_db)


CleanupDep = Annotated[Cleanup, Depends(cleanup_params)]


async def receive_upload(request: Request, services: ServicesDep, max_bytes: int = MAX_REFERENCE_BYTES) -> FsPath:
    """Save a raw audio request body to ``data/tmp``; the caller deletes it when done."""
    tmp = services.settings.path("tmp")
    ensure_free_space(tmp, max_bytes, services.settings.min_free_disk_mb)
    target = tmp / f"{new_id()}.audio"
    await save_request_body(request, target, max_bytes)
    return target


# Declared before the routes with a profile id, which would otherwise match "blends".
@router.get("/blends")
def list_blends(services: ServicesDep) -> list[BlendOut]:
    return services.blends.list_all()


@router.post("/blends", status_code=201)
def create_blend(body: BlendIn, services: ServicesDep) -> BlendOut:
    """Mix two to four built-in Kokoro voices into a new voice (weights are normalized)."""
    return services.blends.create(body)


@router.delete("/blends/{blend_id}", status_code=204)
def delete_blend(blend_id: ProfileId, services: ServicesDep) -> Response:
    services.blends.delete(blend_id)
    return Response(status_code=204)


@router.get("/consent")
def consent_statement() -> ConsentInfo:
    return ConsentInfo(statement=CONSENT_STATEMENT)


@router.post("/analyze")
async def analyze_recording(request: Request, services: ServicesDep) -> RecordingCheck:
    target = await receive_upload(request, services)
    try:
        return await run_in_threadpool(services.voices.analyze_file, target)
    finally:
        target.unlink(missing_ok=True)


@router.post("/cleanup-preview", response_class=Response, responses={200: {"content": {"audio/wav": {}}}})
async def preview_cleanup(request: Request, services: ServicesDep, cleanup: CleanupDep) -> Response:
    """A recording with a cleanup applied, as WAV, to compare with the original."""
    target = await receive_upload(request, services)
    try:
        audio = await run_in_threadpool(services.voices.cleanup_preview, target, cleanup)
    finally:
        target.unlink(missing_ok=True)
    return Response(content=audio, media_type="audio/wav")


@router.post("", status_code=201)
async def create_profile(
    request: Request,
    services: ServicesDep,
    name: Annotated[str, Query(min_length=1, max_length=60)],
    consent: Annotated[bool, Query()],
    cleanup: CleanupDep,
    source: Annotated[Literal["recording", "import"], Query()] = "recording",
) -> VoiceProfileOut:
    target = await receive_upload(request, services)
    try:
        return await run_in_threadpool(services.voices.create, target, name.strip(), consent, source, cleanup)
    finally:
        target.unlink(missing_ok=True)


@router.post("/import/preview")
async def preview_voice_file(request: Request, services: ServicesDep) -> VoicePreview:
    """What a ``.ttsvoice`` package holds, checked exactly as an import would be, without saving it."""
    target = await receive_upload(request, services, MAX_PACKAGE_BYTES)
    try:
        return await run_in_threadpool(services.voice_sharing.preview, target)
    finally:
        target.unlink(missing_ok=True)


@router.post("/import", status_code=201)
async def import_voice(
    request: Request,
    services: ServicesDep,
    consent: Annotated[bool, Query()],
    name: Annotated[str | None, Query(min_length=1, max_length=60)] = None,
) -> VoiceProfileOut:
    """Import a ``.ttsvoice`` package someone shared, once the importer confirms the owner's permission."""
    target = await receive_upload(request, services, MAX_PACKAGE_BYTES)
    try:
        return await run_in_threadpool(services.voice_sharing.import_package, target, consent, name)
    finally:
        target.unlink(missing_ok=True)


@router.get("")
def list_profiles(services: ServicesDep) -> list[VoiceProfileOut]:
    return services.voices.list_all()


@router.patch("/{profile_id}")
def update_profile(profile_id: ProfileId, body: ProfileUpdate, services: ServicesDep) -> VoiceProfileOut:
    name = body.name.strip() if body.name else None
    return services.voices.update(profile_id, name=name or None, delivery=body.delivery)


@router.post("/{profile_id}/styles", status_code=202)
def build_styles(profile_id: ProfileId, services: ServicesDep) -> JobOut:
    """Teach a studio voice saved before speaking styles existed how the speaker asks, exclaims and talks."""
    return services.studio.refine(profile_id)


@router.get("/{profile_id}/export", response_class=Response, responses={200: {"content": {"application/zip": {}}}})
def export_voice(profile_id: ProfileId, services: ServicesDep, confirm: Annotated[bool, Query()] = False) -> Response:
    """The voice as a ``.ttsvoice`` package; ``confirm`` records that the owner chose to share it."""
    if not confirm:
        raise ConflictError("Confirm that you want to share this voice first.", code="confirm_required")
    package, profile = services.voice_sharing.export(profile_id)
    return Response(
        content=package,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{package_name(profile.name)}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/{profile_id}/reference", response_class=FileResponse)
def reference_audio(profile_id: ProfileId, services: ServicesDep) -> FileResponse:
    services.voices.get(profile_id)
    return FileResponse(services.voices.reference_path(profile_id), media_type="audio/wav")


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: ProfileId, services: ServicesDep) -> Response:
    services.voices.delete(profile_id)
    return Response(status_code=204)
