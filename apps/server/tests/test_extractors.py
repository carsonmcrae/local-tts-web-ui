# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Tests for type sniffing and every document extractor, including malformed input.

Scope: TXT encodings and chapter detection, Markdown structure, PDF text/outline/header-footer/
hyphenation/scanned/corrupt handling, DOCX headings and tables, EPUB chapters via nav and NCX, and
type/extension mismatches.
Does NOT belong: Hostile archive tests (test_document_security.py) or HTTP tests.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from builders import make_docx, make_epub, make_pdf
from ltts.documents import extract_pdf
from ltts.documents.extract_markdown import markdown_to_extraction
from ltts.documents.extract_text import decode_bytes, text_to_extraction
from ltts.documents.extractors import extract
from ltts.documents.sniff import detect_type
from ltts.documents.structures import DocumentType, ExtractionLimits
from ltts.errors import DocumentExtractionError, UnsupportedDocumentError

LIMITS = ExtractionLimits(
    max_text_chars=1_000_000,
    max_pdf_pages=50,
    max_archive_entries=500,
    max_archive_uncompressed_bytes=20 * 1024 * 1024,
    max_compression_ratio=200,
)


def write(tmp_path: Path, name: str, data: bytes) -> Path:
    path = tmp_path / name
    path.write_bytes(data)
    return path


def texts(extraction) -> list[str]:  # type: ignore[no-untyped-def]
    return [block.text for section in extraction.sections for block in section.blocks]


# -- sniffing -------------------------------------------------------------------
def test_detects_real_types(tmp_path: Path) -> None:
    assert detect_type(write(tmp_path, "a.pdf", make_pdf([["Hi."]])), "a.pdf") is DocumentType.PDF
    assert detect_type(write(tmp_path, "b.epub", make_epub([("C1", "<p>Hi.</p>")])), "b.epub") is DocumentType.EPUB
    assert detect_type(make_docx(tmp_path / "c.docx", [("Normal", "Hi.")]), "c.docx") is DocumentType.DOCX
    assert detect_type(write(tmp_path, "d.md", b"# Hi"), "d.md") is DocumentType.MARKDOWN


@pytest.mark.parametrize(
    ("name", "data", "code"),
    [
        ("evil.exe", b"MZ\x90\x00", "unsupported_file_type"),
        ("fake.pdf", b"just text pretending", "content_mismatch"),
        ("fake.docx", make_pdf([["x"]]), "content_mismatch"),
        ("binary.txt", b"\x00\x01\x02\x03" * 100, "content_mismatch"),
        ("empty.txt", b"", "empty_document"),
        ("noext", b"hello", "unsupported_file_type"),
    ],
)
def test_rejects_mismatched_or_unsupported(tmp_path: Path, name: str, data: bytes, code: str) -> None:
    with pytest.raises(UnsupportedDocumentError) as error:
        detect_type(write(tmp_path, name, data), name)
    assert error.value.code == code


# -- text & markdown -------------------------------------------------------------
@pytest.mark.parametrize(
    "raw",
    [
        "Café – ok".encode(),
        b"\xef\xbb\xbfCaf\xc3\xa9 \xe2\x80\x93 ok",
        "Café – ok".encode("utf-16"),
        b"Caf\xe9 \x96 ok",
    ],
)
def test_decodes_common_encodings(raw: bytes) -> None:
    assert decode_bytes(raw) == "Café – ok"


def test_text_chapters_become_sections() -> None:
    extraction = text_to_extraction("Chapter 1\n\nIt began.\n\nChapter 2\n\nIt ended.", "Story")
    assert [s.title for s in extraction.sections] == ["Chapter 1", "Chapter 2"]
    assert texts(extraction) == ["Chapter 1", "It began.", "Chapter 2", "It ended."]


def test_single_newline_text_is_one_paragraph_per_line() -> None:
    assert texts(text_to_extraction("one\ntwo\nthree", None)) == ["one", "two", "three"]


def test_markdown_structure_links_images_and_code() -> None:
    source = "# Title\n\nIntro with [a link](https://x.y).\n\n## Part\n\n### Sub\n\nBody ![diagram](d.png)\n\n```\ncode()\n```\n\n<script>bad()</script>"
    extraction = markdown_to_extraction(source, None)
    assert extraction.title == "Title"
    assert [s.title for s in extraction.sections] == ["Title", "Part"]
    assert texts(extraction) == [
        "Title",
        "Intro with a link.",
        "Part",
        "Sub",
        "Body diagram",
        "(A code block is omitted here.)",
        "<script>bad()</script>",
    ]


