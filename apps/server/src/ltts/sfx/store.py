# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: A document's sound effects: the arrangement its reader made and the suggestions analysis found.

Scope: Rows in ``sound_effects`` (deleted with the document): a sentence and a position inside it,
an offset, for ambience the sentence it lasts to, the event, the chosen sound and volume, who placed
it (``suggested``, ``manual``, or ``preset`` for a reading experience), its status (``suggested``,
``accepted``, ``dismissed``), whether it is enabled, the detector's confidence (or the experience's
identity) and a short hash of the sentence's text (a listing marks an effect stale when it changed).
Adding and changing check the sound and sentences exist, an ambience runs forward a bounded number
of sentences, and the document's count. Analysing a section runs the detector, the gate and the
intensity's restraint, replaces that section's unreviewed suggestions and records the analysis, and
never touches accepted, dismissed, manual or preset effects. Removing a suggestion keeps it dismissed.
An experience places its rows in one go, replacing its own and skipping occupied sentences.
Does NOT belong: Detection (``detect.py``), the gate (``proposals.py``), sounds (``catalogue.py``), HTTP.
"""

from __future__ import annotations

import hashlib
import sqlite3
from collections.abc import Sequence
from typing import Annotated, Any, Literal

from pydantic import ConfigDict, Field

from ltts.common import ApiModel, new_id, utc_now
from ltts.db import Database
from ltts.errors import AppError, ConflictError, NotFoundError
from ltts.sfx import catalogue
from ltts.sfx.detect import DETECTOR_VERSION, Sentence, detect
from ltts.sfx.events import EVENT_IDS
from ltts.sfx.proposals import LIMITS, Intensity, Placed, Proposal, choose, validate

MAX_EFFECTS = 2_000  # per document
MAX_ANALYSED = 5_000  # sentences per analysis request
MAX_SPAN = 60  # sentences an ambience placed by hand may last
MAX_REVIEW = 300  # effects accepted or dismissed in one request
MIN_OFFSET_MS, MAX_OFFSET_MS = -1_500, 5_000
MAX_VOLUME = 150
Origin = Literal["suggested", "manual", "preset"]
Status = Literal["suggested", "accepted", "dismissed"]
Id = Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")]
_COLUMNS = (
    "id, document_id, segment_idx, position, offset_ms, until_idx, event, sound_id, volume, origin, status, enabled, "
    "confidence, text_hash, detector, created_at, updated_at"
)
_SELECT = """
    SELECT e.*, s.section_idx, s.text FROM sound_effects e
    JOIN segments s ON s.document_id = e.document_id AND s.idx = e.segment_idx
    WHERE e.document_id = ?
