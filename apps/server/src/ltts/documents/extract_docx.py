# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: DOCX extraction with python-docx after container validation.

Scope: Pre-validates the ZIP (limits, no XML entity declarations) before python-docx touches it;
walks body paragraphs and tables in document order; Title/Heading 1–2 styles start sections and
deeper headings become heading blocks. Macros and embedded objects are never executed or read.
Does NOT belong: Generic ZIP checks (``safezip.py``).
"""

from __future__ import annotations

from pathlib import Path

import docx
from docx.document import Document as DocxDocument
from docx.table import Table
from docx.text.paragraph import Paragraph

from ltts.documents.normalize import clean_inline
from ltts.documents.safezip import SafeZip
from ltts.documents.structures import Block, ExtractedSection, Extraction, ExtractionLimits
from ltts.errors import DocumentExtractionError


def _heading_level(paragraph: Paragraph) -> int | None:
    name = (paragraph.style.name if paragraph.style is not None else "") or ""
    if name == "Title":
        return 1
    if name.startswith("Heading "):
        suffix = name.removeprefix("Heading ").strip()
        return int(suffix) if suffix.isdigit() else None
    return None


def _starts_section(level: int | None) -> bool:
    """Title and Heading 1–2 open a new section; deeper headings stay inside the current one."""
    return level is not None and level <= 2


def _table_rows(table: Table) -> list[tuple[str, int | None]]:
    """Each row read as its distinct non-empty cells joined with semicolons (merged cells repeat)."""
    rows: list[tuple[str, int | None]] = []
    for row in table.rows:
        cells = [clean_inline(cell.text) for cell in row.cells]
        unique = list(dict.fromkeys(c for c in cells if c))
        if unique:
            rows.append(("; ".join(unique), None))
    return rows


def _iter_blocks(document: DocxDocument) -> list[tuple[str, int | None]]:
    items: list[tuple[str, int | None]] = []
    for element in document.iter_inner_content():
        if isinstance(element, Paragraph):
            items.append((element.text, _heading_level(element)))
        else:  # iter_inner_content yields only paragraphs and tables
            items.extend(_table_rows(element))
    return items


def _sections(items: list[tuple[str, int | None]], first_title: str) -> list[ExtractedSection]:
    sections: list[ExtractedSection] = []
    current = ExtractedSection(title=first_title)
    for raw_text, level in items:
        text = clean_inline(raw_text)
        if not text:
            continue
        if _starts_section(level):
            if current.blocks:
                sections.append(current)
            current = ExtractedSection(title=text[:200], blocks=[Block("heading", text)])
        else:
            current.blocks.append(Block("heading" if level else "paragraph", text))
    if current.blocks:
        sections.append(current)
    return sections


def extract_docx_file(path: Path, title: str | None, limits: ExtractionLimits) -> Extraction:
    with SafeZip(path, limits) as container:
        container.assert_no_entities()
    try:
        document = docx.Document(str(path))
    except Exception as exc:  # python-docx raises a variety of parser errors for damaged files
        raise DocumentExtractionError("The DOCX file could not be read.", code="corrupt_document") from exc

    core_title = (document.core_properties.title or "").strip() or None
    sections = _sections(_iter_blocks(document), core_title or title or "Document")
    return Extraction(title=core_title or title, sections=sections)
