# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Collections: named groups a document can belong to any number of (ADR-24).

Scope: A collection has a name, a description and the documents in it, in the order they were added.
A document joins as many collections as the reader likes without being copied; removing it from one,
or deleting the collection, never touches the document. ``ensure_collection`` is the check other
stores use before adding to one.
Does NOT belong: A document's single place in a folder (``folders.py``, ``shelf.py``) or HTTP.
"""

from __future__ import annotations

import sqlite3

from pydantic import Field

from ltts.common import ApiModel, new_id, utc_now
from ltts.db import Database
from ltts.errors import ConflictError, NotFoundError

MAX_COLLECTIONS = 200
NAME_MAX = 80
DESCRIPTION_MAX = 500
MAX_MEMBERS_PER_REQUEST = 500
ID_PATTERN = r"^[0-9a-f]{32}$"
_COLLECTION_GONE = "That collection no longer exists."
_ONE_SQL = """
    SELECT c.*, (SELECT COUNT(*) FROM collection_documents cd WHERE cd.collection_id = c.id) AS document_count
    FROM collections c WHERE (:id IS NULL OR c.id = :id) ORDER BY c.position, c.created_at
"""
# Add a document at the end of a collection; already a member: nothing changes. (collection, document, collection, time)
ADD_MEMBER_SQL = """
    INSERT OR IGNORE INTO collection_documents (collection_id, document_id, position, added_at)
    VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM collection_documents WHERE collection_id = ?), ?)
"""


class CollectionIn(ApiModel):
    name: str = Field(min_length=1, max_length=NAME_MAX)
    description: str = Field(default="", max_length=DESCRIPTION_MAX)


class CollectionUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=NAME_MAX)
    description: str | None = Field(default=None, max_length=DESCRIPTION_MAX)


class CollectionMembers(ApiModel):
    """Documents to add to and remove from a collection; an id in both is removed."""

    add: list[str] = Field(default_factory=list, max_length=MAX_MEMBERS_PER_REQUEST)
    remove: list[str] = Field(default_factory=list, max_length=MAX_MEMBERS_PER_REQUEST)


class CollectionOut(ApiModel):
    id: str
    name: str
    description: str
    position: int
    document_count: int
    created_at: str


def ensure_collection(conn: sqlite3.Connection, collection_id: str) -> None:
    if conn.execute("SELECT 1 FROM collections WHERE id = ?", (collection_id,)).fetchone() is None:
        raise NotFoundError(_COLLECTION_GONE, code="collection_not_found")


def _clean(text: str, limit: int, *, required: bool) -> str:
    cleaned = "".join(ch for ch in " ".join(text.split()) if ch.isprintable())
    if required and not cleaned:
        raise ConflictError("A collection needs a name.", code="invalid_collection_name")
    return cleaned[:limit]


def _row(row: sqlite3.Row) -> CollectionOut:
    return CollectionOut(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        position=row["position"],
        document_count=row["document_count"],
        created_at=row["created_at"],
    )


class CollectionStore:
    def __init__(self, db: Database):
        self._db = db

    def list_all(self) -> list[CollectionOut]:
        with self._db.connect() as conn:
            return [_row(row) for row in conn.execute(_ONE_SQL, {"id": None}).fetchall()]

    def get(self, collection_id: str) -> CollectionOut:
        with self._db.connect() as conn:
            row = conn.execute(_ONE_SQL, {"id": collection_id}).fetchone()
        if row is None:
            raise NotFoundError(_COLLECTION_GONE, code="collection_not_found")
        return _row(row)

    def create(self, collection: CollectionIn) -> CollectionOut:
        with self._db.connect() as conn:
            if conn.execute("SELECT COUNT(*) FROM collections").fetchone()[0] >= MAX_COLLECTIONS:
                raise ConflictError(
                    f"The library holds at most {MAX_COLLECTIONS} collections.", code="collection_limit"
                )
            position = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM collections").fetchone()[0]
            collection_id = new_id()
            conn.execute(
                "INSERT INTO collections (id, name, description, position, created_at) VALUES (?, ?, ?, ?, ?)",
                (
                    collection_id,
                    _clean(collection.name, NAME_MAX, required=True),
                    _clean(collection.description, DESCRIPTION_MAX, required=False),
                    position,
                    utc_now(),
                ),
            )
        return self.get(collection_id)

    def update(self, collection_id: str, update: CollectionUpdate) -> CollectionOut:
        with self._db.connect() as conn:
            ensure_collection(conn, collection_id)
            if update.name is not None:
                conn.execute(
                    "UPDATE collections SET name = ? WHERE id = ?",
                    (_clean(update.name, NAME_MAX, required=True), collection_id),
                )
            if update.description is not None:
                conn.execute(
                    "UPDATE collections SET description = ? WHERE id = ?",
                    (_clean(update.description, DESCRIPTION_MAX, required=False), collection_id),
                )
        return self.get(collection_id)

    def set_members(self, collection_id: str, members: CollectionMembers) -> CollectionOut:
        """Add documents (those that exist; others are ignored) and remove documents."""
        with self._db.connect() as conn:
            ensure_collection(conn, collection_id)
            now = utc_now()
            for document_id in members.add:
                if conn.execute("SELECT 1 FROM documents WHERE id = ?", (document_id,)).fetchone() is None:
                    raise NotFoundError("That document no longer exists.", code="document_not_found")
                conn.execute(ADD_MEMBER_SQL, (collection_id, document_id, collection_id, now))
            conn.executemany(
                "DELETE FROM collection_documents WHERE collection_id = ? AND document_id = ?",
                [(collection_id, document_id) for document_id in members.remove],
            )
        return self.get(collection_id)

    def delete(self, collection_id: str) -> None:
        with self._db.connect() as conn:
            ensure_collection(conn, collection_id)
            conn.execute("DELETE FROM collections WHERE id = ?", (collection_id,))
