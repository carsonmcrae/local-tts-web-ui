# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Bookmarks and notes on a document's sentences.

Scope: Bookmark a sentence (optionally with a note; bookmarking it again updates the note), list a
document's bookmarks in reading order with each sentence's text and section, change a note, and
remove a bookmark. One bookmark per sentence and at most ``MAX_BOOKMARKS`` per document; they are
deleted with their document (foreign key cascade) and survive section corrections, which never
renumber sentences.
Does NOT belong: Reading progress (``repository.py``) or HTTP parsing (``router.py``).
"""

from __future__ import annotations

import sqlite3

from pydantic import Field

from ltts.common import ApiModel, new_id, utc_now
from ltts.db import Database
from ltts.errors import ConflictError, NotFoundError

MAX_BOOKMARKS = 1000
MAX_NOTE_CHARS = 2000


class BookmarkIn(ApiModel):
    segment_index: int = Field(ge=0)
    note: str = Field(default="", max_length=MAX_NOTE_CHARS)


class NoteUpdate(ApiModel):
    note: str = Field(max_length=MAX_NOTE_CHARS)


class BookmarkOut(ApiModel):
    id: str
    segment_index: int
    section_index: int
    text: str  # the bookmarked sentence
    note: str
    created_at: str


# A bookmark with its sentence's text and section: every bookmark of a document, or one of them.
_LIST_SQL = """
    SELECT b.id, b.segment_idx, b.note, b.created_at, s.section_idx, s.text
    FROM bookmarks b JOIN segments s ON s.document_id = b.document_id AND s.idx = b.segment_idx
    WHERE b.document_id = ? ORDER BY b.segment_idx
"""
_ONE_SQL = """
    SELECT b.id, b.segment_idx, b.note, b.created_at, s.section_idx, s.text
    FROM bookmarks b JOIN segments s ON s.document_id = b.document_id AND s.idx = b.segment_idx
    WHERE b.document_id = ? AND b.id = ?
"""


def _bookmark(row: sqlite3.Row) -> BookmarkOut:
    return BookmarkOut(
        id=row["id"],
        segment_index=row["segment_idx"],
        section_index=row["section_idx"],
        text=row["text"],
        note=row["note"],
        created_at=row["created_at"],
    )


class BookmarkStore:
    def __init__(self, db: Database):
        self._db = db

    def list_for(self, document_id: str) -> list[BookmarkOut]:
        with self._db.connect() as conn:
            self._ensure_document(conn, document_id)
            rows = conn.execute(_LIST_SQL, (document_id,)).fetchall()
        return [_bookmark(row) for row in rows]

    def add(self, document_id: str, bookmark: BookmarkIn) -> BookmarkOut:
        note = bookmark.note.strip()
        with self._db.connect() as conn:
            self._ensure_document(conn, document_id)
            segment = conn.execute(
                "SELECT 1 FROM segments WHERE document_id = ? AND idx = ?", (document_id, bookmark.segment_index)
            ).fetchone()
            if segment is None:
                raise NotFoundError("That sentence isn't in this document.", code="segment_not_found")
            existing = conn.execute(
                "SELECT id FROM bookmarks WHERE document_id = ? AND segment_idx = ?",
                (document_id, bookmark.segment_index),
            ).fetchone()
            if existing is not None:
                conn.execute("UPDATE bookmarks SET note = ? WHERE id = ?", (note, existing["id"]))
                bookmark_id = existing["id"]
            else:
                count = conn.execute("SELECT COUNT(*) FROM bookmarks WHERE document_id = ?", (document_id,))
                if count.fetchone()[0] >= MAX_BOOKMARKS:
                    raise ConflictError("This document has the maximum number of bookmarks.", code="bookmark_limit")
                bookmark_id = new_id()
                conn.execute(
                    "INSERT INTO bookmarks (id, document_id, segment_idx, note, created_at) VALUES (?, ?, ?, ?, ?)",
                    (bookmark_id, document_id, bookmark.segment_index, note, utc_now()),
                )
        return self.get(document_id, bookmark_id)

    def get(self, document_id: str, bookmark_id: str) -> BookmarkOut:
        with self._db.connect() as conn:
            row = conn.execute(_ONE_SQL, (document_id, bookmark_id)).fetchone()
        if row is None:
            raise NotFoundError("That bookmark no longer exists.", code="bookmark_not_found")
        return _bookmark(row)

    def update_note(self, document_id: str, bookmark_id: str, note: str) -> BookmarkOut:
        self.get(document_id, bookmark_id)
        with self._db.connect() as conn:
            conn.execute("UPDATE bookmarks SET note = ? WHERE id = ?", (note.strip(), bookmark_id))
        return self.get(document_id, bookmark_id)

    def delete(self, document_id: str, bookmark_id: str) -> None:
        self.get(document_id, bookmark_id)
        with self._db.connect() as conn:
            conn.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark_id,))

    @staticmethod
    def _ensure_document(conn: sqlite3.Connection, document_id: str) -> None:
        if conn.execute("SELECT 1 FROM documents WHERE id = ?", (document_id,)).fetchone() is None:
            raise NotFoundError("That document no longer exists.", code="document_not_found")
