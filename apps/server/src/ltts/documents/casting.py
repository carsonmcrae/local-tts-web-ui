# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: A document's characters and the voices that play them, with casts saved for reuse.

Scope: Lists the characters the delivery analysis found (names that dialogue tags give speakers,
with how many lines each speaks and a sample line), and the names the reader added by hand. Stores
which voice plays each character (``document_characters``), and saves a document's cast as a
reusable preset (``cast_presets``) that can be applied to another book in a series. Names are plain
text, matched exactly, and never executed or interpreted.
Does NOT belong: Finding speakers (``delivery.py``), planning sentences (``styling.py``) or HTTP.
"""

from __future__ import annotations

import json
from collections.abc import Callable

from pydantic import Field

from ltts.common import ApiModel, new_id, utc_now
from ltts.db import Database
from ltts.documents.delivery import Line, characters
from ltts.documents.styling import VOICE_ID_PATTERN
from ltts.errors import NotFoundError

NAME_LIMIT = 60
MAX_CHARACTERS = 200


class CharacterOut(ApiModel):
    name: str
    lines: int  # sentences the analysis gives this speaker (0 for a name added by hand)
    sample: str | None
    voice_id: str | None


class CharacterAssignment(ApiModel):
    name: str = Field(min_length=1, max_length=NAME_LIMIT)
    voice_id: str | None = Field(default=None, max_length=120, pattern=VOICE_ID_PATTERN)  # None removes the voice


class CastPresetIn(ApiModel):
    name: str = Field(min_length=1, max_length=80)


class CastPresetOut(ApiModel):
    id: str
    name: str
    characters: dict[str, str]
    created_at: str


class CastingStore:
    def __init__(self, db: Database, lines: Callable[[str], dict[int, Line]], texts: Callable[[str], dict[int, str]]):
        self._db = db
        self._lines = lines
        self._texts = texts

    def voices(self, document_id: str) -> dict[str, str]:
        """The voice playing each character, for sentence planning."""
        with self._db.connect() as conn:
            rows = conn.execute(
                "SELECT name, voice_id FROM document_characters WHERE document_id = ?", (document_id,)
            ).fetchall()
        return {row["name"]: row["voice_id"] for row in rows}

    def list_for(self, document_id: str) -> list[CharacterOut]:
        lines = self._lines(document_id)
        found = characters(lines)
        assigned = self.voices(document_id)
        texts = self._texts(document_id) if found else {}
        out = []
        for name, count in found[:MAX_CHARACTERS]:
            first = next((index for index, line in sorted(lines.items()) if line.speaker == name), None)
            sample = texts.get(first) if first is not None else None
            out.append(CharacterOut(name=name, lines=count, sample=sample, voice_id=assigned.get(name)))
        known = {character.name for character in out}
        out += [
            CharacterOut(name=name, lines=0, sample=None, voice_id=voice)
            for name, voice in sorted(assigned.items())
            if name not in known
        ]
        return out

    def assign(self, document_id: str, assignment: CharacterAssignment) -> list[CharacterOut]:
        name = " ".join(assignment.name.split())
        with self._db.connect() as conn:
            if assignment.voice_id is None:
                conn.execute("DELETE FROM document_characters WHERE document_id = ? AND name = ?", (document_id, name))
            else:
                conn.execute(
                    "INSERT INTO document_characters (document_id, name, voice_id) VALUES (?, ?, ?) "
                    "ON CONFLICT(document_id, name) DO UPDATE SET voice_id = excluded.voice_id",
                    (document_id, name, assignment.voice_id),
                )
        return self.list_for(document_id)

    # -- presets ---------------------------------------------------------------
    def presets(self) -> list[CastPresetOut]:
        with self._db.connect() as conn:
            rows = conn.execute("SELECT * FROM cast_presets ORDER BY created_at DESC").fetchall()
        return [
            CastPresetOut(
                id=r["id"], name=r["name"], characters=json.loads(r["mapping_json"]), created_at=r["created_at"]
            )
            for r in rows
        ]

    def save_preset(self, document_id: str, preset: CastPresetIn) -> CastPresetOut:
        mapping = self.voices(document_id)
        preset_id = new_id()
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO cast_presets (id, name, mapping_json, created_at) VALUES (?, ?, ?, ?)",
                (preset_id, preset.name.strip(), json.dumps(mapping), utc_now()),
            )
        return next(p for p in self.presets() if p.id == preset_id)

    def apply_preset(self, document_id: str, preset_id: str) -> list[CharacterOut]:
        preset = next((p for p in self.presets() if p.id == preset_id), None)
        if preset is None:
            raise NotFoundError("That saved cast no longer exists.", code="cast_preset_not_found")
        for name, voice in preset.characters.items():
            self.assign(document_id, CharacterAssignment(name=name, voice_id=voice))
        return self.list_for(document_id)

    def delete_preset(self, preset_id: str) -> None:
        with self._db.connect() as conn:
            conn.execute("DELETE FROM cast_presets WHERE id = ?", (preset_id,))
