# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for the pronunciation dictionary.

Scope: List, add, change and remove rules.
Does NOT belong: Matching or storage rules (``store.py``).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Response

from ltts.container import ServicesDep
from ltts.pronunciation.store import PronunciationIn, PronunciationOut

router = APIRouter(prefix="/api/pronunciations", tags=["pronunciation"])
RuleId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]


@router.get("")
def list_pronunciations(services: ServicesDep) -> list[PronunciationOut]:
    return services.pronunciations.list_all()


@router.post("", status_code=201)
def create_pronunciation(body: PronunciationIn, services: ServicesDep) -> PronunciationOut:
    return services.pronunciations.create(body)


@router.put("/{rule_id}")
def update_pronunciation(rule_id: RuleId, body: PronunciationIn, services: ServicesDep) -> PronunciationOut:
    return services.pronunciations.update(rule_id, body)


@router.delete("/{rule_id}", status_code=204)
def delete_pronunciation(rule_id: RuleId, services: ServicesDep) -> Response:
    services.pronunciations.delete(rule_id)
    return Response(status_code=204)