"""
_INSERT = f"INSERT INTO sound_effects ({_COLUMNS}) VALUES ({', '.join('?' for _ in _COLUMNS.split(','))})"  # noqa: S608
# Changeable fields and their columns: the SET clause is built from this list only, never from input keys.
_UPDATABLE = {
    "sound_id": "sound_id",
    "position": "position",
    "offset_ms": "offset_ms",
    "until_segment": "until_idx",
    "volume": "volume",
    "enabled": "enabled",
}


class EffectIn(ApiModel):
    model_config = ConfigDict(extra="forbid")

    segment_index: int = Field(ge=0)
    sound_id: str = Field(pattern=catalogue.SOUND_ID)
    position: float = Field(default=0.0, ge=0, le=1)  # 0: as the sentence starts, 1: as it ends
    offset_ms: int = Field(default=0, ge=MIN_OFFSET_MS, le=MAX_OFFSET_MS)
    until_segment: int | None = Field(default=None, ge=0)  # ambience: the last sentence it plays under
    volume: int | None = Field(default=None, ge=0, le=MAX_VOLUME)  # % of the effects volume; None: the sound's own


class EffectUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    sound_id: str | None = Field(default=None, pattern=catalogue.SOUND_ID)
    position: float | None = Field(default=None, ge=0, le=1)
    offset_ms: int | None = Field(default=None, ge=MIN_OFFSET_MS, le=MAX_OFFSET_MS)
    until_segment: int | None = Field(default=None, ge=0)
    volume: int | None = Field(default=None, ge=0, le=MAX_VOLUME)
    enabled: bool | None = None


class PresetEffectIn(ApiModel):
    """One effect a reading experience places; its anchor is already resolved to a sentence of this document."""

    model_config = ConfigDict(extra="forbid")

    segment_index: int = Field(ge=0)
    event: str = Field(max_length=40)
    sound_id: str | None = Field(default=None, pattern=catalogue.SOUND_ID)  # None: the event's default sound
    position: float = Field(default=0.0, ge=0, le=1)
    offset_ms: int = Field(default=0, ge=MIN_OFFSET_MS, le=MAX_OFFSET_MS)
    until_segment: int | None = Field(default=None, ge=0)
    volume: int = Field(ge=0, le=MAX_VOLUME)  # % of the effects volume, mapped from the preset's level already
    loop: bool = False


class PresetPlacement(ApiModel):
    placed: list[str]  # the new rows' ids, in the order given
    skipped: dict[str, int]  # rows not placed, by reason: occupied, experimental, invalid, limit


class EffectOut(ApiModel):
    id: str
    segment_index: int
    section_index: int
    text: str  # the sentence now
    position: float
    offset_ms: int
    until_segment: int | None
    event: str
    sound_id: str
    volume: int
    origin: Origin
    status: Status
    enabled: bool
    confidence: float | None
    stale: bool  # the sentence's text changed since the effect was placed: shown, not played
    created_at: str
    updated_at: str


class ReviewIn(ApiModel):
    model_config = ConfigDict(extra="forbid")

    accept: list[Id] = Field(default_factory=list, max_length=MAX_REVIEW)
    dismiss: list[Id] = Field(default_factory=list, max_length=MAX_REVIEW)


class AnalysisIn(ApiModel):
    model_config = ConfigDict(extra="forbid")

    section_index: int = Field(ge=0)
    intensity: Intensity = "balanced"


class SectionAnalysis(ApiModel):
    section_index: int
    intensity: str
    detector: str
    sentences: int
    suggested: int
    analysed_at: str


class DocumentEffectsOut(ApiModel):
    effects: list[EffectOut]
    analyses: list[SectionAnalysis]


class AnalysisOut(DocumentEffectsOut):
    section_index: int
    sentences: int  # analysed
    suggested: int  # new suggestions
    truncated: bool  # the section had more sentences than one analysis covers


def text_hash(text: str) -> str:
    """The first 16 hex digits of SHA-256 over the sentence with its whitespace collapsed.

    The same hash identifies a sentence in the literary library's annotation files, so the two
    can be compared; whitespace is collapsed so a reflowed line still matches.
    """
    return hashlib.sha256(" ".join(text.split()).encode("utf-8")).hexdigest()[:16]


def _effect(row: sqlite3.Row) -> EffectOut:
    return EffectOut(
        id=row["id"],
        segment_index=row["segment_idx"],
        section_index=row["section_idx"],
        text=row["text"],
        position=row["position"],
        offset_ms=row["offset_ms"],
        until_segment=row["until_idx"],
        event=row["event"],
        sound_id=row["sound_id"],
        volume=row["volume"],
        origin=row["origin"],
        status=row["status"],
        enabled=bool(row["enabled"]),
        confidence=row["confidence"],
        stale=row["text_hash"] != text_hash(row["text"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _ensure_document(conn: sqlite3.Connection, document_id: str) -> None:
    if conn.execute("SELECT 1 FROM documents WHERE id = ?", (document_id,)).fetchone() is None:
        raise NotFoundError("That document no longer exists.", code="document_not_found")


def _sentence(conn: sqlite3.Connection, document_id: str, index: int) -> sqlite3.Row:
    row: sqlite3.Row | None = conn.execute(
        "SELECT section_idx, text FROM segments WHERE document_id = ? AND idx = ?", (document_id, index)
    ).fetchone()
    if row is None:
        raise NotFoundError("That sentence isn't in this document.", code="segment_not_found")
    return row


def _require_end(sound: catalogue.SoundOut | None, until: int | None) -> None:
    """An ambience (a looping sound) always has the sentence it lasts to; without one it would never stop."""
    if sound is not None and sound.loop and until is None:
        raise AppError("An ambience needs the sentence it lasts to.", code="effect_span")


def _check_until(conn: sqlite3.Connection, document_id: str, index: int, until: int | None) -> None:
    if until is None:
        return
    if not index <= until <= index + MAX_SPAN:
        raise AppError(f"An effect can last up to {MAX_SPAN} sentences after its own.", code="effect_span")
    _sentence(conn, document_id, until)


def _sound(sound_id: str) -> catalogue.SoundOut:
    found = catalogue.sound(sound_id)
    if found is None:
        raise NotFoundError("That sound isn't in the library.", code="sound_not_found")
    return found


def _preset_sound(row: PresetEffectIn) -> catalogue.SoundOut | None:
    """The sound a preset row plays: its event must be known, and the sound must serve it and loop as the row says."""
    if row.event not in EVENT_IDS:
        return None
    sound = catalogue.sound(row.sound_id) if row.sound_id else catalogue.default_sound(row.event)
    if sound is None or row.event not in sound.events or sound.loop != row.loop:
        return None
    return sound


def _preset_place(
    conn: sqlite3.Connection, document_id: str, row: PresetEffectIn, sound: catalogue.SoundOut | None
) -> tuple[sqlite3.Row | None, int | None]:
    """The row's sentence and the sentence its ambience lasts to; (None, None) for a row the store would refuse."""
    if sound is None or (sound.loop and row.until_segment is None):  # a loop needs an end, or it never stops
        return None, None
    try:
        sentence = _sentence(conn, document_id, row.segment_index)
        until = row.until_segment if sound.loop else None
        _check_until(conn, document_id, row.segment_index, until)
    except AppError:
        return None, None
    return sentence, until


