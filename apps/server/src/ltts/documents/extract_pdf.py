# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Text-PDF extraction with PDFium (pypdfium2), tuned for listening rather than layout.

Scope: Reads each page's text layer, with each line's type size and place (from a few of its characters'
boxes); sets running headers/footers and page numbers (found by ``cleanup.py``) and footnote text at the
foot of pages (``page_notes.py``, one block per note) apart as blocks of their own marked as furniture,
kept to be skipped when reading and never joined into the text; rebuilds paragraphs across line and page
breaks (de-hyphenating); groups paragraphs into chapters from the PDF outline, starting each chapter at
its heading line when the heading is found on the outline's page (outlines only point at pages, and
chapters often start partway down one), or into "Page N" sections when there is none; detects
scanned/image-only PDFs and reports them instead of pretending they were read. Encrypted PDFs are rejected.
Does NOT belong: OCR (not supported) or generic text clean-up (``normalize.py``).
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

from ltts.documents.cleanup import find_furniture, is_top
from ltts.documents.normalize import clean_inline
from ltts.documents.page_notes import LineBox, find_notes, note_label
from ltts.documents.structures import Block, ExtractedSection, Extraction, ExtractionLimits, Furniture
from ltts.errors import DocumentExtractionError

MIN_PAGE_CHARS = 20
_SENTENCE_END = re.compile(r"[.!?:;\"”’)\]]$")
_NEW_BLOCK_START = re.compile(r"^[A-Z0-9\"“‘(\[•\-–—]")  # "[1] Smith" starts a reference
# Paragraphs starting at the same line of the stream: a page's footer comes before a section starting on
# the next page, and that page's header after the section start but before the page's text.
_FOOTER_RANK, _START_RANK, _HEADER_RANK, _TEXT_RANK = range(4)


@dataclass(slots=True)
class _Paragraph:
    page: int
    position: int  # where its first line sits in the line stream (furniture: where its page starts or ends)
    text: str
    furniture: Furniture | None = None
    rank: int = _TEXT_RANK

    def before(self, start: float) -> bool:
        """Whether it comes before a section that starts at line ``start`` of the stream."""
        return (self.position, self.rank) < (start, _START_RANK)


@dataclass(frozen=True, slots=True)
class _Start:
    """Where a section starts in the line stream, the page it's on and its title."""

    position: int
    page: int
    title: str


def _without_furniture(pages: list[list[str]], found: list[dict[int, Furniture]]) -> list[list[str]]:
    return [[line for at, line in enumerate(lines) if at not in found[page]] for page, lines in enumerate(pages)]


def _joined(text: str, line: str) -> str:
    """A line added to the text before it, joining a word hyphenated across the break."""
    return text[:-1] + line if text.endswith("-") and line[:1].islower() else f"{text} {line}"


def _furniture(pages: list[list[str]], found: list[dict[int, Furniture]], kept: list[list[str]]) -> list[_Paragraph]:
    """Each furniture line as a paragraph of its own (a header where its page's text starts, a footer where
    it ends), and each footnote as one, its lines joined, where its page's text ends."""
    paragraphs: list[_Paragraph] = []
    start = 0
    for page, lines in enumerate(pages):
        end = start + len(kept[page])
        paragraphs += _page_furniture(page, lines, found[page], start, end)
        start = end
    return paragraphs


def _page_furniture(page: int, lines: list[str], found: dict[int, Furniture], start: int, end: int) -> list[_Paragraph]:
    """One page's furniture as paragraphs; its text runs from ``start`` to ``end`` in the line stream."""
    paragraphs: list[_Paragraph] = []
    note: _Paragraph | None = None
    for at, furniture in sorted(found.items()):
        if furniture == "footnote_text" and note is not None and note_label(lines[at]) is None:
            note.text = _joined(note.text, lines[at])
            continue
        top = furniture != "footnote_text" and is_top(at, len(lines))
        rank = _HEADER_RANK if top else _FOOTER_RANK
        paragraphs.append(_Paragraph(page, start if top else end, lines[at], furniture, rank))
        note = paragraphs[-1] if furniture == "footnote_text" else None
    return paragraphs


