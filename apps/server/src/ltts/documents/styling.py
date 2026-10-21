# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: How each sentence of a document is read: the reader's choices, its characters and its context.

Scope: Sentence annotations are stored in ``segment_annotations``, one row per sentence and kind:
- ``voice``: another voice;
- ``effect``: a sound effect;
- ``sound``: a sound before the sentence;
- ``style``: a speaking style for studio voices;
- ``take``: which generated take;
- ``pause``: a pause after the sentence, in milliseconds;
- ``speak_as``: per-sentence pronunciations from speech marks.

Kinds are validated by a registry, so a new kind needs no new table. Setting a kind replaces it and
clearing it removes it; nothing is ever written into the document's text. The document's cast
(``document_cast``) is a dialogue voice and whether quoted speech inside a narrated sentence is voiced
separately.

Plans a sentence for synthesis. The voice comes from, in order: the sentence's own voice, the voice
of the character its dialogue tag names (``casting.py``), the dialogue voice for quoted speech, then
the reader's. The speaking style is the sentence's own, or what ``delivery.py`` reads from the
context. A revision string changes with every edit, so players know to fetch new audio.
Does NOT belong: Synthesis, effects, the analysis itself (``delivery.py``) or HTTP (``styling_router.py``).
"""

from __future__ import annotations

import hashlib
import json
import threading
from collections import OrderedDict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import Field

from ltts.common import ApiModel
from ltts.db import Database
from ltts.documents.delivery import Line, Sentence, analyse
from ltts.effects import EFFECTS, Effect

Sound = Literal["laugh", "chuckle", "sigh", "gasp", "cough", "clear throat", "sniff", "groan", "shush"]
Style = Literal["narration", "question", "lively", "dialogue", "calm"]
SOUNDS: tuple[str, ...] = ("laugh", "chuckle", "sigh", "gasp", "cough", "clear throat", "sniff", "groan", "shush")
STYLES: tuple[str, ...] = ("narration", "question", "lively", "dialogue", "calm")
VOICE_ID_PATTERN = r"^[a-z]+:[A-Za-z0-9_\-]+$"
MAX_STYLED = 5_000  # sentences changed in one request
MAX_TAKE = 999
MAX_PAUSE_MS = 10_000
_ANALYSED = 8  # documents whose analysis is kept in memory


def _int_in(low: int, high: int) -> Callable[[str], bool]:
    return lambda value: value.isdigit() and low <= int(value) <= high


# Each kind and how its stored value is checked; anything else is refused before it reaches the database.
KINDS: dict[str, Callable[[str], bool]] = {
    "voice": lambda value: len(value) <= 120 and value.count(":") == 1,
    "effect": lambda value: value in EFFECTS,
    "sound": lambda value: value in SOUNDS,
    "style": lambda value: value in STYLES,
    "take": _int_in(1, MAX_TAKE),
    "pause": _int_in(0, MAX_PAUSE_MS),
    "speak_as": lambda value: len(value) <= 4_000,
}
_FIELDS = {"voice_id": "voice", "effect": "effect", "sound": "sound", "style": "style", "take": "take",
           "pause_ms": "pause"}  # fmt: skip


class SegmentStyleOut(ApiModel):
    index: int
    voice_id: str | None = None
    effect: Effect | None = None
    sound: Sound | None = None
    style: Style | None = None
    take: int | None = None
    pause_ms: int | None = None


class DocumentStylesOut(ApiModel):
    segments: list[SegmentStyleOut]
    dialogue_voice_id: str | None
    split_dialogue: bool = True  # quoted speech inside a narrated sentence gets the dialogue voice
    revision: str  # changes whenever any styling of the document changes


class SegmentStyleUpdate(ApiModel):
    """Set the given fields on the given sentences; a field sent as null clears it, one left out is kept."""

    indexes: list[int] = Field(min_length=1, max_length=MAX_STYLED)
    voice_id: str | None = Field(default=None, max_length=120, pattern=VOICE_ID_PATTERN)
    effect: Effect | None = None
    sound: Sound | None = None
    style: Style | None = None
    take: int | None = Field(default=None, ge=1, le=MAX_TAKE)
    pause_ms: int | None = Field(default=None, ge=0, le=MAX_PAUSE_MS)


class CastUpdate(ApiModel):
    dialogue_voice_id: str | None = Field(default=None, max_length=120, pattern=VOICE_ID_PATTERN)
    split_dialogue: bool | None = None


@dataclass(frozen=True, slots=True)
class PartPlan:
    """A piece of a sentence read by its own voice (the quoted speech inside narration)."""

    text: str
    voice_id: str


@dataclass(frozen=True, slots=True)
class SegmentPlan:
    voice_id: str
    effect: Effect | None = None
    sound: Sound | None = None
    style: str | None = None  # the speaking style a studio voice reads it in
    steady: bool = False  # headings, lists and announcements read evenly
    take: int = 0  # 0 is the sentence's first take
    pause_ms: int | None = None  # instead of the usual pause after the sentence
    replacements: tuple[tuple[str, str], ...] = ()  # (written, spoken) for this sentence only
    parts: tuple[PartPlan, ...] = ()  # narration and quoted speech voiced separately


class StylingStore:
    def __init__(self, db: Database, sentences: Callable[[str], Sequence[Sentence]] | None = None):
        self._db = db
        self._sentences = sentences or (lambda _document_id: ())
        self._analysed: OrderedDict[str, dict[int, Line]] = OrderedDict()
        self._lock = threading.Lock()

    # -- reading ---------------------------------------------------------------
    def _rows(self, document_id: str) -> dict[int, dict[str, str]]:
        with self._db.connect() as conn:
            rows = conn.execute(
                "SELECT segment_idx, kind, value FROM segment_annotations WHERE document_id = ? ORDER BY segment_idx",
                (document_id,),
            ).fetchall()
        found: dict[int, dict[str, str]] = {}
        for row in rows:
            found.setdefault(row["segment_idx"], {})[row["kind"]] = row["value"]
        return found

    def _cast(self, document_id: str) -> tuple[str | None, bool]:
        with self._db.connect() as conn:
            row = conn.execute(
                "SELECT dialogue_voice_id, split_dialogue FROM document_cast WHERE document_id = ?", (document_id,)
            ).fetchone()
        return (row["dialogue_voice_id"], bool(row["split_dialogue"])) if row else (None, True)

    def get(self, document_id: str) -> DocumentStylesOut:
        segments = []
        for index, kinds in self._rows(document_id).items():
            values: dict[str, Any] = {field: kinds.get(kind) for field, kind in _FIELDS.items()}
            values["take"] = int(values["take"]) if values["take"] else None
            values["pause_ms"] = int(values["pause_ms"]) if values["pause_ms"] is not None else None
            if any(value is not None for value in values.values()):
                segments.append(SegmentStyleOut(index=index, **values))
        dialogue, split = self._cast(document_id)
        digest = hashlib.sha256(repr(([s.model_dump() for s in segments], dialogue, split)).encode()).hexdigest()
        return DocumentStylesOut(
            segments=segments, dialogue_voice_id=dialogue, split_dialogue=split, revision=digest[:16]
        )

    # -- changing --------------------------------------------------------------
    def update(self, document_id: str, update: SegmentStyleUpdate) -> DocumentStylesOut:
        changes = {kind: getattr(update, field) for field, kind in _FIELDS.items() if field in update.model_fields_set}
        with self._db.connect() as conn:
            for index in sorted(set(update.indexes)):
                for kind, value in changes.items():
                    self._write(conn, document_id, index, kind, None if value is None else str(value))
        return self.get(document_id)

    def annotate(self, document_id: str, index: int, kind: str, value: str | None) -> None:
        """Set (or with None clear) one kind on one sentence, such as speech marks found at import."""
        with self._db.connect() as conn:
            self._write(conn, document_id, index, kind, value)

    @staticmethod
    def _write(conn: Any, document_id: str, index: int, kind: str, value: str | None) -> None:
        if value is None:
            conn.execute(
                "DELETE FROM segment_annotations WHERE document_id = ? AND segment_idx = ? AND kind = ?",
                (document_id, index, kind),
            )
            return
        if kind not in KINDS or not KINDS[kind](value):
            raise ValueError(f"invalid {kind} annotation")
        conn.execute(
            "INSERT INTO segment_annotations (document_id, segment_idx, kind, value) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(document_id, segment_idx, kind) DO UPDATE SET value = excluded.value",
            (document_id, index, kind, value),
        )

    def set_cast(self, document_id: str, update: CastUpdate) -> DocumentStylesOut:
        current, split = self._cast(document_id)
        dialogue = update.dialogue_voice_id if "dialogue_voice_id" in update.model_fields_set else current
        if update.split_dialogue is not None:
            split = update.split_dialogue
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO document_cast (document_id, dialogue_voice_id, split_dialogue) VALUES (?, ?, ?) "
                "ON CONFLICT(document_id) DO UPDATE SET dialogue_voice_id = excluded.dialogue_voice_id, "
                "split_dialogue = excluded.split_dialogue",
                (document_id, dialogue, int(split)),
            )
        return self.get(document_id)

    # -- planning --------------------------------------------------------------
    def lines(self, document_id: str) -> dict[int, Line]:
        """The document's delivery analysis, kept for the last few documents read."""
        with self._lock:
            if document_id in self._analysed:
                self._analysed.move_to_end(document_id)
                return self._analysed[document_id]
        analysed = analyse(self._sentences(document_id))
        with self._lock:
            self._analysed[document_id] = analysed
            while len(self._analysed) > _ANALYSED:
                self._analysed.popitem(last=False)
        return analysed

    def plan(
        self,
        document_id: str,
        index: int,
        text: str,
        voice_id: str,
        characters: dict[str, str] | None = None,
    ) -> SegmentPlan:
        """Who reads a sentence and how (see the module docs for the order voices are chosen in)."""
        kinds = self._rows_for(document_id, index)
        line = self.lines(document_id).get(index) or analyse([Sentence(index, 0, "paragraph", text)])[index]
        dialogue_voice, split = self._cast(document_id)
        speaker_voice = (characters or {}).get(line.speaker or "") or dialogue_voice
        own = kinds.get("voice")
        parts: tuple[PartPlan, ...] = ()
        if own:
            voice = own
        elif line.parts and split and speaker_voice and speaker_voice != voice_id:
            voice = voice_id
            parts = tuple(PartPlan(part.text, speaker_voice if part.quoted else voice_id) for part in line.parts)
        elif line.dialogue and speaker_voice:
            voice = speaker_voice
        else:
            voice = voice_id
        replacements = tuple(tuple(pair) for pair in json.loads(kinds["speak_as"])) if "speak_as" in kinds else ()
        return SegmentPlan(
            voice_id=voice,
            effect=kinds.get("effect"),  # type: ignore[arg-type]  # validated on write
            sound=kinds.get("sound"),  # type: ignore[arg-type]
            style=kinds.get("style") or line.style,
            steady=line.steady,
            take=int(kinds.get("take") or 0),
            pause_ms=int(kinds["pause"]) if "pause" in kinds else None,
            replacements=replacements,
            parts=parts,
        )

    def _rows_for(self, document_id: str, index: int) -> dict[str, str]:
        with self._db.connect() as conn:
            rows = conn.execute(
                "SELECT kind, value FROM segment_annotations WHERE document_id = ? AND segment_idx = ?",
                (document_id, index),
            ).fetchall()
        return {row["kind"]: row["value"] for row in rows}
