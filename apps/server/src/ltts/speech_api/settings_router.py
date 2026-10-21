# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The Settings endpoints for the local speech API (under ``/api``, so only the app's own UI can call them).

Scope: Read the status (switches, allowed custom voices, whether a token exists and when it was made,
the port and limits, and usage since the server started), save the switches and allowed voices,
create a token (returned once, in this response only), revoke it, and a light "in use" reading for
the app's indicator.
Does NOT belong: The ``/v1`` endpoints themselves (``router.py``).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response

from ltts.container import ServicesDep
from ltts.speech_api.schemas import SpeechApiActivity, SpeechApiSettingsIn, SpeechApiStatus, SpeechApiToken

log = logging.getLogger("ltts.speech_api")
router = APIRouter(prefix="/api/speech-api", tags=["speech api"])


def _port(request: Request) -> int | None:
    """The port this server listens on (the UI may be served from another one while developing)."""
    server = request.scope.get("server")
    return int(server[1]) if server and server[1] else None


@router.get("")
def get_speech_api(request: Request, services: ServicesDep) -> SpeechApiStatus:
    api = services.speech_api
    return api.status(api.store.prune_voices(), _port(request), lan_mode=services.lan.enabled)


@router.put("")
def save_speech_api(body: SpeechApiSettingsIn, request: Request, services: ServicesDep) -> SpeechApiStatus:
    api = services.speech_api
    config = api.store.save(enabled=body.enabled, allow_network=body.allow_network, allowed_voices=body.allowed_voices)
    log.info(
        "speech api settings saved",
        extra={"enabled": config.enabled, "allow_network": config.allow_network, "voices": len(config.allowed_voices)},
    )
    return api.status(config, _port(request), lan_mode=services.lan.enabled)


@router.post("/token", status_code=201)
def create_token(services: ServicesDep) -> SpeechApiToken:
    token, config = services.speech_api.store.new_token()
    log.info("speech api token created")
    return SpeechApiToken(token=token, created_at=config.token_created_at or "")


@router.delete("/token", status_code=204)
def revoke_token(services: ServicesDep) -> Response:
    services.speech_api.store.revoke()
    log.info("speech api token revoked")
    return Response(status_code=204)


@router.get("/activity")
def speech_api_activity(services: ServicesDep) -> SpeechApiActivity:
    """Polled by the app shell: cheap, and says nothing beyond on/off and in use."""
    api = services.speech_api
    return SpeechApiActivity(enabled=api.store.config().enabled, active=api.usage.snapshot().active)
