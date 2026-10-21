# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: SQL access for documents, their segments and reading progress.

Scope: Insert a fully segmented document atomically (with the sentence annotations its import made,
such as the automatic cleanup); list/get/delete; fetch a section's or a single segment's text;
search a document's sentences; rename a section or move where it starts (keeping segments, counts
and the longer "end of section" pause in step); save and read progress. Rows are mapped to API
models here, with what is read aloud counted as they are read (``spoken.py``), the author from the
audiobook details, whether a cover exists, and how the document is organised (``shelf.py``).
Does NOT belong: Validation or extraction (``service.py``).
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable, Sequence
from dataclasses import asdict

from ltts.common import utc_now
from ltts.db import Database
from ltts.documents.schemas import (
    CHARS_PER_SECOND,
    DocumentDetail,
    DocumentSummary,
    ReadingProgress,
    SearchHit,
    SearchResults,
    SectionContent,
    SectionOut,
    SegmentOut,
)
from ltts.documents.shelf import ShelfFacets, facets
from ltts.documents.spoken import UNREAD_SQL, Unread, unread
from ltts.documents.structures import SectionInfo, Segment
from ltts.errors import ConflictError, NotFoundError

_DOCUMENT_GONE = "That document no longer exists."
# One complete query: every document (most recently read or added first), or only the one whose id
# is passed as :document_id.
_SUMMARY_SQL = """
SELECT d.*, p.segment_idx AS p_segment, p.voice_id AS p_voice, p.updated_at AS p_updated, dd.author AS author,
       bd.work_id AS bundled_work_id
FROM documents d LEFT JOIN progress p ON p.document_id = d.id
LEFT JOIN document_details dd ON dd.document_id = d.id
LEFT JOIN bundled_documents bd ON bd.document_id = d.id
WHERE (:document_id IS NULL OR d.id = :document_id)
ORDER BY COALESCE(p.updated_at, d.created_at) DESC
"""


def _summary(row: sqlite3.Row, unspoken: Unread, shelf: ShelfFacets, has_cover: bool) -> DocumentSummary:
    progress = None
    if row["p_segment"] is not None:
        last = unspoken.last_read(row["segment_count"])
        progress = ReadingProgress(
            segment_index=row["p_segment"],
            voice_id=row["p_voice"],
            updated_at=row["p_updated"],
            # Reaching the last sentence that is read counts as finished.
            percent=round(min(100 * row["p_segment"] / max(last, 1), 100), 1),
        )
    spoken_chars = max(row["char_count"] - unspoken.chars, 0)
    return DocumentSummary(
        id=row["id"],
        title=row["title"],
        filename=row["filename"],
        file_type=row["file_type"],
        size_bytes=row["size_bytes"],
        char_count=row["char_count"],
        word_count=row["word_count"],
        spoken_char_count=spoken_chars,
        spoken_word_count=max(row["word_count"] - unspoken.words, 0),
        page_count=row["page_count"],
        segment_count=row["segment_count"],
        section_count=len(json.loads(row["sections_json"])),
        estimated_seconds=round(spoken_chars / CHARS_PER_SECOND, 1),
        created_at=row["created_at"],
        last_opened_at=row["last_opened_at"],
        progress=progress,
        author=row["author"],
        has_cover=has_cover,
        shelf=shelf,
        bundled_work_id=row["bundled_work_id"],
    )


