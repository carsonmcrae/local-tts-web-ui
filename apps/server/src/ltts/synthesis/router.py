"""Purpose: Audio endpoints: per-segment narration audio and short voice previews.

Scope: Streams cached WAV files (with byte-range support) and their duration in a response header;
previews accept a short custom passage so voices can be compared on identical text and also expose a
direct GET URL for the cached clip (``X-Audio-Url``) because some browsers (WebKit) will not play
media from Blob URLs. Requests a client abandons release their queued synthesis work.
Does NOT belong: Synthesis logic (``service.py``).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request
from fastapi.responses import FileResponse, Response
from pydantic import Field

from ltts.common import ApiModel
from ltts.container import ServicesDep
from ltts.errors import NotFoundError
from ltts.synthesis.cache import CachedAudio
from ltts.synthesis.scheduler import PRIORITY_PLAYBACK, PRIORITY_PREFETCH, PRIORITY_PREVIEW
from ltts.synthesis.service import MAX_PREVIEW_CHARS, ClientGoneError

router = APIRouter(prefix="/api", tags=["audio"])

PREVIEW_TEXT = (
    "The lighthouse keeper climbed the spiral stairs, counting each step aloud. "
    "Somewhere below, the sea whispered against the rocks — patient, endless, and calm."
)
VoiceId = Annotated[str, Query(min_length=3, max_length=120, pattern=r"^[a-z]+:[A-Za-z0-9_\-]+$")]
Pace = Annotated[float, Query(ge=0.5, le=2.0)]


class PreviewRequest(ApiModel):
    text: str | None = Field(default=None, max_length=MAX_PREVIEW_CHARS)
    pace: float = Field(default=1.0, ge=0.5, le=2.0)


def _audio_response(audio: CachedAudio) -> FileResponse:
    return FileResponse(
        audio.path,
        media_type="audio/wav",
        headers={
            "X-Audio-Duration": f"{audio.duration_s:.3f}",
            "X-Audio-Url": f"/api/audio/{audio.key}",
            "Cache-Control": "no-store",
        },
    )


@router.get("/audio/{key}", response_class=FileResponse)
def cached_audio(key: Annotated[str, Path(pattern=r"^[0-9a-f]{64}$")], services: ServicesDep) -> Response:
    """Play an already-generated clip by its content key (previews, direct media URLs)."""
    audio = services.audio_cache.get(key)
    if audio is None:
        raise NotFoundError("That audio is no longer cached. Generate it again.", code="audio_not_cached")
    return _audio_response(audio)


@router.get("/documents/{document_id}/segments/{index}/audio", response_class=FileResponse)
async def segment_audio(
    request: Request,
    services: ServicesDep,
    document_id: Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")],
    index: Annotated[int, Path(ge=0)],
    voice: VoiceId,
    pace: Pace = 1.0,
    prefetch: bool = False,
) -> Response:
    priority = PRIORITY_PREFETCH if prefetch else PRIORITY_PLAYBACK
    try:
        audio = await services.synthesis.segment_audio(
            document_id, index, voice, pace, priority, request.is_disconnected
        )
    except ClientGoneError:
        return Response(status_code=499)
    return _audio_response(audio)


@router.post("/voices/{voice_id}/preview", response_class=FileResponse)
async def preview_voice(
    request: Request,
    services: ServicesDep,
    voice_id: Annotated[str, Path(min_length=3, max_length=120, pattern=r"^[a-z]+:[A-Za-z0-9_\-]+$")],
    body: PreviewRequest,
) -> Response:
    try:
        audio = await services.synthesis.render(
            voice_id,
            body.text or PREVIEW_TEXT,
            "sentence",
            body.pace,
            PRIORITY_PREVIEW,
            request.is_disconnected,
        )
    except ClientGoneError:
        return Response(status_code=499)
    return _audio_response(audio)
