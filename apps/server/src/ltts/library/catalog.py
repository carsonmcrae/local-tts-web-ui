# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The bundled literary catalog: the public-domain works that ship with the app, and opening one.

Scope: Reads ``catalog.json`` and the works, covers and credits beside it from the package data (never by
file path, never written), checks every shipped file against its recorded SHA-256 and leaves out a work
that fails, lists the works with whether each is already in the library or hidden from Explore, and opens
a work: its EPUB is copied to the temporary folder and read through the same sniffing, sandboxed
extraction and cleanup as an upload, then linked to the work (``bundled_documents``), given its author,
description, cover, type and genres, and returned as an ordinary document. Opening a work twice returns
the document that exists. A work can be hidden from Explore and shown again (``hidden_works``).
Does NOT belong: HTTP (``router.py``), immersive presets (``presets.py``) or building the catalog
(scripts/library/build_catalog.py).
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
from collections.abc import Iterable
from dataclasses import dataclass
from importlib import resources
from importlib.resources.abc import Traversable
from pathlib import Path
from typing import Any, Literal

from pydantic import ConfigDict, Field

from ltts.common import ApiModel, new_id, utc_now
from ltts.config import Settings
from ltts.db import Database
from ltts.documents.details import DetailsIn, DocumentDetailsStore
from ltts.documents.repository import DocumentRepository
from ltts.documents.schemas import CHARS_PER_SECOND, DocumentDetail
from ltts.documents.service import DocumentService
from ltts.documents.shelf import Genre, ShelfStore, ShelfUpdate, WorkType
from ltts.errors import NotFoundError

log = logging.getLogger("ltts.library")
WORK_ID_PATTERN = r"^[a-z0-9][a-z0-9-]{2,79}$"
CHARS_PER_WORD = (
    5.7  # English prose with its spaces: words times this, over CHARS_PER_SECOND, estimates the listening time
)
_PACKAGE = "ltts.library"


class Author(ApiModel):
    name: str
    sort_name: str
    born: int | None = None
    died: int | None = None
    wikipedia: str | None = None


class Contributor(ApiModel):
    role: str
    name: str
    died: int | None = None
    note: str | None = None


class Rights(ApiModel):
    model_config = ConfigDict(extra="allow")

    status: Literal["public-domain-us"]
    worldwide: bool
    basis: str
    licence: str
    licence_url: str
    evidence: list[str]
    verified_on: str
    attribution: str
    trademark_note: str
    limits: str | None = None


class Featured(ApiModel):
    preset_id: str
    blurb: str


class CatalogWork(ApiModel):
    """One record of catalog.json, as the build writes it (``extra="allow"`` keeps provenance fields we don't read)."""

    model_config = ConfigDict(extra="allow")

    work_id: str = Field(pattern=WORK_ID_PATTERN)
    title: str
    sort_title: str
    authors: list[Author]
    contributors: list[Contributor] = Field(default=[])
    first_published: int
    language: str
    document_type: WorkType
    genres: list[Genre]
    description: str | None = None
    content_notes: list[str] = Field(default=[])
    word_count: int
    chapters: list[dict[str, str]]
    edition: dict[str, Any]
    file: str
    bytes: int
    sha256: str
    text_version: int
    cover: dict[str, Any] | None = None
    cover_note: str | None = None
    rights: Rights
    featured: Featured | None = None
    preset_version: int | None = None


class WorkOut(ApiModel):
    """A bundled work as Explore shows it, with where it stands in this library."""

    work_id: str
    title: str
    sort_title: str
    authors: list[str]
    first_published: int
    document_type: WorkType
    genres: list[Genre]
    description: str | None
    content_notes: list[str]
    word_count: int
    chapter_count: int
    estimated_seconds: float
    has_cover: bool
    cover_note: str | None
    edition_source: str
    edition_source_url: str
    rights_worldwide: bool
    rights_limits: str | None
    featured: Featured | None
    document_id: str | None  # the document this work became, if it was opened
    hidden: bool


class HiddenUpdate(ApiModel):
    hidden: bool


@dataclass(frozen=True, slots=True)
class CoverFile:
    data: bytes
    media_type: str


@dataclass(frozen=True, slots=True)
class LibraryStores:
    """What opening a work needs: ingestion, the repository, the details store and the shelf."""

    documents: DocumentService
    repository: DocumentRepository
    details: DocumentDetailsStore
    shelf: ShelfStore


def _package() -> Traversable:
    return resources.files(_PACKAGE)


def load_catalog(package: Traversable | None = None) -> tuple[int, list[CatalogWork]]:
    """The catalog version and the works whose shipped files are present and unchanged."""
    root = package or _package()
    raw = json.loads(root.joinpath("catalog.json").read_text("utf-8"))
    works: list[CatalogWork] = []
    for record in raw["works"]:
        work = CatalogWork.model_validate(record)
        if not _intact(root, work.file, work.sha256) or (
            work.cover is not None and not _intact(root, work.cover["file"], work.cover["sha256"])
        ):
            log.error("bundled work left out: its file does not match the catalog", extra={"work_id": work.work_id})
            continue
        works.append(work)
    return int(raw["catalog_version"]), works


def _intact(root: Traversable, relative: str, sha256: str) -> bool:
    file = root.joinpath(*relative.split("/"))
    return file.is_file() and hashlib.sha256(file.read_bytes()).hexdigest() == sha256


