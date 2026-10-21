# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The reader's folder tree: where each document lives in the library (ADR-24).

Scope: Folders nest (``parent_id``) up to ``MAX_DEPTH`` levels and are listed with how many documents
each holds directly. Creating, renaming, moving (never under itself or a descendant) and deleting.
Deleting a folder deletes the folders inside it and moves every document they held to the folder above;
documents are never deleted here. ``ensure_folder`` is the check other stores use before pointing at one.
Does NOT belong: A document's own shelf entry (``shelf.py``), collections (``collections.py``) or HTTP.
"""

from __future__ import annotations

import sqlite3

from pydantic import Field

from ltts.common import ApiModel, new_id, utc_now
from ltts.db import Database
from ltts.errors import ConflictError, NotFoundError

MAX_FOLDERS = 500
MAX_DEPTH = 8
NAME_MAX = 80
ID_PATTERN = r"^[0-9a-f]{32}$"
_FOLDER_GONE = "That folder no longer exists."
# A folder and every folder inside it.
_SUBTREE_SQL = """
    WITH RECURSIVE sub(id) AS (
        SELECT id FROM folders WHERE id = :id
        UNION ALL SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
    ) SELECT id FROM sub
"""
# How many levels a folder is below the top (1 for a top-level folder).
_DEPTH_SQL = """
    WITH RECURSIVE up(parent_id, depth) AS (
        SELECT parent_id, 1 FROM folders WHERE id = :id
        UNION ALL SELECT f.parent_id, up.depth + 1 FROM folders f JOIN up ON f.id = up.parent_id
    ) SELECT MAX(depth) FROM up
"""
# How many levels of folders a folder holds below itself (0 for an empty one).
_HEIGHT_SQL = """
    WITH RECURSIVE down(id, height) AS (
        SELECT id, 0 FROM folders WHERE id = :id
        UNION ALL SELECT f.id, down.height + 1 FROM folders f JOIN down ON f.parent_id = down.id
    ) SELECT MAX(height) FROM down
"""
_LIST_SQL = """
    SELECT f.*, (SELECT COUNT(*) FROM document_shelf s WHERE s.folder_id = f.id) AS document_count
    FROM folders f ORDER BY f.parent_id IS NOT NULL, f.parent_id, f.position, f.name COLLATE NOCASE
"""


class FolderIn(ApiModel):
    name: str = Field(min_length=1, max_length=NAME_MAX)
    parent_id: str | None = Field(default=None, pattern=ID_PATTERN)


class FolderUpdate(ApiModel):
    """A new name and/or a new place: ``parent_id`` null (sent) moves the folder to the top."""

    name: str | None = Field(default=None, min_length=1, max_length=NAME_MAX)
    parent_id: str | None = Field(default=None, pattern=ID_PATTERN)


class FolderOut(ApiModel):
    id: str
    parent_id: str | None
    name: str
    position: int
    document_count: int  # documents directly inside (not in subfolders)
    created_at: str


def ensure_folder(conn: sqlite3.Connection, folder_id: str) -> None:
    if conn.execute("SELECT 1 FROM folders WHERE id = ?", (folder_id,)).fetchone() is None:
        raise NotFoundError(_FOLDER_GONE, code="folder_not_found")


def _clean_name(name: str) -> str:
    cleaned = "".join(ch for ch in " ".join(name.split()) if ch.isprintable())
    if not cleaned:
        raise ConflictError("A folder needs a name.", code="invalid_folder_name")
    return cleaned[:NAME_MAX]


def _row(row: sqlite3.Row) -> FolderOut:
    return FolderOut(
        id=row["id"],
        parent_id=row["parent_id"],
        name=row["name"],
        position=row["position"],
        document_count=row["document_count"],
        created_at=row["created_at"],
    )


def _depth_of(conn: sqlite3.Connection, folder_id: str | None) -> int:
    if folder_id is None:
        return 0
    return int(conn.execute(_DEPTH_SQL, {"id": folder_id}).fetchone()[0])


class FolderStore:
    def __init__(self, db: Database):
        self._db = db

    def list_all(self) -> list[FolderOut]:
        with self._db.connect() as conn:
            return [_row(row) for row in conn.execute(_LIST_SQL).fetchall()]

    def get(self, folder_id: str) -> FolderOut:
        with self._db.connect() as conn:
            row = conn.execute(
                "SELECT f.*, (SELECT COUNT(*) FROM document_shelf s WHERE s.folder_id = f.id) AS document_count "
                "FROM folders f WHERE f.id = ?",
                (folder_id,),
            ).fetchone()
        if row is None:
            raise NotFoundError(_FOLDER_GONE, code="folder_not_found")
        return _row(row)

    def create(self, folder: FolderIn) -> FolderOut:
        with self._db.connect() as conn:
            if conn.execute("SELECT COUNT(*) FROM folders").fetchone()[0] >= MAX_FOLDERS:
                raise ConflictError(f"The library holds at most {MAX_FOLDERS} folders.", code="folder_limit")
            if folder.parent_id is not None:
                ensure_folder(conn, folder.parent_id)
            if _depth_of(conn, folder.parent_id) + 1 > MAX_DEPTH:
                raise ConflictError(f"Folders nest at most {MAX_DEPTH} levels deep.", code="folder_depth")
            position = conn.execute(
                "SELECT COALESCE(MAX(position), 0) + 1 FROM folders WHERE parent_id IS ?", (folder.parent_id,)
            ).fetchone()[0]
            folder_id = new_id()
            conn.execute(
                "INSERT INTO folders (id, parent_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
                (folder_id, folder.parent_id, _clean_name(folder.name), position, utc_now()),
            )
        return self.get(folder_id)

    def update(self, folder_id: str, update: FolderUpdate) -> FolderOut:
        with self._db.connect() as conn:
            ensure_folder(conn, folder_id)
            if update.name is not None:
                conn.execute("UPDATE folders SET name = ? WHERE id = ?", (_clean_name(update.name), folder_id))
            if "parent_id" in update.model_fields_set:
                self._move(conn, folder_id, update.parent_id)
        return self.get(folder_id)

    @staticmethod
    def _move(conn: sqlite3.Connection, folder_id: str, parent_id: str | None) -> None:
        if parent_id is not None:
            ensure_folder(conn, parent_id)
            subtree = {row["id"] for row in conn.execute(_SUBTREE_SQL, {"id": folder_id})}
            if parent_id in subtree:
                raise ConflictError("A folder can't be moved into itself.", code="folder_cycle")
        height = int(conn.execute(_HEIGHT_SQL, {"id": folder_id}).fetchone()[0])
        if _depth_of(conn, parent_id) + 1 + height > MAX_DEPTH:
            raise ConflictError(f"Folders nest at most {MAX_DEPTH} levels deep.", code="folder_depth")
        position = conn.execute(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM folders WHERE parent_id IS ?", (parent_id,)
        ).fetchone()[0]
        conn.execute("UPDATE folders SET parent_id = ?, position = ? WHERE id = ?", (parent_id, position, folder_id))

    def delete(self, folder_id: str) -> None:
        """Remove the folder and its subfolders; their documents move to the folder above (or out of folders)."""
        with self._db.connect() as conn:
            ensure_folder(conn, folder_id)
            parent = conn.execute("SELECT parent_id FROM folders WHERE id = ?", (folder_id,)).fetchone()[0]
            subtree = [row["id"] for row in conn.execute(_SUBTREE_SQL, {"id": folder_id})]
            conn.executemany(
                "UPDATE document_shelf SET folder_id = ? WHERE folder_id = ?", [(parent, inner) for inner in subtree]
            )
            conn.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
