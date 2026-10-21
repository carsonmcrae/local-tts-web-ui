# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: How chosen sentences of a document are read: another voice (a character), an effect, a sound.

Scope: Per-sentence styling — a voice that replaces the reading voice, a sound effect
(``ltts.effects``) and, for cloned voices, a sound made before the sentence (a laugh, a sigh) — plus a
document-wide voice for quoted dialogue, stored in ``segment_styles`` and ``document_cast``. Also
plans a sentence for synthesis: which voice reads it (the sentence's own, then the dialogue voice for
a sentence with quotes, then the reader's), its effect and its sound. A revision string changes with
every edit so players know to fetch new audio.
Does NOT belong: Synthesis or effects themselves, or HTTP parsing (``styling_router.py``).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Literal

from pydantic import Field

from ltts.common import ApiModel
from ltts.db import Database
from ltts.effects import Effect
from ltts.engines.cloned_speech import is_dialogue

Sound = Literal["laugh", "chuckle", "sigh", "gasp", "cough", "clear throat", "sniff", "groan", "shush"]
VOICE_ID_PATTERN = r"^[a-z]+:[A-Za-z0-9_\-]+$"
MAX_STYLED = 5_000  # sentences changed in one request


class SegmentStyleOut(ApiModel):
    index: int
    voice_id: str | None = None
    effect: Effect | None = None
    sound: Sound | None = None


class DocumentStylesOut(ApiModel):
    segments: list[SegmentStyleOut]
    dialogue_voice_id: str | None
    revision: str  # changes whenever any styling of the document changes


class SegmentStyleUpdate(ApiModel):
    """Set the given fields on the given sentences; a field sent as null clears it, one left out is kept."""

    indexes: list[int] = Field(min_length=1, max_length=MAX_STYLED)
    voice_id: str | None = Field(default=None, max_length=120, pattern=VOICE_ID_PATTERN)
    effect: Effect | None = None
    sound: Sound | None = None


class CastUpdate(ApiModel):
    dialogue_voice_id: str | None = Field(default=None, max_length=120, pattern=VOICE_ID_PATTERN)


@dataclass(frozen=True, slots=True)
class SegmentPlan:
    voice_id: str
    effect: Effect | None = None
    sound: Sound | None = None


class StylingStore:
    def __init__(self, db: Database):
        self._db = db

    def get(self, document_id: str) -> DocumentStylesOut:
        with self._db.connect() as conn:
            rows = conn.execute(
                "SELECT segment_idx, voice_id, effect, sound FROM segment_styles WHERE document_id = ?"
                " ORDER BY segment_idx",
                (document_id,),
            ).fetchall()
            cast = conn.execute(
                "SELECT dialogue_voice_id FROM document_cast WHERE document_id = ?", (document_id,)
            ).fetchone()
        segments = [
            SegmentStyleOut(index=r["segment_idx"], voice_id=r["voice_id"], effect=r["effect"], sound=r["sound"])
            for r in rows
        ]
        dialogue = cast["dialogue_voice_id"] if cast else None
        digest = hashlib.sha256(repr(([s.model_dump() for s in segments], dialogue)).encode()).hexdigest()
        return DocumentStylesOut(segments=segments, dialogue_voice_id=dialogue, revision=digest[:16])

    def update(self, document_id: str, update: SegmentStyleUpdate) -> DocumentStylesOut:
        fields = [name for name in ("voice_id", "effect", "sound") if name in update.model_fields_set]
        with self._db.connect() as conn:
            for index in sorted(set(update.indexes)):
                conn.execute(
                    "INSERT OR IGNORE INTO segment_styles (document_id, segment_idx) VALUES (?, ?)",
                    (document_id, index),
                )
                for name in fields:  # names from the fixed list above, never from the request
                    conn.execute(
                        f"UPDATE segment_styles SET {name} = ? WHERE document_id = ? AND segment_idx = ?",  # noqa: S608
                        (getattr(update, name), document_id, index),
                    )
            conn.execute(
                "DELETE FROM segment_styles WHERE document_id = ?"
                " AND voice_id IS NULL AND effect IS NULL AND sound IS NULL",
                (document_id,),
            )
        return self.get(document_id)

    def set_cast(self, document_id: str, update: CastUpdate) -> DocumentStylesOut:
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO document_cast (document_id, dialogue_voice_id) VALUES (?, ?) "
                "ON CONFLICT(document_id) DO UPDATE SET dialogue_voice_id = excluded.dialogue_voice_id",
                (document_id, update.dialogue_voice_id),
            )
        return self.get(document_id)

    def plan(self, document_id: str, index: int, text: str, voice_id: str) -> SegmentPlan:
        """Who reads a sentence and how: its own voice, then the dialogue voice for quoted speech, then ``voice_id``."""
        with self._db.connect() as conn:
            row = conn.execute(
                "SELECT voice_id, effect, sound FROM segment_styles WHERE document_id = ? AND segment_idx = ?",
                (document_id, index),
            ).fetchone()
            cast = conn.execute(
                "SELECT dialogue_voice_id FROM document_cast WHERE document_id = ?", (document_id,)
            ).fetchone()
        dialogue = cast["dialogue_voice_id"] if cast and is_dialogue(text) else None
        if row is None:
            return SegmentPlan(dialogue or voice_id)
        return SegmentPlan(row["voice_id"] or dialogue or voice_id, row["effect"], row["sound"])
