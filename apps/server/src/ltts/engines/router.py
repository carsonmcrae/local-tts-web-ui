"""Purpose: Engine, voice-library and background-job endpoints.

Scope: List engines with capabilities and install state, start/cancel installs, uninstall, list
all voices (built-in and custom), and read/cancel jobs.
Does NOT belong: Voice-profile creation (``voices/router.py``).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Response
from pydantic import Field

from ltts.common import ApiModel
from ltts.container import ServicesDep
from ltts.engines.base import EngineInfo, VoiceInfo
from ltts.jobs import JobOut

router = APIRouter(prefix="/api", tags=["engines"])
EngineId = Annotated[str, Path(pattern=r"^[a-z]+$", max_length=40)]
JobId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]


class InstallRequest(ApiModel):
    option: str | None = Field(default=None, max_length=40, pattern=r"^[a-z0-9\-]+$")


@router.get("/engines", response_model=list[EngineInfo])
def list_engines(services: ServicesDep) -> list[EngineInfo]:
    return services.engines.infos()


@router.post("/engines/{engine_id}/install", response_model=JobOut, status_code=202)
def install_engine(engine_id: EngineId, body: InstallRequest, services: ServicesDep) -> JobOut:
    return services.engines.install(engine_id, body.option)


@router.delete("/engines/{engine_id}", status_code=204)
def uninstall_engine(engine_id: EngineId, services: ServicesDep) -> Response:
    services.engines.uninstall(engine_id)
    services.audio_cache.clear()
    return Response(status_code=204)


@router.get("/voices", response_model=list[VoiceInfo])
def list_voices(services: ServicesDep) -> list[VoiceInfo]:
    return services.engines.voices()


@router.get("/jobs", response_model=list[JobOut])
def list_jobs(services: ServicesDep) -> list[JobOut]:
    return services.jobs.list_recent()


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: JobId, services: ServicesDep) -> JobOut:
    return services.jobs.get(job_id)


@router.post("/jobs/{job_id}/cancel", response_model=JobOut)
def cancel_job(job_id: JobId, services: ServicesDep) -> JobOut:
    return services.jobs.cancel(job_id)
