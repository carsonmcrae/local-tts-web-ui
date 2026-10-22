# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Voice blends: a new voice mixed from two to four built-in Kokoro voices.

Scope: A blend is a name and its parts (built-in Kokoro voices with weights, normalized to add up to
one), stored in ``voice_blends`` and offered as the voice ``blend:<id>``. Kokoro speaks from a style
vector per voice, so a blend is the weighted mix of its parts' vectors; it reads with the first
part's language. Cloned (Chatterbox) voices can't be blended: that engine copies one speaker's
recording, and mixing their conditioning isn't something it supports. Deleting a blend frees its
audio and forgets it wherever a document used it. Blends are fixed once made, so audio made with
one never goes stale (a changed mix is a new blend).
Does NOT belong: Speaking (``engines/kokoro.py``) or HTTP parsing (``router.py``).
"""

from __future__ import annotations

import hashlib
import json
import logging
import sqlite3
from collections.abc import Callable

from pydantic import Field, field_validator

from ltts.common import ApiModel, new_id, utc_now
from ltts.db import Database
from ltts.engines.base import VoiceInfo, VoiceSpec
from ltts.engines.credits import BLEND
from ltts.errors import ConflictError, NotFoundError

log = logging.getLogger("ltts.voices.blends")
PREFIX = "blend"
BLEND_ENGINE = "kokoro"
MAX_BLENDS = 50


class BlendPart(ApiModel):
    voice_id: str = Field(pattern=r"^kokoro:[a-z0-9_]{1,40}$")
    weight: float = Field(gt=0, le=100)  # relative: the parts are normalized to add up to one


class BlendIn(ApiModel):
    name: str = Field(min_length=1, max_length=60)
    parts: list[BlendPart] = Field(min_length=2, max_length=4)

    @field_validator("parts")
    @classmethod
    def _different_voices(cls, parts: list[BlendPart]) -> list[BlendPart]:
        if len({part.voice_id for part in parts}) != len(parts):
            raise ValueError("each voice can be in a blend once")
        return parts


class BlendOut(ApiModel):
    id: str
    voice_id: str  # blend:<id>, used like any other voice
    name: str
    parts: list[BlendPart]
    created_at: str


def _normalized(parts: list[BlendPart]) -> list[BlendPart]:
    total = sum(part.weight for part in parts)
    return [BlendPart(voice_id=part.voice_id, weight=round(part.weight / total, 4)) for part in parts]


class BlendStore:
    def __init__(self, db: Database, builtin: Callable[[], list[VoiceInfo]], purge_audio: Callable[[str], int]):
        self._db = db
        self._builtin = builtin  # the built-in Kokoro voices that can be blended
        self._purge_audio = purge_audio

    def list_all(self) -> list[BlendOut]:
        with self._db.connect() as conn:
            rows = conn.execute("SELECT * FROM voice_blends ORDER BY created_at").fetchall()
        return [_out(row) for row in rows]

    def get(self, blend_id: str) -> BlendOut:
        with self._db.connect() as conn:
            row = conn.execute("SELECT * FROM voice_blends WHERE id = ?", (blend_id,)).fetchone()
        if row is None:
            raise NotFoundError("That voice blend no longer exists.", code="voice_not_found")
        return _out(row)

    def create(self, blend: BlendIn) -> BlendOut:
        known = {voice.id for voice in self._builtin()}
        missing = [part.voice_id for part in blend.parts if part.voice_id not in known]
        if missing:
            raise NotFoundError(
                "Only built-in Kokoro voices can be blended, and these aren't available: " + ", ".join(missing),
                code="blend_voice_unavailable",
            )
        if len(self.list_all()) >= MAX_BLENDS:
            raise ConflictError(f"You can keep up to {MAX_BLENDS} voice blends.", code="blend_limit")
        blend_id = new_id()
        parts = json.dumps([part.model_dump(by_alias=True) for part in _normalized(blend.parts)])
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO voice_blends (id, name, parts_json, created_at) VALUES (?, ?, ?, ?)",
                (blend_id, blend.name.strip(), parts, utc_now()),
            )
        log.info("voice blend created", extra={"blend_id": blend_id, "parts": len(blend.parts)})
        return self.get(blend_id)

    def delete(self, blend_id: str) -> None:
        voice_id = self.get(blend_id).voice_id
        with self._db.connect() as conn:
            conn.execute("DELETE FROM voice_blends WHERE id = ?", (blend_id,))
            conn.execute("DELETE FROM segment_annotations WHERE kind = 'voice' AND value = ?", (voice_id,))
            conn.execute("DELETE FROM document_characters WHERE voice_id = ?", (voice_id,))
        self._purge_audio(voice_id)

    def resolve(self, blend_id: str) -> tuple[str, VoiceSpec, str]:
        """The engine, voice spec and revision the registry needs to speak with a blend."""
        blend = self.get(blend_id)
        languages = {voice.id: voice.language_code for voice in self._builtin()}
        first = blend.parts[0].voice_id
        mix = tuple((part.voice_id.partition(":")[2], part.weight) for part in blend.parts)
        spec = VoiceSpec(key=first.partition(":")[2], language_code=languages.get(first, "en-us"), blend=mix)
        revision = "blend-" + hashlib.sha256(json.dumps(mix).encode()).hexdigest()[:12]
        return BLEND_ENGINE, spec, revision

    def as_voices(self, available: Callable[[], bool]) -> list[VoiceInfo]:
        names = {voice.id: voice.name for voice in self._builtin()}
        ready = available()
        voices = []
        for blend in self.list_all():
            first = blend.parts[0].voice_id
            base = next((voice for voice in self._builtin() if voice.id == first), None)
            mix = " and ".join(f"{names.get(p.voice_id, p.voice_id)} ({p.weight:.0%})" for p in blend.parts)
            voices.append(
                VoiceInfo(
                    id=blend.voice_id,
                    engine_id=BLEND_ENGINE,
                    name=blend.name,
                    language=base.language if base else "English (US)",
                    language_code=base.language_code if base else "en-us",
                    gender="unspecified",
                    category="custom",
                    description=f"A blend of {mix}.",
                    available=ready and base is not None,
                    credit=BLEND.short,
                    attribution=BLEND.full,
                )
            )
        return voices


def _out(row: sqlite3.Row) -> BlendOut:
    return BlendOut(
        id=row["id"],
        voice_id=f"{PREFIX}:{row['id']}",
        name=row["name"],
        parts=[BlendPart.model_validate(part) for part in json.loads(row["parts_json"])],
        created_at=row["created_at"],
    )
