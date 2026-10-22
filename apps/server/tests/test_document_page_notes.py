# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for footnote text at the foot of PDF pages (``documents/page_notes.py`` and the PDF extractor).

Scope: The run of small-type lines a page ends with, below its text and starting with a number or
symbol that marks a word on the page, is footnote text, one block per note (its lines joined), skipped
as ``footnote_text``; a page number after it is still a page number. Kept: lines in the body's size,
small lines above the text, a note continued from the page before, a note whose number marks nothing on
its page, unmeasured lines, and "1.5 cm" and the like. The numbers of a PDF's footnotes let glued
markers ("ended.1") be left unread. The extractor measures real lines from PDFium's character boxes.
Does NOT belong: Running headers and page numbers (test_document_cleanup.py) or the API (test_document_corpus.py).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from builders import make_pdf
from ltts.documents.cleanup import SUPERSCRIPT_DIGITS, find
from ltts.documents.extract_pdf import extract_pdf_file
from ltts.documents.page_notes import LineBox, find_notes, note_label
from ltts.documents.segmenter import segment_extraction
from ltts.documents.structures import ExtractionLimits, Furniture

ONE = SUPERSCRIPT_DIGITS[1]
LIMITS = ExtractionLimits(1_000_000, 50, 500, 20 * 1024 * 1024, 200)
BODY = ["The war ended.1 Nobody expected it.", "The treaty was signed,2 and peace held."]
NOTES = ["1 Smith, The War, page 4.", "2 Jones, Peace, page 9."]


def body(line: int) -> LineBox:
    """A line of 11 pt text, ``line`` lines down from the top of the page."""
    return LineBox(12.3, 745.0 - 14 * line, 757.3 - 14 * line)


def small(line: int, top: float = 98.0) -> LineBox:
    """A line of 8 pt text, ``line`` lines down from ``top``."""
    return LineBox(8.9, top - 8.9 - 10 * line, top - 10 * line)


def notes_on(lines: list[str], boxes: list[LineBox | None], taken: dict[int, Furniture] | None = None) -> list[int]:
    """The positions of one page's footnote lines."""
    return sorted(find_notes([lines], [boxes], [taken or {}])[0])


@pytest.mark.parametrize(
    ("line", "label"),
    [
        ("1 Smith, page 4.", "1"),
        ("12. Smith, page 4.", "12"),
        ("3) Smith, page 4.", "3"),
        ("4Smith, page 4.", "4"),  # a raised number set close to the note, as TeX does
        ("3rd edition, page 4.", None),
        (f"{ONE}Smith, page 4.", "1"),
        ("* A note.", "*"),
        ("\N{DAGGER}Translated by the author.", "\N{DAGGER}"),
        ("1.5 cm of rain fell.", None),
        ("2019 saw the first trial.", None),
        ("Smith, page 4.", None),
    ],
)
def test_a_note_starts_with_its_number_or_symbol(line: str, label: str | None) -> None:
    assert note_label(line) == label


def test_small_lines_below_the_text_that_a_marker_points_to_are_notes() -> None:
    lines = ["THE WAR YEARS", *BODY, NOTES[0], "2 Jones, Peace, page 9, which runs", "on to a second line.", "12"]
    boxes = [body(0), body(1), body(2), small(0), small(1), small(2), LineBox(12.3, 33.7, 46.0)]
    assert notes_on(lines, boxes, {0: "header"}) == [3, 4, 5]  # never the header, nor the page number after


@pytest.mark.parametrize(
    ("first_note", "box", "notes"),
    [
        ("1 Smith, The War, page 4.", body(5), [3]),  # set in the body's size: only the small note after it
        ("1 Smith, The War, page 4.", small(0, top=790.0), []),  # small, but above the text
        ("Smith, The War, page 4, continued.", small(0), []),  # continued from the page before
        ("7 Smith, The War, page 4.", small(0), []),  # nothing on the page is marked 7
        ("1 Smith, The War, page 4.", None, [3]),  # couldn't be measured
    ],
)
def test_lines_that_dont_read_as_this_pages_notes_are_kept(
    first_note: str, box: LineBox | None, notes: list[int]
) -> None:
    assert notes_on([*BODY, first_note, NOTES[1]], [body(0), body(1), box, small(1)]) == notes


@pytest.mark.parametrize(
    ("marked", "note"),
    [(f"The war{ONE} ended.", f"{ONE} Smith, page 4."), ("The war ended.* Then", "* A note on the war."),
     ("The war1 ended.", "1 Smith, page 4.")],
)  # fmt: skip
def test_raised_glued_and_symbol_markers_point_to_notes(marked: str, note: str) -> None:
    assert notes_on([marked, note], [body(0), small(0)]) == [1]


def test_a_document_without_measured_lines_has_no_notes() -> None:
    assert find_notes([BODY], [[None, None]], [{}]) == [{}]


PAGES = [
    ["The war ended.1 Nobody expected it to end so soon, and the", "treaty was signed,2 so peace held for"],
    ["many years after.3 Then trade came back to the harbour."],
    ["Morning came slowly over the hills behind the farm."],
]
STORY = (
    "The war ended.1 Nobody expected it to end so soon, and the treaty was signed,2 so peace held for many "
    "years after.3 Then trade came back to the harbour."
)


def war_pdf(tmp_path: Path, notes: list[list[str]], note_size: float = 8) -> Path:
    path = tmp_path / "war.pdf"
    path.write_bytes(make_pdf(PAGES, notes=notes, footers=["1", "2", "3"], note_size=note_size))
    return path


def test_a_pdfs_footnotes_are_blocks_of_their_own_one_per_note(tmp_path: Path) -> None:
    notes = [["1 Smith, The War, page 4.", "2 Jones, Peace, page 9, which runs on to a sec-", "ond line."],
             ["3 Brown, page 2."], []]  # fmt: skip
    extraction = extract_pdf_file(war_pdf(tmp_path, notes), "war", LIMITS)
    # The story runs on across the page break, its notes and page number set apart after it.
    assert [(block.furniture, block.text) for section in extraction.sections for block in section.blocks] == [
        (None, STORY),
        ("footnote_text", "1 Smith, The War, page 4."),
        ("footnote_text", "2 Jones, Peace, page 9, which runs on to a second line."),
        ("page_number", "1"),
        ("footnote_text", "3 Brown, page 2."),
        ("page_number", "2"),
        (None, "Morning came slowly over the hills behind the farm."),
        ("page_number", "3"),
    ]


def test_notes_in_the_bodys_size_are_read(tmp_path: Path) -> None:
    extraction = extract_pdf_file(war_pdf(tmp_path, [["1 Smith, The War, page 4."], [], []], 11), "war", LIMITS)
    assert "footnote_text" not in {block.furniture for section in extraction.sections for block in section.blocks}


def test_footnote_numbers_let_glued_markers_be_left_unread(tmp_path: Path) -> None:
    notes = [["1 Smith, The War, page 4.", "2 Jones, Peace, page 9."], ["3 Brown, page 2."], []]
    segments, sections = segment_extraction(extract_pdf_file(war_pdf(tmp_path, notes), "war", LIMITS))
    found = find(segments, sections, paged=True)
    assert sorted(set(found.skips.values())) == ["footnote_text", "page_number"]
    assert [written for pairs in found.footnotes.values() for written, _ in pairs] == ["ended.1", "signed,2", "after.3"]