class SoundEffectStore:
    def __init__(self, db: Database):
        self._db = db

    def list_for(self, document_id: str) -> DocumentEffectsOut:
        with self._db.connect() as conn:
            _ensure_document(conn, document_id)
            return self._list(conn, document_id)

    def get(self, document_id: str, effect_id: str) -> EffectOut:
        with self._db.connect() as conn:
            return _effect(self._row(conn, document_id, effect_id))

    def add(self, document_id: str, effect: EffectIn) -> EffectOut:
        sound = _sound(effect.sound_id)
        _require_end(sound, effect.until_segment)
        with self._db.connect() as conn:
            _ensure_document(conn, document_id)
            sentence = _sentence(conn, document_id, effect.segment_index)
            _check_until(conn, document_id, effect.segment_index, effect.until_segment)
            if self._count(conn, document_id) >= MAX_EFFECTS:
                raise ConflictError("This document has the maximum number of sound effects.", code="effect_limit")
            effect_id = new_id()
            now = utc_now()
            volume = round(sound.gain * 100) if effect.volume is None else effect.volume
            until = effect.until_segment if sound.loop else None
            conn.execute(_INSERT, (
                effect_id, document_id, effect.segment_index, effect.position, effect.offset_ms, until, sound.events[0],
                sound.id, volume, "manual", "accepted", 1, None, text_hash(sentence["text"]), None, now, now,
            ))  # fmt: skip
        return self.get(document_id, effect_id)

    def update(self, document_id: str, effect_id: str, change: EffectUpdate) -> EffectOut:
        fields: dict[str, Any] = change.model_dump(exclude_unset=True, by_alias=False)
        with self._db.connect() as conn:
            row = self._row(conn, document_id, effect_id)
            sound = _sound(fields["sound_id"]) if "sound_id" in fields else catalogue.sound(row["sound_id"])
            if "sound_id" in fields and sound is not None:
                if row["origin"] != "suggested":  # placed by hand or by an experience: the event follows the sound
                    fields["event"] = sound.events[0]
                if not sound.loop:
                    fields["until_segment"] = None
            if "sound_id" in fields or "until_segment" in fields:
                # Only a change of sound or end is checked, so an older ambience saved without an end can still
                # have its volume or position adjusted.
                _require_end(sound, fields.get("until_segment", row["until_idx"]))
            if "until_segment" in fields:
                _check_until(conn, document_id, row["segment_idx"], fields["until_segment"])
            if row["origin"] == "preset":  # the reader's change makes the row theirs; the experience leaves it alone
                fields["origin"] = "manual"
                fields["detector"] = None
            columns = {**_UPDATABLE, "event": "event", "origin": "origin", "detector": "detector"}
            assignments = [f"{columns[name]} = ?" for name in fields]
            values = [int(value) if isinstance(value, bool) else value for value in fields.values()]
            status = "accepted" if row["status"] == "suggested" else row["status"]
            conn.execute(
                f"UPDATE sound_effects SET {', '.join([*assignments, 'status = ?', 'updated_at = ?'])} WHERE id = ?",  # noqa: S608
                (*values, status, utc_now(), effect_id),
            )
        return self.get(document_id, effect_id)

    def delete(self, document_id: str, effect_id: str) -> None:
        """Remove an effect; a suggestion is kept as dismissed instead, so it is never suggested again."""
        with self._db.connect() as conn:
            row = self._row(conn, document_id, effect_id)
            if row["origin"] == "suggested":
                conn.execute(
                    "UPDATE sound_effects SET status = 'dismissed', updated_at = ? WHERE id = ?", (utc_now(), effect_id)
                )
            else:
                conn.execute("DELETE FROM sound_effects WHERE id = ?", (effect_id,))

    def apply_preset(
        self, document_id: str, preset_id: str, version: int, rows: Sequence[PresetEffectIn]
    ) -> PresetPlacement:
        """Replace the document's preset rows with ``rows`` in one go.

        The earlier preset rows go first, so two versions never mix. The reader's rows stay: manual ones,
        accepted and dismissed suggestions, and preset rows they edited, which are manual by then. A sentence
        that already carries an accepted row keeps it, and the preset's row for it is skipped.
        """
        placed: list[str] = []
        skipped = {"occupied": 0, "experimental": 0, "invalid": 0, "limit": 0}
        with self._db.connect() as conn:
            _ensure_document(conn, document_id)
            conn.execute("DELETE FROM sound_effects WHERE document_id = ? AND origin = 'preset'", (document_id,))
            taken = {  # accepted rows only: an unreviewed suggestion on the sentence does not block the row
                int(r["segment_idx"])
                for r in conn.execute(
                    "SELECT segment_idx FROM sound_effects WHERE document_id = ? AND status = 'accepted'",
                    (document_id,),
                )
            }
            room = MAX_EFFECTS - self._count(conn, document_id)
            now = utc_now()
            for row in rows:
                sound = _preset_sound(row)
                sentence, until = _preset_place(conn, document_id, row, sound)
                if sound is None or sentence is None:
                    skipped["invalid"] += 1
                elif sound.experimental:  # left to the reader's own hand, never placed by an experience
                    skipped["experimental"] += 1
                elif row.segment_index in taken:
                    skipped["occupied"] += 1
                elif len(placed) >= room:
                    skipped["limit"] += 1
                else:
                    effect_id = new_id()
                    conn.execute(_INSERT, (
                        effect_id, document_id, row.segment_index, row.position, row.offset_ms, until, row.event,
                        sound.id, row.volume, "preset", "accepted", 1, None, text_hash(sentence["text"]),
                        f"preset:{preset_id}@{version}", now, now,
                    ))  # fmt: skip
                    taken.add(row.segment_index)
                    placed.append(effect_id)
        return PresetPlacement(placed=placed, skipped=skipped)

    def remove_preset(self, document_id: str) -> int:
        """Delete the rows a reading experience placed and nothing else; a row the reader edited is manual by then."""
        with self._db.connect() as conn:
            deleted: int = conn.execute(
                "DELETE FROM sound_effects WHERE document_id = ? AND origin = 'preset'", (document_id,)
            ).rowcount
        return deleted

    def review(self, document_id: str, review: ReviewIn) -> DocumentEffectsOut:
        now = utc_now()
        with self._db.connect() as conn:
            _ensure_document(conn, document_id)
            for status, ids in (("accepted", review.accept), ("dismissed", review.dismiss)):
                conn.executemany(
                    "UPDATE sound_effects SET status = ?, updated_at = ? WHERE document_id = ? AND id = ?",
                    [(status, now, document_id, effect_id) for effect_id in ids],
                )
            return self._list(conn, document_id)

    def analyse(self, document_id: str, request: AnalysisIn) -> AnalysisOut:
        limits = LIMITS[request.intensity]
        with self._db.connect() as conn:
            _ensure_document(conn, document_id)
            rows = conn.execute(
                "SELECT idx, paragraph_idx, kind, text FROM segments WHERE document_id = ? AND section_idx = ? "
                "ORDER BY idx LIMIT ?",
                (document_id, request.section_index, MAX_ANALYSED + 1),
            ).fetchall()
            if not rows:
                raise NotFoundError("That section does not exist.", code="section_not_found")
            truncated = len(rows) > MAX_ANALYSED
            rows = rows[:MAX_ANALYSED]
            first, last = rows[0]["idx"], rows[-1]["idx"]
            sentences = [Sentence(r["idx"], r["paragraph_idx"], r["kind"] == "heading", r["text"]) for r in rows]
            found = [
                p
                for p in validate(detect(sentences, limits.loop_sentences), first, last)
                if catalogue.suggestable(p.event)
            ]
            existing = [
                Placed(r["segment_idx"], r["event"], r["until_idx"], r["status"] == "dismissed")
                for r in conn.execute(
                    "SELECT segment_idx, event, until_idx, status FROM sound_effects WHERE document_id = ? "
                    "AND segment_idx BETWEEN ? AND ? AND NOT (origin = 'suggested' AND status = 'suggested')",
                    (document_id, first, last),
                )
            ]
            chosen = choose(found, limits, existing, len(rows))
            conn.execute(
                "DELETE FROM sound_effects WHERE document_id = ? AND origin = 'suggested' AND status = 'suggested' "
                "AND segment_idx BETWEEN ? AND ?",
                (document_id, first, last),
            )
            chosen = chosen[: max(MAX_EFFECTS - self._count(conn, document_id), 0)]
            self._suggest(conn, document_id, chosen, {r["idx"]: r["text"] for r in rows})
            conn.execute(
                "INSERT OR REPLACE INTO sound_analyses (document_id, section_idx, detector, intensity, sentences, "
                "suggested, analysed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    document_id,
                    request.section_index,
                    DETECTOR_VERSION,
                    request.intensity,
                    len(rows),
                    len(chosen),
                    utc_now(),
                ),
            )
            listing = self._list(conn, document_id)
        return AnalysisOut(
            effects=listing.effects,
            analyses=listing.analyses,
            section_index=request.section_index,
            sentences=len(rows),
            suggested=len(chosen),
            truncated=truncated,
        )

    @staticmethod
    def _suggest(conn: sqlite3.Connection, document_id: str, chosen: list[Proposal], texts: dict[int, str]) -> None:
        now = utc_now()
        for proposal in chosen:
            sound = catalogue.default_sound(proposal.event)
            conn.execute(_INSERT, (
                new_id(), document_id, proposal.index, proposal.fraction, 0, proposal.until, proposal.event, sound.id,
                round(sound.gain * 100), "suggested", "suggested", 1, proposal.confidence,
                text_hash(texts[proposal.index]), DETECTOR_VERSION, now, now,
            ))  # fmt: skip

    @staticmethod
    def _count(conn: sqlite3.Connection, document_id: str) -> int:
        count: int = conn.execute(
            "SELECT COUNT(*) FROM sound_effects WHERE document_id = ?", (document_id,)
        ).fetchone()[0]
        return count

    @staticmethod
    def _row(conn: sqlite3.Connection, document_id: str, effect_id: str) -> sqlite3.Row:
        row: sqlite3.Row | None = conn.execute(_SELECT + " AND e.id = ?", (document_id, effect_id)).fetchone()
        if row is None:
            raise NotFoundError("That sound effect no longer exists.", code="effect_not_found")
        return row

    @staticmethod
    def _list(conn: sqlite3.Connection, document_id: str) -> DocumentEffectsOut:
        rows = conn.execute(_SELECT + " ORDER BY e.segment_idx, e.position, e.created_at", (document_id,)).fetchall()
        analyses = conn.execute(
            "SELECT section_idx, detector, intensity, sentences, suggested, analysed_at FROM sound_analyses "
            "WHERE document_id = ? ORDER BY section_idx",
            (document_id,),
        ).fetchall()
        return DocumentEffectsOut(
            effects=[_effect(row) for row in rows],
            analyses=[
                SectionAnalysis(
                    section_index=a["section_idx"],
                    intensity=a["intensity"],
                    detector=a["detector"],
                    sentences=a["sentences"],
                    suggested=a["suggested"],
                    analysed_at=a["analysed_at"],
                )
                for a in analyses
            ],
        )
