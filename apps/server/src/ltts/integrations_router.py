# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for optional integrations: Audiobookshelf.

Scope: Read the Audiobookshelf settings (never the API key, only whether one is saved), save them,
forget them (deleting the key), and test the connection by listing the libraries and folders the key
can upload to.
Does NOT belong: The integration itself (``exports/audiobookshelf.py``).
"""

from __future__ import annotations

from fastapi import APIRouter, Response

from ltts.container import ServicesDep
from ltts.exports.audiobookshelf import AbsLibrary, AbsSettingsIn, AbsSettingsOut

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.get("/audiobookshelf")
def get_audiobookshelf(services: ServicesDep) -> AbsSettingsOut:
    return services.audiobookshelf.settings()


@router.put("/audiobookshelf")
def save_audiobookshelf(body: AbsSettingsIn, services: ServicesDep) -> AbsSettingsOut:
    return services.audiobookshelf.save(body)


@router.delete("/audiobookshelf", status_code=204)
def forget_audiobookshelf(services: ServicesDep) -> Response:
    services.audiobookshelf.forget()
    return Response(status_code=204)


@router.post("/audiobookshelf/test")
def test_audiobookshelf(services: ServicesDep) -> list[AbsLibrary]:
    """Check the address and key by listing the libraries and folders the key can upload to."""
    return services.audiobookshelf.libraries()
