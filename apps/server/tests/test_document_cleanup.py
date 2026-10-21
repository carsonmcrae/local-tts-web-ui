# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for finding what a document shouldn't read aloud (``documents/cleanup.py``).

Scope: Running headers (with page numbers in them) and footers repeated on many pages, page numbers
that count along with the pages (arabic, Roman, "Page 3 of 10"), kept in a PDF as blocks of their own
in reading order; page-number paragraphs in documents without pages; superscript and glued footnote
markers. Just as much, what must never be touched: short documents, a heading on two pages, chapter
numbers, outline titles, years, measurements, decimals, list numbers, verse numbers, sentences that
start with a number, and glued digits without notes. The notice an import adds.
Does NOT belong: Storing, undoing or applying the cleanup, or the API (test_document_cleanup_api.py).
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import pytest

from builders import make_pdf
from ltts.documents.cleanup import SUPERSCRIPT_DIGITS, Findings, describe, find, find_furniture
from ltts.documents.extract_pdf import extract_pdf_file
from ltts.documents.segmenter import segment_extraction
from ltts.documents.structures import Block, ExtractedSection, Extraction, ExtractionLimits

ONE, TWO, THREE, FOUR = (SUPERSCRIPT_DIGITS[n] for n in range(1, 5))
LIMITS = ExtractionLimits(1_000_000, 50, 500, 20 * 1024 * 1024, 200)
STORY = [
    "Rain fell over the quiet harbour town all night.",
    "Nobody answered the knock at the door at first.",
    "The lamp in the window flickered twice and went out.",
    "Morning came slowly over the hills behind the farm.",
    "She folded the letter and put it in her coat.",
    "The ferry left before the fog had lifted.",
    "Gulls followed the boats out past the long pier.",
]


def pages_with(top: Sequence[str | None], bottom: Sequence[str | None]) -> list[list[str]]:
    """Pages of body text with the given first and last lines (None: the page has none)."""
    pages = []
    for number, (first, last) in enumerate(zip(top, bottom, strict=True)):
        body = [STORY[number % len(STORY)], STORY[(number + 3) % len(STORY)]]
        pages.append([line for line in (first, *body, last) if line])
    return pages


def found_on_pages(pages: list[list[str]], headings: tuple[str, ...] = ()) -> list[dict[int, str]]:
    """Each page's furniture as {position: reason}, counting positions from the page's last line as negative."""
    return [
        {(at if at == 0 else at - len(lines)): reason for at, reason in found.items()}
        for lines, found in zip(pages, find_furniture(pages, headings), strict=True)
    ]


def findings(*sections: tuple[str, list[str]], paged: bool = False) -> Findings:
    """The cleanup's finds in a document of (title, blocks) sections; a block "# Title" is a heading."""
    extraction = Extraction(
        title=None,
        sections=[
            ExtractedSection(
                title, [Block("heading", b[2:]) if b.startswith("# ") else Block("paragraph", b) for b in blocks]
            )
            for title, blocks in sections
        ],
    )
    segments, infos = segment_extraction(extraction)
    return find(segments, infos, paged=paged)


def markers(found: Findings) -> list[str]:
    """Every word written with its footnote marker that won't be spoken with it."""
    return [written for pairs in found.footnotes.values() for written, _ in pairs]


# -- headers, footers and page numbers on pages ------------------------------------
def test_running_headers_with_page_numbers_in_them_and_page_footers_are_found() -> None:
    pages = pages_with([f"THE SILENT HARBOUR {n + 10}" for n in range(6)], [f"Page {n} of 6" for n in range(1, 7)])
    assert found_on_pages(pages) == [{0: "header", -1: "page_number"}] * 6


def test_roman_and_arabic_page_numbers_count_along_with_the_pages() -> None:
    bottom = ["i", "ii", "iii", "iv", "1", "2", "3", "- 4 -"]
    pages = pages_with([None] * 8, bottom)
    assert found_on_pages(pages) == [{-1: "page_number"}] * 8


