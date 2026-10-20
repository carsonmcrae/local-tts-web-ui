# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for studio voice sessions.

Scope: Check a microphone test clip (its quality and the cleanup it needs); create (with an optional
cleanup: noise reduction, rumble filter, tone), list, read and delete draft sessions; save (raw WAV,
FLAC or OGG body) or delete numbered takes; import a long recording; start the voice build job; play
a candidate's test samples; and finish a session into a voice profile (with explicit consent).
Does NOT belong: Session storage and the build itself (``sessions.py``, ``studio.py``).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Path, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from ltts.common import MB, ApiModel
from ltts.container import ServicesDep
from ltts.jobs import JobOut
from ltts.voices.cleanup import Cleanup, RecordingCheck
from ltts.voices.profiles import VoiceProfileOut
from ltts.voices.router import receive_upload
from ltts.voices.sessions import TakeOut, VoiceSessionOut
from ltts.voices.studio import FinishRequest

router = APIRouter(prefix="/api/voice-sessions", tags=["voice studio"])
SessionId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
TakeNumber = Annotated[int, Path(ge=1, le=999)]
MAX_TAKE_BYTES = 20 * MB
MAX_IMPORT_BYTES = 600 * MB  # 30 minutes of 48 kHz, 24-bit stereo WAV fits


class SessionCreate(ApiModel):
    cleanup: Cleanup | None = None


@router.post("/microphone-check")
async def check_microphone(request: Request, services: ServicesDep) -> RecordingCheck:
    target = await receive_upload(request, services, MAX_TAKE_BYTES)
    try:
        return await run_in_threadpool(services.voice_sessions.check_microphone, target)
    finally:
        target.unlink(missing_ok=True)


@router.post("", status_code=201)
def create_session(services: ServicesDep, body: Annotated[SessionCreate | None, Body()] = None) -> VoiceSessionOut:
    return services.voice_sessions.create(body.cleanup if body else None)


@router.get("")
def list_sessions(services: ServicesDep) -> list[VoiceSessionOut]:
    return services.voice_sessions.list_all()


@router.get("/{session_id}")
def get_session(session_id: SessionId, services: ServicesDep) -> VoiceSessionOut:
    return services.voice_sessions.get(session_id)


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: SessionId, services: ServicesDep) -> Response:
    services.voice_sessions.delete(session_id)
    return Response(status_code=204)


@router.put("/{session_id}/takes/{number}")
async def save_take(
    session_id: SessionId,
    number: TakeNumber,
    request: Request,
    services: ServicesDep,
    prompt_id: Annotated[str | None, Query(alias="promptId", pattern=r"^[a-z0-9-]{1,40}$")] = None,
) -> TakeOut:
    target = await receive_upload(request, services, MAX_TAKE_BYTES)
    try:
        return await run_in_threadpool(services.voice_sessions.put_take, session_id, number, target, prompt_id)
    finally:
        target.unlink(missing_ok=True)


@router.delete("/{session_id}/takes/{number}", status_code=204)
def delete_take(session_id: SessionId, number: TakeNumber, services: ServicesDep) -> Response:
    services.voice_sessions.delete_take(session_id, number)
    return Response(status_code=204)


@router.post("/{session_id}/import")
async def import_recording(session_id: SessionId, request: Request, services: ServicesDep) -> VoiceSessionOut:
    services.voice_sessions.get(session_id)
    target = await receive_upload(request, services, MAX_IMPORT_BYTES)
    try:
        return await run_in_threadpool(services.voice_sessions.import_recording, session_id, target)
    finally:
        target.unlink(missing_ok=True)


@router.post("/{session_id}/build", status_code=202)
def build_voice(session_id: SessionId, services: ServicesDep) -> JobOut:
    return services.studio.build(session_id)


@router.get("/{session_id}/candidates/{index}/samples/{sample}", response_class=FileResponse)
def candidate_sample(
    session_id: SessionId,
    index: Annotated[int, Path(ge=0, le=99)],
    sample: Annotated[int, Path(ge=0, le=99)],
    services: ServicesDep,
) -> FileResponse:
    return FileResponse(services.studio.sample_path(session_id, index, sample), media_type="audio/wav")


@router.post("/{session_id}/finish", status_code=201)
def finish_session(session_id: SessionId, body: FinishRequest, services: ServicesDep) -> VoiceProfileOut:
    return services.studio.finish(session_id, body)
