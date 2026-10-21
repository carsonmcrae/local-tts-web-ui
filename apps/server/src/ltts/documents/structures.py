# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Plain data structures passed between extraction, segmentation and storage.

Scope: Extractor output (sections of blocks), segmentation output, and the limits object handed to
sandboxed extractors. All are picklable so they can cross the extraction process boundary. A block
(and its segments) can be page furniture or a page's footnote, kept so the reader can see it and
skipped when reading.
Does NOT belong: API response models (``schemas.py``) or persistence (``repository.py``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal


class DocumentType(StrEnum):
    TEXT = "txt"
    MARKDOWN = "md"
    PDF = "pdf"
    DOCX = "docx"
    EPUB = "epub"
    HTML = "html"
    FB2 = "fb2"
    MOBI = "mobi"
    PASTE = "paste"


BlockKind = Literal["heading", "paragraph"]
Boundary = Literal["sentence", "paragraph", "section"]
# A PDF's running header or footer, page number, or footnote text at the foot of a page.
Furniture = Literal["header", "footer", "page_number", "footnote_text"]


@dataclass(slots=True)
class Block:
    kind: BlockKind
    text: str
    furniture: Furniture | None = None


@dataclass(slots=True)
class ExtractedSection:
    title: str
    blocks: list[Block] = field(default_factory=list)
    page: int | None = None


@dataclass(slots=True)
class Extraction:
    title: str | None
    sections: list[ExtractedSection]
    page_count: int | None = None
    warnings: list[str] = field(default_factory=list)
    # Book metadata some formats carry (FB2 title-info, MOBI EXTH). Not stored yet.
    author: str | None = None
    language: str | None = None


@dataclass(slots=True, frozen=True)
class ExtractionLimits:
    max_text_chars: int
    max_pdf_pages: int
    max_archive_entries: int
    max_archive_uncompressed_bytes: int
    max_compression_ratio: int


@dataclass(slots=True)
class Segment:
    index: int
    section_index: int
    paragraph_index: int
    kind: BlockKind
    boundary: Boundary
    text: str
    furniture: Furniture | None = None


@dataclass(slots=True)
class SectionInfo:
    index: int
    title: str
    start_segment: int
    segment_count: int
    page: int | None = None
