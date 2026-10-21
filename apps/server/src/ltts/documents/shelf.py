# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: What a reader says about a document in the library: its folder, favourite, type, genres and tags.

Scope: The fixed genre and document-type vocabularies (ADR-24), a document's shelf entry
(``document_shelf``: folder, type, favourite), its genres (``document_genres``) and tags
(``document_tags``, kept as typed and matched without regard to case), the facets the library listing
carries for every document, changing one document's shelf, and organising many documents at once
(move, favourite, classify, tag, add to or remove from collections). Every row is deleted with its
document. Folders and collections themselves live in ``folders.py`` and ``collections.py``.
Does NOT belong: HTTP (``shelf_router.py``), the documents' text, or reading progress.
"""

from __future__ import annotations

import sqlite3
from collections import Counter
from collections.abc import Iterable, Sequence
from typing import Literal

from pydantic import Field, field_validator

from ltts.common import ApiModel, utc_now
from ltts.db import Database
from ltts.documents.collections import ADD_MEMBER_SQL, ensure_collection
from ltts.documents.folders import ensure_folder
from ltts.errors import ConflictError, NotFoundError

Genre = Literal[
    "fantasy", "science-fiction", "mystery", "horror", "historical-fiction", "romance", "literary-fiction",
    "adventure", "poetry", "biography", "memoir", "history", "philosophy", "science", "technology", "childrens",
    "other",
]  # fmt: skip
WorkType = Literal[
    "novel", "novella", "short-story", "short-story-collection", "poem", "poetry-collection", "memoir", "biography",
    "essay", "research-paper", "report", "personal-document", "other",
]  # fmt: skip
GENRES: tuple[str, ...] = Genre.__args__  # type: ignore[attr-defined]
WORK_TYPES: tuple[str, ...] = WorkType.__args__  # type: ignore[attr-defined]
ID_PATTERN = r"^[0-9a-f]{32}$"
MAX_GENRES = 6
MAX_TAGS = 30  # per document
MAX_TAG_CHARS = 40
MAX_BULK = 500  # documents organised in one request
_DOCUMENT_GONE = "That document no longer exists."


def tag_key(tag: str) -> str:
    """How two spellings of a tag are told to be the same: whitespace collapsed, case folded."""
    return " ".join(tag.split()).casefold()


def clean_tags(tags: Iterable[str]) -> list[str]:
    """Tags as typed, trimmed, without control characters, each spelling once (first wins)."""
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in tags:
        tag = "".join(ch for ch in " ".join(raw.split()) if ch.isprintable())
        if not tag or len(tag) > MAX_TAG_CHARS:
            raise ValueError(f"A tag has 1 to {MAX_TAG_CHARS} characters.")
        if tag_key(tag) in seen:
            continue
        seen.add(tag_key(tag))
        cleaned.append(tag)
    return cleaned


class ShelfFacets(ApiModel):
    """How a document is organised, carried by every library summary."""

    # Literal defaults (pydantic copies them per instance) so the OpenAPI schema carries them and the
    # generated TypeScript treats the lists as always present.
    folder_id: str | None = None
    favorite: bool = False
    document_type: WorkType | None = None
    genres: list[Genre] = Field(default=[])
    tags: list[str] = Field(default=[])
    collection_ids: list[str] = Field(default=[])


class ShelfUpdate(ApiModel):
    """Set the given fields on one document; a field left out is kept, ``folder_id`` null means no folder."""

    folder_id: str | None = Field(default=None, pattern=ID_PATTERN)
    favorite: bool | None = None
    document_type: WorkType | None = None
    genres: list[Genre] | None = Field(default=None, max_length=MAX_GENRES)
    tags: list[str] | None = Field(default=None, max_length=MAX_TAGS)

    @field_validator("tags")
    @classmethod
    def _clean(cls, tags: list[str] | None) -> list[str] | None:
        return None if tags is None else clean_tags(tags)


class OrganizeRequest(ApiModel):
    """Organise several documents at once; a field left out changes nothing."""

    document_ids: list[str] = Field(min_length=1, max_length=MAX_BULK)
    folder_id: str | None = Field(default=None, pattern=ID_PATTERN)  # null (sent) moves out of every folder
    favorite: bool | None = None
    document_type: WorkType | None = None
    genres: list[Genre] | None = Field(default=None, max_length=MAX_GENRES)  # replaces each document's genres
    add_tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS)
    remove_tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS)
    add_to_collections: list[str] = Field(default_factory=list, max_length=50)
    remove_from_collections: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("add_tags", "remove_tags")
    @classmethod
    def _clean(cls, tags: list[str]) -> list[str]:
        return clean_tags(tags)

    @field_validator("document_ids", "add_to_collections", "remove_from_collections")
    @classmethod
    def _ids(cls, ids: list[str]) -> list[str]:
        if any(len(item) != 32 or not all(ch in "0123456789abcdef" for ch in item) for item in ids):
            raise ValueError("Identifiers are 32 hex characters.")
        return list(dict.fromkeys(ids))


class TagOut(ApiModel):
    tag: str  # the most common spelling
    count: int


# The three small tables that make a document's facets, read for one document or for all of them.
_SHELF_SQL = "SELECT * FROM document_shelf WHERE (:document_id IS NULL OR document_id = :document_id)"
_GENRES_SQL = "SELECT * FROM document_genres WHERE (:document_id IS NULL OR document_id = :document_id) ORDER BY genre"
_TAGS_SQL = "SELECT * FROM document_tags WHERE (:document_id IS NULL OR document_id = :document_id) ORDER BY tag_key"
_MEMBERS_SQL = """
    SELECT cd.document_id, cd.collection_id FROM collection_documents cd
    JOIN collections c ON c.id = cd.collection_id
    WHERE (:document_id IS NULL OR cd.document_id = :document_id) ORDER BY c.position, c.created_at