class DocumentRepository:
    def __init__(self, db: Database, covers: Callable[[], set[str]] | None = None):
        self._db = db
        self._covers = covers or set  # the documents that have a cover file

    def count(self) -> int:
        with self._db.connect() as conn:
            return int(conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0])

    def insert(
        self,
        meta: dict[str, object],
        sections: list[SectionInfo],
        segments: list[Segment],
        annotations: Sequence[tuple[int, str, str]] = (),
    ) -> None:
        """Store a document with its sentences and their ``(sentence, kind, value)`` annotations (checked already)."""
        with self._db.connect() as conn:
            conn.execute(
                """INSERT INTO documents (id, title, filename, file_type, size_bytes, char_count, word_count,
                   page_count, segment_count, sections_json, warnings_json, source_sha256, created_at)
                   VALUES (:id, :title, :filename, :file_type, :size_bytes, :char_count, :word_count,
                   :page_count, :segment_count, :sections_json, :warnings_json, :source_sha256, :created_at)""",
                {**meta, "sections_json": json.dumps([asdict(s) for s in sections]), "created_at": utc_now()},
            )
            conn.executemany(
                "INSERT INTO segments VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    (meta["id"], s.index, s.section_index, s.paragraph_index, s.kind, s.boundary, s.text)
                    for s in segments
                ],
            )
            conn.executemany(
                "INSERT INTO segment_annotations (document_id, segment_idx, kind, value) VALUES (?, ?, ?, ?)",
                [(meta["id"], index, kind, value) for index, kind, value in annotations],
            )

    def list_all(self) -> list[DocumentSummary]:
        with self._db.connect() as conn:
            rows = conn.execute(_SUMMARY_SQL, {"document_id": None}).fetchall()
            unspoken = unread(conn.execute(UNREAD_SQL, {"document_id": None}))
            shelves = facets(conn)
        covers = self._covers()
        return [
            _summary(row, unspoken.get(row["id"], Unread()), shelves.get(row["id"], ShelfFacets()), row["id"] in covers)
            for row in rows
        ]

    def _one(self, document_id: str, *, opened: bool) -> tuple[sqlite3.Row, DocumentSummary]:
        with self._db.connect() as conn:
            row = conn.execute(_SUMMARY_SQL, {"document_id": document_id}).fetchone()
            if row is None:
                raise NotFoundError(_DOCUMENT_GONE, code="document_not_found")
            if opened:
                conn.execute("UPDATE documents SET last_opened_at = ? WHERE id = ?", (utc_now(), document_id))
            unspoken = unread(conn.execute(UNREAD_SQL, {"document_id": document_id}))
            shelf = facets(conn, document_id).get(document_id, ShelfFacets())
        has_cover = document_id in self._covers()
        return row, _summary(row, unspoken.get(document_id, Unread()), shelf, has_cover)

    def summary(self, document_id: str) -> DocumentSummary:
        """One document's library summary, without counting as opening it."""
        return self._one(document_id, opened=False)[1]

    def get(self, document_id: str) -> DocumentDetail:
        row, summary = self._one(document_id, opened=True)
        return DocumentDetail(
            **summary.model_dump(),
            sections=[SectionOut(**s) for s in json.loads(row["sections_json"])],
            warnings=json.loads(row["warnings_json"]),
        )

    def section(self, document_id: str, section_index: int) -> SectionContent:
        with self._db.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM segments WHERE document_id = ? AND section_idx = ? ORDER BY idx",
                (document_id, section_index),
            ).fetchall()
        if not rows:
            raise NotFoundError("That section does not exist.", code="section_not_found")
        return SectionContent(section_index=section_index, segments=[_segment(r) for r in rows])

    def segments_detail(self, document_id: str) -> list[SegmentOut]:
        """Every segment of a document, in order, with its paragraph and kind."""
        with self._db.connect() as conn:
            rows = conn.execute("SELECT * FROM segments WHERE document_id = ? ORDER BY idx", (document_id,)).fetchall()
        return [_segment(r) for r in rows]

    def update_section(
        self, document_id: str, section_index: int, title: str | None, start_segment: int | None
    ) -> DocumentDetail:
        """Rename a section and/or move its start to another sentence between its neighbours' starts."""
        with self._db.connect() as conn:
            row = conn.execute("SELECT sections_json FROM documents WHERE id = ?", (document_id,)).fetchone()
            if row is None:
                raise NotFoundError(_DOCUMENT_GONE, code="document_not_found")
            sections = json.loads(row["sections_json"])
            if not 0 <= section_index < len(sections):
                raise NotFoundError("That section does not exist.", code="section_not_found")
            if title is not None:
                sections[section_index]["title"] = title
            if start_segment is not None and start_segment != sections[section_index]["start_segment"]:
                _move_start(conn, document_id, sections, section_index, start_segment)
            conn.execute("UPDATE documents SET sections_json = ? WHERE id = ?", (json.dumps(sections), document_id))
        return self.get(document_id)

    def search(self, document_id: str, query: str, limit: int) -> SearchResults:
        """Sentences containing ``query`` in any letter case, in reading order (the first ``limit``)."""
        wanted = " ".join(query.split()).casefold()
        with self._db.connect() as conn:
            if conn.execute("SELECT 1 FROM documents WHERE id = ?", (document_id,)).fetchone() is None:
                raise NotFoundError(_DOCUMENT_GONE, code="document_not_found")
            rows = conn.execute(
                "SELECT idx, section_idx, text FROM segments WHERE document_id = ? ORDER BY idx", (document_id,)
            ).fetchall()
        # Matched in Python: SQLite only folds the case of ASCII letters.
        matches = [row for row in rows if wanted in " ".join(row["text"].split()).casefold()]
        hits = [SearchHit(segment_index=r["idx"], section_index=r["section_idx"], text=r["text"]) for r in matches]
        return SearchResults(query=query, total=len(hits), hits=hits[:limit])

    def segment(self, document_id: str, index: int) -> tuple[str, str]:
        """Return ``(text, boundary)`` for one segment."""
        with self._db.connect() as conn:
            row = conn.execute(
                "SELECT text, boundary FROM segments WHERE document_id = ? AND idx = ?", (document_id, index)
            ).fetchone()
        if row is None:
            raise NotFoundError("That part of the document does not exist.", code="segment_not_found")
        return row["text"], row["boundary"]

    def all_segments(self, document_id: str) -> list[tuple[int, int, str, str]]:
        """``(index, section_index, text, boundary)`` for every segment, in order."""
        with self._db.connect() as conn:
            rows = conn.execute(
                "SELECT idx, section_idx, text, boundary FROM segments WHERE document_id = ? ORDER BY idx",
                (document_id,),
            ).fetchall()
        return [(r[0], r[1], r[2], r[3]) for r in rows]

    def delete(self, document_id: str) -> None:
        with self._db.connect() as conn:
            if conn.execute("DELETE FROM documents WHERE id = ?", (document_id,)).rowcount == 0:
                raise NotFoundError(_DOCUMENT_GONE, code="document_not_found")

    def save_progress(self, document_id: str, segment_index: int, voice_id: str | None) -> None:
        with self._db.connect() as conn:
            row = conn.execute("SELECT segment_count FROM documents WHERE id = ?", (document_id,)).fetchone()
            if row is None:
                raise NotFoundError(_DOCUMENT_GONE, code="document_not_found")
            index = min(segment_index, max(row[0] - 1, 0))
            conn.execute(
                """INSERT INTO progress (document_id, segment_idx, voice_id, updated_at) VALUES (?, ?, ?, ?)
                   ON CONFLICT(document_id) DO UPDATE SET segment_idx = excluded.segment_idx,
                   voice_id = excluded.voice_id, updated_at = excluded.updated_at""",
                (document_id, index, voice_id, utc_now()),
            )