def _typical_width(pages: list[list[str]]) -> int:
    lengths = sorted(len(line) for lines in pages for line in lines)
    return lengths[int(len(lengths) * 0.8)] if lengths else 0


def _ends_paragraph(line: str, nxt: tuple[int, str] | None, page: int, width: int) -> bool:
    if nxt is None:
        return True
    next_page, next_line = nxt
    if not _NEW_BLOCK_START.match(next_line):
        return False
    ends = bool(_SENTENCE_END.search(line))
    if next_page != page and ends:
        return True
    return len(line) < 0.75 * width and (ends or len(line) < 0.5 * width)


def _paragraphs(pages: list[list[str]], starts: set[int], headings: dict[int, int]) -> list[_Paragraph]:
    """Join lines into paragraphs; a short line before a new-block start, a chapter start or a heading ends one.

    headings maps a chapter heading's first line to its last: a wrapped heading stays one block.
    """
    heading_ends = set(headings.values())
    inside_heading = {line for first, last in headings.items() for line in range(first, last)}
    stream = [(page, line) for page, lines in enumerate(pages) for line in lines]
    width = _typical_width(pages)
    paragraphs: list[_Paragraph] = []
    buffer, start_page, start_position = "", 0, 0
    for i, (page, line) in enumerate(stream):
        if not buffer:
            buffer, start_page, start_position = line, page, i
        else:
            buffer = _joined(buffer, line)
        nxt = stream[i + 1] if i + 1 < len(stream) else None
        if i in inside_heading:
            continue
        if i + 1 in starts or i in heading_ends or _ends_paragraph(line, nxt, page, width):
            paragraphs.append(_Paragraph(start_page, start_position, clean_inline(buffer)))
            buffer = ""
    return [p for p in paragraphs if p.text]


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _heading_span(lines: list[str], title: str) -> tuple[int, int] | None:
    """The first and last line of ``title`` on a page: a line starting with it, or the lines it wraps over."""
    wanted = _tokens(title)
    if not wanted:
        return None
    for first, line in enumerate(lines):
        have = _tokens(line)
        if have[: len(wanted)] == wanted:
            return first, first
        if len(have) >= 2 and wanted[: len(have)] == have:  # a long title wrapped onto the next line(s)
            last, joined = first, have
            while len(joined) < len(wanted) and last + 1 < len(lines):
                last += 1
                joined = joined + _tokens(lines[last])
            if joined[: len(wanted)] == wanted:
                return first, last
    return None


def _chapter_start(pages: list[list[str]], offsets: list[int], page: int, title: str) -> tuple[_Start, int | None]:
    """A chapter's heading line on the outline's page (or the next) and its last line, else the page's top."""
    for candidate in (page, page + 1)[: len(pages) - page]:
        span = _heading_span(pages[candidate], title)
        if span is not None:
            return _Start(offsets[candidate] + span[0], candidate, title), offsets[candidate] + span[1]
    return _Start(offsets[page], page, title), None


def _chapter_starts(pages: list[list[str]], outline: list[tuple[int, str]]) -> tuple[list[_Start], dict[int, int]]:
    """Where each outline chapter starts: at its heading on the outline's page (or the next), else at the page.

    Also returns each found heading's first and last line positions.
    """
    offsets = [0]
    for lines in pages:
        offsets.append(offsets[-1] + len(lines))
    starts: list[_Start] = []
    headings: dict[int, int] = {}
    for page, title in outline:
        start, heading_end = _chapter_start(pages, offsets, page, title)
        # Keep the order strict: a chapter that would start before the previous one is ignored, and one
        # starting where the previous one does replaces it (the previous chapter had no text).
        if starts and start.position == starts[-1].position:
            starts.pop()
        if not starts or start.position > starts[-1].position:
            starts.append(start)
            if heading_end is not None:
                headings[start.position] = heading_end
    return starts, headings


