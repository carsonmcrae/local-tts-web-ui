# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Edge-case tests for PDF extraction that the happy-path extractor tests do not reach.

Scope: Page-number line forms, paragraph rebuilding across hyphenated and lowercase line breaks,
outline handling (unreadable, nested, duplicate, out-of-range and untitled entries, chapters that
start on the first page, chapters whose pages are blank), password-protected and page-less files,
and the text limit enforced while pages are read.
Does NOT belong: Typical PDFs (test_extractors.py) or sandboxing (test_document_security.py).
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pypdfium2 as pdfium
import pytest

from builders import make_pdf
from ltts.documents import extract_pdf
from ltts.documents.extract_pdf import (
    _group,
    _is_page_number,
    _outline_starts,
    _Paragraph,
    _paragraphs,
    _Start,
    extract_pdf_file,
)
from ltts.documents.structures import ExtractionLimits
from ltts.errors import DocumentExtractionError

LIMITS = ExtractionLimits(1_000_000, 50, 500, 20 * 1024 * 1024, 200)


@pytest.mark.parametrize(
    ("line", "is_number"),
    [
        ("12", True),
        ("Page 12", True),
        ("page 3 of 300", True),
        ("12/300", True),
        ("- 12 -", True),
        ("\N{EN DASH} 7 \N{EN DASH}", True),
        ("xiv", True),
        ("XIV", True),
        ("Chapter 12", False),
        ("12345", False),
        ("12 apples", False),
    ],
)
def test_page_number_lines(line: str, is_number: bool) -> None:
    assert _is_page_number(line) is is_number


def test_lines_join_across_hyphenation_and_lowercase_continuations() -> None:
    pages = [["The keeper climbed the old light-", "house every evening without fail.", "lowercase goes on here"]]
    paragraphs = _paragraphs(pages, set(), {})
    assert [(p.page, p.text) for p in paragraphs] == [
        (0, "The keeper climbed the old lighthouse every evening without fail. lowercase goes on here")
    ]


def _toc_item(level: int, page: int | None, title: str | None) -> SimpleNamespace:
    dest = None if page is None else SimpleNamespace(get_index=lambda: page)
    return SimpleNamespace(level=level, get_dest=lambda: dest, get_title=lambda: title)


def test_outline_keeps_only_top_level_entries_with_a_valid_new_page() -> None:
    items = [
        _toc_item(1, 2, "Second"),
        _toc_item(2, 3, "Nested section"),  # deeper than the top level
        _toc_item(1, None, "No destination"),
        _toc_item(1, 9, "Beyond the last page"),
        _toc_item(1, 2, "Same page again"),
        _toc_item(1, 0, None),  # untitled: named after its page
    ]
    pdf = SimpleNamespace(get_toc=lambda max_depth: iter(items))
    assert _outline_starts(pdf, page_count=5) == [(0, "Page 1"), (2, "Second")]  # type: ignore[arg-type]


def test_unreadable_or_empty_outline_is_ignored() -> None:
    def broken(max_depth: int) -> None:
        raise pdfium.PdfiumError("bad outline")

    assert _outline_starts(SimpleNamespace(get_toc=broken), page_count=3) == []  # type: ignore[arg-type]
    assert _outline_starts(SimpleNamespace(get_toc=lambda max_depth: iter(())), page_count=3) == []  # type: ignore[arg-type]


def test_grouping_skips_chapters_without_text() -> None:
    starts = [_Start(0, 0, "One"), _Start(2, 1, "Empty"), _Start(4, 2, "Two")]
    assert _group([], starts) == []
    paragraphs = [_Paragraph(0, 0, "First."), _Paragraph(2, 5, "Second.")]
    assert [s.title for s in _group(paragraphs, starts)] == ["One", "Two"]


def test_outline_from_the_first_page_and_blank_chapters(tmp_path: Path) -> None:
    pages = [
        ["The first chapter starts right here."],
        ["The first chapter carries on here."],
        [],
        ["The third page belongs to chapter three."],
    ]
    path = tmp_path / "o.pdf"
    path.write_bytes(make_pdf(pages, outline=[("One", 0), ("Blank", 2), ("Three", 3)]))
    result = extract_pdf_file(path, "o", LIMITS)
    assert [s.title for s in result.sections] == ["One", "Three"]  # no "Opening pages", no empty chapter
    assert result.warnings == ["1 of 4 pages had no readable text (likely scanned images) and were skipped."]


def test_password_protected_pdf_is_reported(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def locked(_: str) -> None:
        raise pdfium.PdfiumError("Failed to load document (PDFium: Incorrect password error).")

    monkeypatch.setattr(extract_pdf.pdfium, "PdfDocument", locked)
    with pytest.raises(DocumentExtractionError) as error:
        extract_pdf_file(tmp_path / "locked.pdf", "locked", LIMITS)
    assert error.value.code == "encrypted_document"


class _NoPages:
    """A document PDFium opened but that holds no pages."""

    def __init__(self) -> None:
        self.closed = False

    def __len__(self) -> int:
        return 0

    def close(self) -> None:
        self.closed = True


def test_pdf_without_pages_is_reported(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    document = _NoPages()
    monkeypatch.setattr(extract_pdf, "_open", lambda _path: document)
    with pytest.raises(DocumentExtractionError) as error:
        extract_pdf_file(tmp_path / "none.pdf", "none", LIMITS)
    assert error.value.code == "empty_document" and document.closed


def test_text_limit_is_enforced_while_reading_pages(tmp_path: Path) -> None:
    path = tmp_path / "long.pdf"
    path.write_bytes(make_pdf([["A line that is clearly longer than the tiny limit used here."]]))
    with pytest.raises(DocumentExtractionError) as error:
        extract_pdf_file(path, "long", ExtractionLimits(10, 50, 500, 20 * 1024 * 1024, 200))
    assert error.value.code == "text_limit"