def test_a_running_footer_repeated_on_most_pages_is_found() -> None:
    notice = "Copyright 2024 Harbour Press"
    pages = pages_with([None] * 5, [notice, None, notice, notice, notice])
    assert [list(found.values()) for found in found_on_pages(pages)] == [["footer"], [], *[["footer"]] * 3]


def test_short_documents_are_left_alone() -> None:
    pages = pages_with(["THE SILENT HARBOUR"] * 2, ["1", "2"])
    assert found_on_pages(pages) == [{}, {}]


def test_a_heading_on_two_pages_a_chapter_number_and_chapter_lines_are_kept() -> None:
    top = ["Summary", None, "Chapter 12", "Summary", "3", None]
    pages = pages_with(top, [str(n) for n in range(1, 7)])
    # Only the counting page numbers: "Summary" is on two pages, "3" doesn't count along, "Chapter 12" never.
    assert found_on_pages(pages) == [{-1: "page_number"}] * 6


@pytest.mark.parametrize(("headings", "expected"), [((), "header"), (("Part One",), None)])
def test_outline_titles_are_never_headers(headings: tuple[str, ...], expected: str | None) -> None:
    pages = pages_with(["Part One"] * 4 + [None] * 2, [None] * 6)
    assert [found.get(0) for found in found_on_pages(pages, headings)][:4] == [expected] * 4


def test_a_pdf_keeps_its_furniture_as_blocks_in_reading_order(tmp_path: Path) -> None:
    pages = [
        [
            "THE SILENT HARBOUR",
            "The keeper climbed the long spiral staircase of the old lighthouse every",
            "Page 1 of 4",
        ],
        ["THE SILENT HARBOUR", "evening without fail, counting every step as he went up.", "Page 2 of 4"],
        ["THE SILENT HARBOUR", "Rain fell over the quiet harbour town all night long.", "Page 3 of 4"],
        ["THE SILENT HARBOUR", "Morning came slowly over the hills behind the town.", "Page 4 of 4"],
    ]
    path = tmp_path / "harbour.pdf"
    path.write_bytes(make_pdf(pages))
    sections = extract_pdf_file(path, "harbour", LIMITS).sections
    # The paragraph running onto page 2 stays whole; page 2's furniture follows it, in its section.
    assert [s.title for s in sections] == ["Page 1", "Page 3", "Page 4"]
    assert [(block.furniture, block.text[:20]) for block in sections[0].blocks] == [
        ("header", "THE SILENT HARBOUR"),
        (None, "The keeper climbed t"),
        ("page_number", "Page 1 of 4"),
        ("header", "THE SILENT HARBOUR"),
        ("page_number", "Page 2 of 4"),
    ]
    assert [block.furniture for block in sections[2].blocks] == ["header", None, "page_number"]


# -- page numbers in documents without pages ----------------------------------------
@pytest.mark.parametrize(
    ("numbers", "skipped"),
    [
        (["Page 1", "Page 2", "Page 3"], 3),
        (["- 7 -", "- 8 -", "- 9 -"], 3),
        (["1", "2", "3"], 0),  # bare numbers could be chapter numbers
        (["Page 1", "Page 2"], 0),  # too few to trust
        (["Page 3", "Page 2", "Page 1"], 0),  # they don't count up
    ],
)
def test_page_number_paragraphs_count_up_through_a_document(numbers: list[str], skipped: int) -> None:
    blocks = [block for number in numbers for block in ("The tide turned. Boats came home.", number)]
    found = findings(("Chapter", blocks))
    assert list(found.skips.values()) == ["page_number"] * skipped
    assert findings(("Chapter", blocks), paged=True).skips == {}  # a PDF's are found on its pages