def _move_start(
    conn: sqlite3.Connection, document_id: str, sections: list[dict[str, int]], index: int, start: int
) -> None:
    """Move section ``index`` to start at segment ``start``; the previous section gains or gives up the rest."""
    if index == 0:
        raise ConflictError("The first section always starts at the beginning.", code="invalid_section_start")
    previous, current = sections[index - 1], sections[index]
    end = current["start_segment"] + current["segment_count"]
    if not previous["start_segment"] < start < end:
        raise ConflictError(
            "A section has to start after the previous one starts and keep at least one sentence.",
            code="invalid_section_start",
        )
    old = current["start_segment"]
    previous["segment_count"] = start - previous["start_segment"]
    current["start_segment"], current["segment_count"] = start, end - start
    conn.execute(
        """UPDATE segments SET section_idx = CASE WHEN idx < ? THEN ? ELSE ? END
           WHERE document_id = ? AND idx >= ? AND idx < ?""",
        (start, index - 1, index, document_id, previous["start_segment"], end),
    )
    # The longer pause that ends a section moves with the boundary.
    conn.execute(
        "UPDATE segments SET boundary = 'paragraph' WHERE document_id = ? AND idx = ? AND boundary = 'section'",
        (document_id, old - 1),
    )
    conn.execute("UPDATE segments SET boundary = 'section' WHERE document_id = ? AND idx = ?", (document_id, start - 1))


def _segment(r: sqlite3.Row) -> SegmentOut:
    return SegmentOut(
        index=r["idx"],
        section_index=r["section_idx"],
        paragraph_index=r["paragraph_idx"],
        kind=r["kind"],
        boundary=r["boundary"],
        text=r["text"],
    )