# -- PDF -------------------------------------------------------------------------
def test_pdf_rebuilds_paragraphs_and_dehyphenates(tmp_path: Path) -> None:
    lines = [
        "The keeper climbed the long spiral staircase of the old light-",
        "house every evening without fail, counting each step as he went up.",
        "Short end.",
        "A new paragraph begins here with a capital letter and keeps going on.",
    ]
    result = extract(write(tmp_path, "p.pdf", make_pdf([lines])), DocumentType.PDF, "p", LIMITS)
    assert texts(result) == [
        "The keeper climbed the long spiral staircase of the old lighthouse every evening without fail, "
        "counting each step as he went up. Short end.",
        "A new paragraph begins here with a capital letter and keeps going on.",
    ]
    assert result.page_count == 1


def test_pdf_strips_running_headers_footers_and_page_numbers(tmp_path: Path) -> None:
    bodies = ["Rain fell over the quiet harbour town.", "Nobody answered the knock at first.",
              "The lamp flickered twice and went out.", "Morning came slowly over the hills.",
              "She folded the letter and smiled."]  # fmt: skip
    pages = [["THE BOOK TITLE", body, str(n)] for n, body in enumerate(bodies, start=1)]
    result = extract(write(tmp_path, "h.pdf", make_pdf(pages)), DocumentType.PDF, "h", LIMITS)
    joined = " ".join(texts(result))
    assert "THE BOOK TITLE" not in joined
    assert "The lamp flickered twice" in joined
    assert [s.title for s in result.sections] == [f"Page {n}" for n in range(1, 6)]


def test_pdf_outline_defines_chapters(tmp_path: Path) -> None:
    pages = [["Front matter text here."], ["Chapter One"], ["It was a dark night."], ["Chapter Two"]]
    pdf = make_pdf(pages, outline=[("Chapter One", 1), ("Chapter Two", 3)])
    result = extract(write(tmp_path, "o.pdf", pdf), DocumentType.PDF, "o", LIMITS)
    assert [s.title for s in result.sections] == ["Opening pages", "Chapter One", "Chapter Two"]
    assert result.sections[1].blocks[0].kind == "heading"


def test_pdf_chapters_start_at_their_heading_partway_down_a_page(tmp_path: Path) -> None:
    pages = [
        ["Chapter One", "It was a dark night and the wind rattled every window in the house."],
        ["The storm finally passed a little before dawn on the second day.", "Chapter Two",
         "Morning came slowly over the hills behind the old farmhouse."],
        ["Still the second chapter, which keeps going onto this page.", "Chapter Three: A Long Title That",
         "Wraps Onto A Second Line", "Day three began with rain against the glass."],
        ["Day three went on without a heading for the fourth outline entry."],
    ]  # fmt: skip
    outline = [("Chapter One", 0), ("Chapter Two", 1),
               ("Chapter Three: A Long Title That Wraps Onto A Second Line", 2), ("Epilogue", 3)]  # fmt: skip
    result = extract(write(tmp_path, "m.pdf", make_pdf(pages, outline=outline)), DocumentType.PDF, "m", LIMITS)
    one, two, three, epilogue = result.sections
    assert one.blocks[-1].text.startswith("The storm finally passed")  # the page's first lines stay in chapter one
    assert (two.blocks[0].kind, two.blocks[0].text) == ("heading", "Chapter Two")
    assert two.page == 2 and two.blocks[-1].text.startswith("Still the second chapter")
    assert three.blocks[0].text == "Chapter Three: A Long Title That Wraps Onto A Second Line"
    assert three.blocks[0].kind == "heading"
    assert epilogue.blocks[0].kind == "paragraph"  # no heading on the page: the section starts at the page


def test_pdf_heading_search_checks_the_next_page_and_keeps_order(tmp_path: Path) -> None:
    pages = [["Part One", "The first part opens here with a long enough line of text."],
             ["Still part one on the page the outline points at for part two."],
             ["Part Two", "The second part really starts here on the following page."]]  # fmt: skip
    result = extract(
        write(tmp_path, "n.pdf", make_pdf(pages, outline=[("Part One", 0), ("Part Two", 1)])),
        DocumentType.PDF,
        "n",
        LIMITS,
    )
    assert [s.title for s in result.sections] == ["Part One", "Part Two"]
    assert result.sections[0].blocks[-1].text.startswith("Still part one") and result.sections[1].page == 3
    lines = [["Alpha", "text"], ["Gamma", "Beta", "more"]]
    starts, ends = extract_pdf._chapter_starts(lines, [(0, "Alpha"), (1, "Beta"), (1, "Gamma")])
    assert [s.title for s in starts] == ["Alpha", "Beta"] and ends == {0: 0, 3: 3}  # Gamma would go backwards
    assert extract_pdf._heading_span(["***"], "***") is None
    assert extract_pdf._heading_span(["Chapter Three:", "Something else"], "Chapter Three: The Storm") is None


