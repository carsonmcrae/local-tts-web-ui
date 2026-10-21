# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The OpenAI-compatible local speech API: ``POST /v1/audio/speech``, ``GET /v1/models``, ``GET /v1/voices``.

Scope: Every ``/v1`` request passes the same checks, in order: the API is switched on (otherwise
every ``/v1`` path answers 404 as if it didn't exist, before any other work), the request doesn't
come from a browser page, the client is this computer (or the owner allowed other devices), the
bearer token is valid (401 without saying why), and the rate limit (429 with ``Retry-After``). A
request that passes them records the port it arrived on, so Settings can say when programs need a new
one. The speech body must be JSON, is read under a byte limit and a time limit (408), and validated
strictly; a client that disconnects while sending it gets nothing. No CORS headers are ever sent.
Logs carry counts and lengths only, never the token or the text.
Does NOT belong: Synthesis (``service.py``) or the Settings endpoints (``settings_router.py``).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import ClientDisconnect

from ltts.container import ServicesDep
from ltts.errors import AppError, BusyError, ForbiddenError, PayloadTooLargeError, UnsupportedDocumentError
from ltts.speech_api.guard import bearer, from_browser, is_local, server_port
from ltts.speech_api.schemas import ModelList, ModelOut, SpeechRequest, VoiceList, VoiceOut
from ltts.speech_api.service import OPENAI_NAMES
from ltts.speech_api.store import SpeechApiConfig
from ltts.synthesis.service import ClientGoneError

log = logging.getLogger("ltts.speech_api")
router = APIRouter(prefix="/v1", tags=["speech api"], include_in_schema=False)
METHODS = {"/v1/audio/speech": "POST", "/v1/models": "GET", "/v1/voices": "GET", "/v1/audio/voices": "GET"}
BODY_OVERHEAD = 16 * 1024  # the JSON around the input
BYTES_PER_CHAR = 12  # the most a JSON-escaped character can take (a surrogate pair written as two \u escapes)
BODY_TIMEOUT_S = 30.0  # a body this small arrives in well under a second, even over Wi-Fi
CLIENT_GONE = 499  # nginx's "client closed request": nobody is left to read it


class TokenError(AppError):
    status_code = 401
    code = "invalid_token"


class MethodError(AppError):
    status_code = 405
    code = "method_not_allowed"


class BodyTimeoutError(AppError):
    status_code = 408
    code = "request_timeout"


def _hidden() -> StarletteHTTPException:
    """The same 404 an unknown path gets."""
    return StarletteHTTPException(status_code=404)


def _access(request: Request, services: ServicesDep) -> SpeechApiConfig:
    api = services.speech_api
    config = api.store.config()
    if not config.enabled:
        raise _hidden()
    if from_browser(request.headers):
        raise ForbiddenError(
            "Web pages can't use the speech API. Call it from a program or script on this computer.",
            code="browser_not_allowed",
        )
    if not config.allow_network and not is_local(request.client.host if request.client else None):
        raise ForbiddenError("The speech API only accepts programs on this computer.", code="network_not_allowed")
    if not config.accepts(bearer(request.headers.get("authorization"))):
        raise TokenError(
            "A valid API token is required (Authorization: Bearer <token>).", headers={"WWW-Authenticate": "Bearer"}
        )
    port = server_port(request.scope)
    if port is not None and port != config.last_port:
        api.store.used_on(port)
    wait = api.limiter.hit(config.token_hash or "")
    if wait is not None:
        raise BusyError(
            "Too many requests. Wait a moment and try again.", code="rate_limited", headers={"Retry-After": str(wait)}
        )
    return config


Access = Annotated[SpeechApiConfig, Depends(_access)]


async def _json_body(request: Request, limit: int) -> bytes:
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type != "application/json":
        raise UnsupportedDocumentError(
            "Send the request as JSON, with Content-Type: application/json.", code="unsupported_media_type"
        )
    too_large = PayloadTooLargeError("The request body is too large.", details={"limitBytes": limit})
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise too_large
    body = bytearray()
    try:
        async with asyncio.timeout(BODY_TIMEOUT_S):
            async for chunk in request.stream():
                body += chunk
                if len(body) > limit:
                    raise too_large
    except TimeoutError:
        raise BodyTimeoutError("The request body took too long to arrive.") from None
    return bytes(body)


@router.get("/models")
def list_models(services: ServicesDep, _: Access) -> ModelList:
    return ModelList(data=[ModelOut(id=model) for model in services.speech_api.models()])


@router.get("/voices")
@router.get("/audio/voices")
def list_voices(services: ServicesDep, config: Access) -> VoiceList:
    voices = services.speech_api.voices(config)
    return VoiceList(
        data=[
            VoiceOut(
                id=voice.id,
                name=voice.name,
                engine=voice.engine_id,
                language=voice.language,
                language_code=voice.language_code,
                gender=voice.gender,
                category=voice.category,
                openai_name=OPENAI_NAMES.get(voice.id),
            )
            for voice in voices
        ]
    )


@router.post("/audio/speech")
async def create_speech(request: Request, services: ServicesDep, config: Access) -> Response:
    api = services.speech_api
    try:
        raw = await _json_body(request, BODY_OVERHEAD + BYTES_PER_CHAR * api.settings.speech_api_max_chars)
    except ClientDisconnect:
        return Response(status_code=CLIENT_GONE)
    try:
        speech = SpeechRequest.model_validate_json(raw)
    except ValidationError as exc:
        # Only the field names reach the response; the input itself is never echoed or logged.
        raise RequestValidationError(
            exc.errors(include_input=False, include_context=False, include_url=False)
        ) from None
    speech = api.check(config, speech)
    parts = api.sentences(speech.input)
    try:
        audio = await api.speak(speech, parts, request.is_disconnected)
    except ClientGoneError:
        return Response(status_code=CLIENT_GONE)
    log.info(
        "speech api request served",
        extra={
            "chars": len(speech.input),
            "sentences": audio.sentences,
            "format": speech.response_format,
            "audio_s": round(audio.duration_s, 2),
        },
    )
    return Response(
        audio.body,
        media_type=audio.content_type,
        headers={
            "X-Audio-Duration": f"{audio.duration_s:.3f}",
            "X-Sample-Rate": str(audio.sample_rate),
        },
    )


@router.api_route("/{path:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
def unknown(path: str, services: ServicesDep) -> Response:
    """Every other ``/v1`` request, including CORS pre-flights, which never get CORS headers."""
    method = METHODS.get(f"/v1/{path}")
    if method is None or not services.speech_api.store.config().enabled:
        raise _hidden()
    raise MethodError(f"Use {method} for /v1/{path}.", headers={"Allow": method})
