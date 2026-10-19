"""Purpose: SQL access for documents, their segments and reading progress.

Scope: Insert a fully segmented document atomically; list/get/delete; fetch a section's or a single
segment's text; save and read progress. Rows are mapped to API models here.
Does NOT belong: Validation or extraction (``service.py``).
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict

from ltts.common import utc_now
from ltts.db import Database
from ltts.documents.schemas import (
    CHARS_PER_SECOND,
    DocumentDetail,
    DocumentSummary,
    ReadingProgress,
    SectionContent,
    SectionOut,
    SegmentOut,
)
from ltts.documents.structures import SectionInfo, Segment
from ltts.errors import NotFoundError

_SUMMARY_SQL = """
SELECT d.*, p.segment_idx AS p_segment, p.voice_id AS p_voice, p.updated_at AS p_updated
FROM documents d LEFT JOIN progress p ON p.document_id = d.id
"""
_LIST_SQL = _SUMMARY_SQL + " ORDER BY COALESCE(p.updated_at, d.created_at) DESC"
_GET_SQL = _SUMMARY_SQL + " WHERE d.id = ?"


def _summary(row: sqlite3.Row) -> DocumentSummary:
    progress = None
    if row["p_segment"] is not None:
        progress = ReadingProgress(
            segment_index=row["p_segment"],
            voice_id=row["p_voice"],
            updated_at=row["p_updated"],
            # Reaching the last segment counts as finished.
            percent=round(100 * row["p_segment"] / max(row["segment_count"] - 1, 1), 1),
        )
    return DocumentSummary(
        id=row["id"],
        title=row["title"],
        filename=row["filename"],
        file_type=row["file_type"],
        size_bytes=row["size_bytes"],
        char_count=row["char_count"],
        word_count=row["word_count"],
        page_count=row["page_count"],
        segment_count=row["segment_count"],
        section_count=len(json.loads(row["sections_json"])),
        estimated_seconds=round(row["char_count"] / CHARS_PER_SECOND, 1),
        created_at=row["created_at"],
        last_opened_at=row["last_opened_at"],
        progress=progress,
    )


class DocumentRepository:
    def __init__(self, db: Database):
        self._db = db

    def count(self) -> int:
        with self._db.connect() as conn:
            return int(conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0])

    def insert(self, meta: dict[str, object], sections: list[SectionInfo], segments: list[Segment]) -> None:
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

    def list_all(self) -> list[DocumentSummary]:
        with self._db.connect() as conn:
            rows = conn.execute(_LIST_SQL).fetchall()
        return [_summary(row) for row in rows]

    def get(self, document_id: str) -> DocumentDetail:
        with self._db.connect() as conn:
            row = conn.execute(_GET_SQL, (document_id,)).fetchone()
            if row is None:
                raise NotFoundError("That document no longer exists.", code="document_not_found")
            conn.execute("UPDATE documents SET last_opened_at = ? WHERE id = ?", (utc_now(), document_id))
        summary = _summary(row)
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
        return SectionContent(
            section_index=section_index,
            segments=[
                SegmentOut(
                    index=r["idx"],
                    section_index=r["section_idx"],
                    paragraph_index=r["paragraph_idx"],
                    kind=r["kind"],
                    boundary=r["boundary"],
                    text=r["text"],
                )
                for r in rows
            ],
        )

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
                raise NotFoundError("That document no longer exists.", code="document_not_found")

    def save_progress(self, document_id: str, segment_index: int, voice_id: str | None) -> None:
        with self._db.connect() as conn:
            row = conn.execute("SELECT segment_count FROM documents WHERE id = ?", (document_id,)).fetchone()
            if row is None:
                raise NotFoundError("That document no longer exists.", code="document_not_found")
            index = min(segment_index, max(row[0] - 1, 0))
            conn.execute(
                """INSERT INTO progress (document_id, segment_idx, voice_id, updated_at) VALUES (?, ?, ?, ?)
                   ON CONFLICT(document_id) DO UPDATE SET segment_idx = excluded.segment_idx,
                   voice_id = excluded.voice_id, updated_at = excluded.updated_at""",
                (document_id, index, voice_id, utc_now()),
            )
