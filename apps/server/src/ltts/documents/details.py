# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: A document's audiobook details: author, narrator, description and cover image.

Scope: Stores the details in ``document_details`` and the cover as a file under ``data/covers``.
A cover must be a JPEG or PNG (checked by its first bytes, never by its name), at most 5 MB, and is
stored under a name the app chooses. It is only ever copied into exports, never decoded on the
server. Exports, read-along books and Audiobookshelf uploads use these details.
Does NOT belong: HTTP parsing (``details_router.py``) or the exports themselves.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from pydantic import Field

from ltts.common import MB, ApiModel
from ltts.config import Settings
from ltts.db import Database
from ltts.errors import UnsupportedDocumentError

MAX_COVER_BYTES = 5 * MB
_SIGNATURES = {b"\xff\xd8\xff": ("image/jpeg", "jpg"), b"\x89PNG\r\n\x1a\n": ("image/png", "png")}


class DetailsIn(ApiModel):
    author: str | None = Field(default=None, max_length=200)
    narrator: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4_000)


class DetailsOut(DetailsIn):
    has_cover: bool = False


@dataclass(frozen=True, slots=True)
class Cover:
    path: Path
    media_type: str


def cover_type(head: bytes) -> tuple[str, str] | None:
    """(media type, extension) for a JPEG or PNG, from its first bytes; None for anything else."""
    return next((kind for signature, kind in _SIGNATURES.items() if head.startswith(signature)), None)


class DocumentDetailsStore:
    def __init__(self, settings: Settings, db: Database):
        self._settings = settings
        self._db = db

    def _folder(self) -> Path:
        return self._settings.path("covers")

    def get(self, document_id: str) -> DetailsOut:
        with self._db.connect() as conn:
            row = conn.execute("SELECT * FROM document_details WHERE document_id = ?", (document_id,)).fetchone()
        if row is None:
            return DetailsOut()
        return DetailsOut(
            author=row["author"],
            narrator=row["narrator"],
            description=row["description"],
            has_cover=self.cover(document_id) is not None,
        )

    def update(self, document_id: str, details: DetailsIn) -> DetailsOut:
        values = {
            name: (getattr(details, name) or "").strip() or None for name in ("author", "narrator", "description")
        }
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO document_details (document_id, author, narrator, description) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(document_id) DO UPDATE SET author = excluded.author, narrator = excluded.narrator, "
                "description = excluded.description",
                (document_id, values["author"], values["narrator"], values["description"]),
            )
        return self.get(document_id)

    def set_cover(self, document_id: str, upload: Path) -> DetailsOut:
        if upload.stat().st_size > MAX_COVER_BYTES:
            raise UnsupportedDocumentError(
                "The cover is larger than 5 MB. Use a smaller image.", code="cover_too_large"
            )
        with upload.open("rb") as handle:
            kind = cover_type(handle.read(8))
        if kind is None:
            raise UnsupportedDocumentError("Use a JPEG or PNG image for the cover.", code="unsupported_cover")
        self.remove_cover(document_id)
        target = self._folder() / f"{document_id}.{kind[1]}"
        upload.replace(target)
        return self.get(document_id)

    def cover(self, document_id: str) -> Cover | None:
        for media_type, extension in _SIGNATURES.values():
            path = self._folder() / f"{document_id}.{extension}"
            if path.is_file():
                return Cover(path, media_type)
        return None

    def remove_cover(self, document_id: str) -> None:
        for _, extension in _SIGNATURES.values():
            (self._folder() / f"{document_id}.{extension}").unlink(missing_ok=True)