def _outline_starts(pdf: pdfium.PdfDocument, page_count: int) -> list[tuple[int, str]]:
    try:
        items = list(pdf.get_toc(max_depth=4))
    except pdfium.PdfiumError:
        return []
    if not items:
        return []
    top = min(item.level for item in items)
    starts: dict[int, str] = {}
    for item in items:
        dest = item.get_dest()
        page = dest.get_index() if dest is not None else None
        if item.level == top and page is not None and 0 <= page < page_count and page not in starts:
            starts[page] = clean_inline(item.get_title() or "")[:200] or f"Page {page + 1}"
    return sorted(starts.items())


def _block(paragraph: _Paragraph, blocks: list[Block], title: str) -> Block:
    """Furniture stays a paragraph of its own. A section's first text is its heading when it reads like one
    or is the outline's own title."""
    text = paragraph.text
    if paragraph.furniture is not None:
        return Block("paragraph", text, paragraph.furniture)
    first = all(block.furniture is not None for block in blocks)
    looks_heading = len(text) < 80 and not _SENTENCE_END.search(text)
    is_title = bool(_tokens(title)) and _tokens(text) == _tokens(title)
    return Block("heading" if first and (looks_heading or is_title) else "paragraph", text)


def _group(paragraphs: list[_Paragraph], starts: list[_Start]) -> list[ExtractedSection]:
    """Paragraphs (furniture among them, in reading order) into sections; furniture is never a section alone."""
    text = [paragraph for paragraph in paragraphs if paragraph.furniture is None]
    if not text:
        return []
    if len(starts) < 2:
        first_on_page: dict[int, int] = {}
        for paragraph in text:
            first_on_page.setdefault(paragraph.page, paragraph.position)
        starts = [_Start(position, page, f"Page {page + 1}") for page, position in sorted(first_on_page.items())]
    elif starts[0].position > text[0].position:
        starts = [_Start(text[0].position, text[0].page, "Opening pages"), *starts]
    sections: list[ExtractedSection] = []
    carried: list[Block] = []  # furniture before the first section with text
    bounds = [start.position for start in starts[1:]] + [math.inf]
    cursor = 0
    for start, end in zip(starts, bounds, strict=True):
        section = ExtractedSection(title=start.title, page=start.page + 1)
        while cursor < len(paragraphs) and paragraphs[cursor].before(end):
            section.blocks.append(_block(paragraphs[cursor], section.blocks, start.title))
            cursor += 1
        if any(block.furniture is None for block in section.blocks):
            section.blocks[:0], carried = carried, []
            sections.append(section)
        elif sections:
            sections[-1].blocks += section.blocks
        else:
            carried += section.blocks
    return sections


def _open(path: Path) -> pdfium.PdfDocument:
    try:
        return pdfium.PdfDocument(str(path))
    except pdfium.PdfiumError as exc:
        if "password" in str(exc).lower():
            raise DocumentExtractionError(
                "This PDF is password-protected. Remove the password and upload it again.",
                code="encrypted_document",
            ) from exc
        raise DocumentExtractionError("This PDF is damaged or not a valid PDF.", code="corrupt_document") from exc


def _utf16(text: str) -> int:
    """How many UTF-16 code units ``text`` takes: PDFium counts its text in them."""
    return len(text.encode("utf-16-le")) // 2