class Catalog:
    def __init__(self, settings: Settings, db: Database, stores: LibraryStores, package: Traversable | None = None):
        self._settings = settings
        self._db = db
        self._stores = stores
        self._root = package or _package()
        self.version, works = load_catalog(self._root)
        self._works = {work.work_id: work for work in works}

    @property
    def works(self) -> list[CatalogWork]:
        return list(self._works.values())

    def work(self, work_id: str) -> CatalogWork:
        work = self._works.get(work_id)
        if work is None:
            raise NotFoundError("That book isn't part of this library.", code="work_not_found")
        return work

    # -- listing ---------------------------------------------------------------
    def list_all(self) -> list[WorkOut]:
        with self._db.connect() as conn:
            rows = conn.execute("SELECT work_id, document_id FROM bundled_documents").fetchall()
            opened = {row["work_id"]: row["document_id"] for row in rows}
            hidden = {row["work_id"] for row in conn.execute("SELECT work_id FROM hidden_works")}
        return [self._out(work, opened.get(work.work_id), work.work_id in hidden) for work in self._works.values()]

    @staticmethod
    def _out(work: CatalogWork, document_id: str | None, hidden: bool) -> WorkOut:
        return WorkOut(
            work_id=work.work_id, title=work.title, sort_title=work.sort_title,
            authors=[author.name for author in work.authors], first_published=work.first_published,
            document_type=work.document_type, genres=work.genres, description=work.description,
            content_notes=work.content_notes, word_count=work.word_count, chapter_count=len(work.chapters),
            estimated_seconds=round(work.word_count * CHARS_PER_WORD / CHARS_PER_SECOND),
            has_cover=work.cover is not None, cover_note=work.cover_note,
            edition_source=str(work.edition["source"]), edition_source_url=str(work.edition["source_url"]),
            rights_worldwide=work.rights.worldwide, rights_limits=work.rights.limits, featured=work.featured,
            document_id=document_id, hidden=hidden,
        )  # fmt: skip

    def cover(self, work_id: str) -> CoverFile:
        work = self.work(work_id)
        if work.cover is None:
            raise NotFoundError("This book has no cover.", code="cover_not_found")
        return CoverFile(self._root.joinpath(*work.cover["file"].split("/")).read_bytes(), "image/jpeg")

    def credits(self) -> str:
        return self._root.joinpath("CREDITS.md").read_text("utf-8")

    # -- opening ---------------------------------------------------------------
    def document_for(self, work_id: str) -> str | None:
        """The id of the document a work became, if it still exists."""
        with self._db.connect() as conn:
            row = conn.execute("SELECT document_id FROM bundled_documents WHERE work_id = ?", (work_id,)).fetchone()
        return row["document_id"] if row else None

    def open(self, work_id: str) -> DocumentDetail:
        """The work as a document in the library: the one that exists, or a new one read from the shipped file."""
        work = self.work(work_id)
        existing = self.document_for(work_id)
        if existing is not None:
            return self._stores.repository.get(existing)
        data = self._root.joinpath(*work.file.split("/")).read_bytes()
        target = self._settings.path("tmp") / f"{new_id()}.upload"
        target.write_bytes(data)
        digest = hashlib.sha256(data).hexdigest()
        document = self._stores.documents.ingest_file(target, f"{work_id}.epub", len(data), digest)
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO bundled_documents (document_id, work_id, edition_id, content_sha256, catalog_version, "
                "text_version, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (document.id, work_id, str(work.edition["edition_id"]), work.sha256, self.version, work.text_version,
                 utc_now()),
            )  # fmt: skip
        self._decorate(document.id, work)
        return self._stores.repository.get(document.id)

    def _decorate(self, document_id: str, work: CatalogWork) -> None:
        """What the catalog knows about the book becomes the document's details, cover, type and genres."""
        author = ", ".join(a.name for a in work.authors)
        self._stores.details.update(document_id, DetailsIn(author=author, description=work.description))
        if work.cover is not None:
            copy = self._settings.path("tmp") / f"{new_id()}.cover"
            copy.write_bytes(self._root.joinpath(*work.cover["file"].split("/")).read_bytes())
            self._stores.details.set_cover(document_id, copy)
        self._stores.shelf.update(document_id, ShelfUpdate(document_type=work.document_type, genres=work.genres))

    # -- hiding ----------------------------------------------------------------
    def set_hidden(self, work_id: str, hidden: bool) -> WorkOut:
        work = self.work(work_id)
        with self._db.connect() as conn:
            if hidden:
                conn.execute(
                    "INSERT OR IGNORE INTO hidden_works (work_id, hidden_at) VALUES (?, ?)", (work_id, utc_now())
                )
            else:
                conn.execute("DELETE FROM hidden_works WHERE work_id = ?", (work_id,))
        return self._out(work, self.document_for(work_id), hidden)


def shipped_files(root: Traversable | None = None) -> Iterable[Path]:
    """Every file the catalog ships (for tests and the size report)."""
    base = root or _package()
    for folder in ("works", "covers", "presets"):
        yield from (Path(str(item)) for item in base.joinpath(folder).iterdir() if item.is_file())


def copy_to(destination: Path, root: Traversable | None = None) -> None:
    """A plain-folder copy of the catalog data (tests build a tampered catalog from it)."""
    base = root or _package()
    for name in ("catalog.json", "CREDITS.md"):
        shutil.copyfile(str(base.joinpath(name)), destination / name)
    for folder in ("works", "covers", "presets"):
        (destination / folder).mkdir(exist_ok=True)
        for item in base.joinpath(folder).iterdir():
            shutil.copyfile(str(item), destination / folder / item.name)