def test_scanned_pdf_is_reported_not_silently_accepted(tmp_path: Path) -> None:
    with pytest.raises(DocumentExtractionError) as error:
        extract(write(tmp_path, "s.pdf", make_pdf([[], []], image_only=True)), DocumentType.PDF, "s", LIMITS)
    assert error.value.code == "scanned_pdf"


def test_partially_scanned_pdf_warns(tmp_path: Path) -> None:
    pdf = make_pdf([["Readable page with enough text to count as text."], []])
    result = extract(write(tmp_path, "m.pdf", pdf), DocumentType.PDF, "m", LIMITS)
    assert result.warnings and "1 of 2 pages" in result.warnings[0]


def test_corrupt_pdf_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(DocumentExtractionError) as error:
        extract(write(tmp_path, "c.pdf", b"%PDF-1.4\n garbage without objects"), DocumentType.PDF, "c", LIMITS)
    assert error.value.code in {"corrupt_document", "empty_document"}


def test_pdf_page_limit(tmp_path: Path) -> None:
    limits = ExtractionLimits(1_000_000, 2, 500, 10_000_000, 200)
    with pytest.raises(DocumentExtractionError) as error:
        extract(write(tmp_path, "l.pdf", make_pdf([["a"], ["b"], ["c"]])), DocumentType.PDF, "l", limits)
    assert error.value.code == "page_limit"


# -- DOCX ------------------------------------------------------------------------
def test_docx_headings_tables_and_title(tmp_path: Path) -> None:
    path = make_docx(
        tmp_path / "d.docx",
        [("Heading 1", "Introduction"), ("Normal", "Hello there."), ("Heading 3", "Detail"), ("Normal", "More."),
         ("Heading 2", "Next part"), ("Normal", "The end.")],
        title="Report",
        table=[["Name", "Value"], ["Alpha", "1"]],
    )  # fmt: skip
    result = extract(path, DocumentType.DOCX, "d", LIMITS)
    assert result.title == "Report"
    assert [s.title for s in result.sections] == ["Introduction", "Next part"]
    assert texts(result)[-2:] == ["Name; Value", "Alpha; 1"]
    assert any(b.kind == "heading" and b.text == "Detail" for b in result.sections[0].blocks)


# -- EPUB ------------------------------------------------------------------------
def test_epub_chapters_use_navigation_titles_and_skip_scripts(tmp_path: Path) -> None:
    data = make_epub([("Opening", "<p>First &amp; best.</p>"), ("Second", "<p>Another&nbsp;one.</p>")])
    result = extract(write(tmp_path, "b.epub", data), DocumentType.EPUB, "b", LIMITS)
    assert result.title == "Test Book"
    assert [s.title for s in result.sections] == ["Opening", "Second"]
    body = texts(result)
    assert "First & best." in body and "Another one." in body
    assert not any("alert" in text or "color:red" in text for text in body)


def test_epub_without_nav_falls_back_to_headings(tmp_path: Path) -> None:
    result = extract(
        write(tmp_path, "n.epub", make_epub([("Alpha", "<p>x y z.</p>")], nav=False)), DocumentType.EPUB, "n", LIMITS
    )
    assert [s.title for s in result.sections] == ["Alpha"]


def test_document_with_no_text_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(DocumentExtractionError) as error:
        extract(write(tmp_path, "e.txt", b"   \n\n\t  \n"), DocumentType.TEXT, "e", LIMITS)
    assert error.value.code in {"empty_document"}


def test_text_limit(tmp_path: Path) -> None:
    limits = ExtractionLimits(10, 50, 500, 10_000_000, 200)
    with pytest.raises(DocumentExtractionError) as error:
        extract(
            write(tmp_path, "t.txt", b"This is definitely longer than ten characters."), DocumentType.TEXT, "t", limits
        )
    assert error.value.code == "text_limit"