# -- footnote markers ----------------------------------------------------------------------
def test_superscript_footnote_markers_are_left_unread() -> None:
    found = findings(("One", [f"The war{ONE} ended in spring. Nobody expected it.{TWO} The treaty held."]))
    assert markers(found) == [f"war{ONE}", f"it.{TWO}"]
    assert [spoken for pairs in found.footnotes.values() for _, spoken in pairs] == ["war", "it."]


@pytest.mark.parametrize(
    "text",
    [
        "In 1999, the river flooded the town.",
        "Chapter 12",
        "The bag weighs 3.5 kg and costs 4.99 today.",
        f"The room is 20 m{TWO} and the box 8 cm{THREE}.",
        f"The floor is 40 metres{TWO} in all.",
        f"Einstein wrote E = mc{TWO} on the board.",
        f"The curve (a+b){TWO} grows fast.",
        "12 people came to the meeting.",
        "1. Make the tea.",
        "See Fig.12 and No.3 for the details.",
        "Psalm 23:4 is often read aloud.",
        f"The value of x{TWO} grows.",
    ],
)
def test_numbers_that_are_not_footnote_markers_are_kept(text: str) -> None:
    assert findings(("One", [text])).footnotes == {}


def test_superscript_verse_numbers_are_kept() -> None:
    verses = f"{ONE}In the beginning was the word. {TWO}And the earth was dark. {THREE}And there was light.{FOUR} Then"
    assert findings(("Genesis", [verses])).footnotes == {}


BODY = [
    "The war ended.1 Nobody expected it.",
    "The treaty was signed,2 and peace held.",
    "Trade came back.3 Ships sailed.",
]
NOTES = ["1. Smith, page 4.", "2. Jones, page 9.", "3. Brown, page 2."]


def test_glued_markers_are_left_unread_when_the_notes_hold_them() -> None:
    by_section = findings(("Chapter", BODY), ("Notes", NOTES))
    by_heading = findings(("Chapter", [*BODY, "# Notes", *NOTES]))
    assert markers(by_section) == markers(by_heading) == ["ended.1", "signed,2", "back.3"]


@pytest.mark.parametrize(
    "sections",
    [
        [("Chapter", BODY)],  # no notes: these could be verse numbers
        [("Chapter", BODY[:2]), ("Notes", NOTES)],  # too few to trust
        [("Chapter", BODY), ("Notes", ["See the index.", "Thanks to all."])],  # notes without numbers
        [("Chapter", BODY), ("Afterword", NOTES)],  # numbered paragraphs that aren't notes
    ],
)
def test_glued_digits_are_kept_without_notes_holding_them(sections: list[tuple[str, list[str]]]) -> None:
    assert findings(*sections).footnotes == {}


def test_furniture_sentences_are_skipped_and_never_searched_for_markers() -> None:
    extraction = Extraction(
        title=None,
        sections=[
            ExtractedSection(
                "Page 1", [Block("paragraph", f"HARBOUR{ONE} 12", "header"), Block("paragraph", f"The war{ONE} ended.")]
            )
        ],
    )
    segments, infos = segment_extraction(extraction)
    found = find(segments, infos, paged=True)
    assert found.skips == {0: "header"} and markers(found) == [f"war{ONE}"]
    assert found.counts() == {
        "header": 1, "footer": 0, "page_number": 0, "footnote_text": 0, "footnote": 1, "citation": 0,
    }  # fmt: skip


@pytest.mark.parametrize(
    ("counts", "notice"),
    [
        ({"header": 20, "page_number": 22}, "Skipped 42 running headers and page numbers when reading aloud"),
        ({"footer": 1}, "Skipped 1 running footer when reading aloud; you can review it."),
        ({"header": 2, "footnote": 5}, "Skipped 2 running headers, and 5 footnote markers when reading aloud"),
        ({"footnote": 0}, None),
    ],
)
def test_the_import_notice_says_what_was_skipped(counts: dict[str, int], notice: str | None) -> None:
    said = describe(counts)
    assert said == notice if notice is None else (said or "").startswith(notice)