def _line_box(textpage: pdfium.PdfTextPage, line: str, offset: int) -> LineBox | None:
    """A line's box from its first, middle and last visible characters, or None when any of them can't be
    matched to the page's characters (an inserted or decomposed character) or measured."""
    visible = [at for at, char in enumerate(line) if not char.isspace()]
    if not visible:
        return None
    measured: list[tuple[float, float]] = []
    for at in sorted({visible[0], visible[len(visible) // 2], visible[-1]}):
        char = pdfium_c.FPDFText_GetCharIndexFromTextIndex(textpage, offset + _utf16(line[:at]))
        if char < 0 or pdfium_c.FPDFText_GetUnicode(textpage, char) != ord(line[at]):
            return None
        try:
            _, bottom, _, top = textpage.get_charbox(char, loose=True)
        except pdfium.PdfiumError:
            return None
        measured.append((bottom, top))
    sizes = sorted(top - bottom for bottom, top in measured)
    return LineBox(sizes[len(sizes) // 2], min(bottom for bottom, _ in measured), max(top for _, top in measured))


def _line_boxes(textpage: pdfium.PdfTextPage, text: str) -> list[LineBox | None]:
    """The box of each of the text's lines, in ``str.splitlines`` order."""
    boxes: list[LineBox | None] = []
    offset = 0
    for line in text.splitlines(keepends=True):
        boxes.append(_line_box(textpage, line, offset))
        offset += _utf16(line)
    return boxes


def _read_pages(
    pdf: pdfium.PdfDocument, limits: ExtractionLimits
) -> tuple[list[list[str]], list[list[LineBox | None]]]:
    """Each page's lines of text, and the box of each line."""
    pages: list[list[str]] = []
    boxes: list[list[LineBox | None]] = []
    total = 0
    for index in range(len(pdf)):
        page = pdf[index]
        try:
            textpage = page.get_textpage()
            try:
                text = textpage.get_text_range()
                measured = _line_boxes(textpage, text)
            finally:
                textpage.close()
        finally:
            page.close()
        lines = [(clean_inline(line), box) for line, box in zip(text.splitlines(), measured, strict=True)]
        pages.append([line for line, _ in lines if line])
        boxes.append([box for line, box in lines if line])
        total += len(text)
        if total > limits.max_text_chars * 2:
            raise DocumentExtractionError("This PDF contains more text than the configured limit.", code="text_limit")
    return pages, boxes


def extract_pdf_file(path: Path, title: str | None, limits: ExtractionLimits) -> Extraction:
    pdf = _open(path)
    try:
        page_count = len(pdf)
        if page_count == 0:
            raise DocumentExtractionError("This PDF has no pages.", code="empty_document")
        if page_count > limits.max_pdf_pages:
            raise DocumentExtractionError(
                f"This PDF has {page_count} pages; the limit is {limits.max_pdf_pages}.", code="page_limit"
            )
        pages, boxes = _read_pages(pdf, limits)
        starts = _outline_starts(pdf, page_count)
        meta_title = (pdf.get_metadata_value("Title") or "").strip()
    finally:
        pdf.close()

    blank = sum(1 for lines in pages if sum(map(len, lines)) < MIN_PAGE_CHARS)
    if blank == page_count:
        raise DocumentExtractionError(
            "This PDF has no text layer — it looks like scanned images. OCR isn't supported yet, so it can't "
            "be read aloud.",
            code="scanned_pdf",
        )
    warnings = []
    if blank:
        warnings.append(f"{blank} of {page_count} pages had no readable text (likely scanned images) and were skipped.")
    found = find_furniture(pages, [title for _, title in starts])
    found = [{**page, **notes} for page, notes in zip(found, find_notes(pages, boxes, found), strict=True)]
    lines = _without_furniture(pages, found)
    chapters, headings = _chapter_starts(lines, starts) if len(starts) >= 2 else ([], {})
    paragraphs = _paragraphs(lines, {chapter.position for chapter in chapters}, headings)
    in_order = sorted([*paragraphs, *_furniture(pages, found, lines)], key=lambda p: (p.position, p.rank))
    sections = _group(in_order, chapters)
    usable_title = meta_title if meta_title and not meta_title.lower().startswith("microsoft") else None
    return Extraction(title=usable_title or title, sections=sections, page_count=page_count, warnings=warnings)