"""


def facets(conn: sqlite3.Connection, document_id: str | None = None) -> dict[str, ShelfFacets]:
    """Every document's facets (or one document's), keyed by document id; documents without rows are absent."""
    params = {"document_id": document_id}
    found: dict[str, ShelfFacets] = {}

    def entry(doc: str) -> ShelfFacets:
        return found.setdefault(doc, ShelfFacets())

    for row in conn.execute(_SHELF_SQL, params):
        entry(row["document_id"]).folder_id = row["folder_id"]
        entry(row["document_id"]).favorite = bool(row["favorite"])
        entry(row["document_id"]).document_type = row["document_type"]
    for row in conn.execute(_GENRES_SQL, params):
        entry(row["document_id"]).genres.append(row["genre"])
    for row in conn.execute(_TAGS_SQL, params):
        entry(row["document_id"]).tags.append(row["tag"])
    for row in conn.execute(_MEMBERS_SQL, params):
        entry(row["document_id"]).collection_ids.append(row["collection_id"])
    return found


def _existing(conn: sqlite3.Connection, ids: Sequence[str]) -> None:
    """Every id names a document, or nothing is changed."""
    rows = conn.execute(
        "SELECT id FROM documents WHERE id IN (SELECT value FROM json_each(?))", (_json_ids(ids),)
    ).fetchall()
    if len(rows) != len(ids):
        raise NotFoundError(_DOCUMENT_GONE, code="document_not_found")


def _json_ids(ids: Sequence[str]) -> str:
    return "[" + ",".join(f'"{item}"' for item in ids) + "]"  # ids are checked hex strings


class ShelfStore:
    def __init__(self, db: Database):
        self._db = db

    def update(self, document_id: str, update: ShelfUpdate) -> None:
        sent = update.model_fields_set
        request = OrganizeRequest(
            document_ids=[document_id],
            **{
                name: getattr(update, name)
                for name in ("folder_id", "favorite", "document_type", "genres")
                if name in sent
            },
        )
        with self._db.connect() as conn:
            _existing(conn, [document_id])
            self._apply(conn, request, sent)
            if update.tags is not None:
                conn.execute("DELETE FROM document_tags WHERE document_id = ?", (document_id,))
                _add_tags(conn, [document_id], update.tags)

    def organize(self, request: OrganizeRequest) -> list[str]:
        """Apply the request to every document; returns the ids changed."""
        with self._db.connect() as conn:
            _existing(conn, request.document_ids)
            for collection_id in (*request.add_to_collections, *request.remove_from_collections):
                ensure_collection(conn, collection_id)
            self._apply(conn, request, request.model_fields_set)
            _add_tags(conn, request.document_ids, request.add_tags)
            for tag in request.remove_tags:
                conn.executemany(
                    "DELETE FROM document_tags WHERE document_id = ? AND tag_key = ?",
                    [(doc, tag_key(tag)) for doc in request.document_ids],
                )
            now = utc_now()
            for collection_id in request.add_to_collections:
                conn.executemany(
                    ADD_MEMBER_SQL, [(collection_id, doc, collection_id, now) for doc in request.document_ids]
                )
            for collection_id in request.remove_from_collections:
                conn.executemany(
                    "DELETE FROM collection_documents WHERE collection_id = ? AND document_id = ?",
                    [(collection_id, doc) for doc in request.document_ids],
                )
        return list(request.document_ids)

    @staticmethod
    def _apply(conn: sqlite3.Connection, request: OrganizeRequest, sent: set[str]) -> None:
        """The shelf-row fields (folder, favourite, type) and the genres, for every document in the request."""
        ids = request.document_ids
        if "folder_id" in sent and request.folder_id is not None:
            ensure_folder(conn, request.folder_id)
        conn.executemany("INSERT OR IGNORE INTO document_shelf (document_id) VALUES (?)", [(doc,) for doc in ids])
        if "folder_id" in sent:
            conn.executemany(
                "UPDATE document_shelf SET folder_id = ? WHERE document_id = ?",
                [(request.folder_id, doc) for doc in ids],
            )
        if request.favorite is not None:
            stamp = utc_now() if request.favorite else None
            conn.executemany(
                "UPDATE document_shelf SET favorite = ?, favorited_at = ? WHERE document_id = ?",
                [(int(request.favorite), stamp, doc) for doc in ids],
            )
        if "document_type" in sent:
            conn.executemany(
                "UPDATE document_shelf SET document_type = ? WHERE document_id = ?",
                [(request.document_type, doc) for doc in ids],
            )
        if request.genres is not None:
            conn.executemany("DELETE FROM document_genres WHERE document_id = ?", [(doc,) for doc in ids])
            conn.executemany(
                "INSERT OR IGNORE INTO document_genres (document_id, genre) VALUES (?, ?)",
                [(doc, genre) for doc in ids for genre in request.genres],
            )

    def tags(self) -> list[TagOut]:
        """Every tag in the library with how many documents carry it, most used first."""
        with self._db.connect() as conn:
            rows = conn.execute("SELECT tag, tag_key FROM document_tags").fetchall()
        counts: Counter[str] = Counter(row["tag_key"] for row in rows)
        spellings: dict[str, Counter[str]] = {}
        for row in rows:
            spellings.setdefault(row["tag_key"], Counter())[row["tag"]] += 1
        return [
            TagOut(tag=spellings[key].most_common(1)[0][0], count=count)
            for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        ]


def _add_tags(conn: sqlite3.Connection, ids: Sequence[str], tags: Sequence[str]) -> None:
    for doc in ids:
        have = conn.execute("SELECT COUNT(*) FROM document_tags WHERE document_id = ?", (doc,)).fetchone()[0]
        if have + len(tags) > MAX_TAGS:
            raise ConflictError(f"A document has at most {MAX_TAGS} tags.", code="tag_limit")
    conn.executemany(
        "INSERT OR IGNORE INTO document_tags (document_id, tag, tag_key) VALUES (?, ?, ?)",
        [(doc, tag, tag_key(tag)) for doc in ids for tag in tags],
    )
