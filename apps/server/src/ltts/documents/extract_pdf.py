"""Purpose: Text-PDF extraction with PDFium (pypdfium2), tuned for listening rather than layout.

Scope: Reads each page's text layer; removes running headers/footers and page numbers; rebuilds
paragraphs across line and page breaks (de-hyphenating); groups paragraphs into chapters from the
PDF outline, or into "Page N" sections when there is none; detects scanned/image-only PDFs and
reports them instead of pretending they were read. Encrypted PDFs are rejected.
Does NOT belong: OCR (not supported) or generic text clean-up (``normalize.py``).
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import pypdfium2 as pdfium

from ltts.documents.normalize import clean_inline
from ltts.documents.structures import Block, ExtractedSection, Extraction, ExtractionLimits
from ltts.errors import DocumentExtractionError

MIN_PAGE_CHARS = 20
RUNNING_LINE_SHARE = 0.4
EDGE_LINES = 2
_PAGE_NUMBER = re.compile(
    r"^(?:page\s*)?\d{1,4}(?:\s*(?:of|/)\s*\d{1,4})?$|^[-–—]\s*\d{1,4}\s*[-–—]$|^[ivxlc]{1,6}$", re.IGNORECASE
)
_SENTENCE_END = re.compile(r"[.!?:;\"”’)\]]$")
_NEW_BLOCK_START = re.compile(r"^[A-Z0-9\"“‘(•\-–—]")


@dataclass(slots=True)
class _Paragraph:
    page: int
    text: str


def _running_key(line: str) -> str:
    return re.sub(r"\d+", "#", line.lower()).strip()


def _edge_positions(count: int) -> set[int]:
    """Line positions that may hold a running header/footer; short pages only use the outermost line."""
    depth = EDGE_LINES if count > 2 * EDGE_LINES + 1 else 1
    return {*range(min(depth, count)), *range(max(count - depth, 0), count)}


def _strip_running_lines(pages: list[list[str]]) -> list[list[str]]:
    """Drop page numbers and lines repeated at the top/bottom of many pages."""
    repeated: set[str] = set()
    if len(pages) >= 3:
        counts: Counter[str] = Counter()
        for lines in pages:
            counts.update({_running_key(lines[i]) for i in _edge_positions(len(lines))})
        threshold = max(2, math.ceil(len(pages) * RUNNING_LINE_SHARE))
        repeated = {key for key, count in counts.items() if count >= threshold}

    cleaned: list[list[str]] = []
    for lines in pages:
        edges = _edge_positions(len(lines))
        cleaned.append(
            [
                line
                for position, line in enumerate(lines)
                if position not in edges or not (_PAGE_NUMBER.match(line) or _running_key(line) in repeated)
            ]
        )
    return cleaned


def _typical_width(pages: list[list[str]]) -> int:
    lengths = sorted(len(line) for lines in pages for line in lines)
    return lengths[int(len(lengths) * 0.8)] if lengths else 0


def _ends_paragraph(line: str, nxt: tuple[int, str] | None, page: int, width: int, breaks: set[int]) -> bool:
    if nxt is None:
        return True
    next_page, next_line = nxt
    if next_page != page and next_page in breaks:  # a chapter starts on the next page
        return True
    if not _NEW_BLOCK_START.match(next_line):
        return False
    ends = bool(_SENTENCE_END.search(line))
    if next_page != page and ends:
        return True
    return len(line) < 0.75 * width and (ends or len(line) < 0.5 * width)


def _paragraphs(pages: list[list[str]], breaks: set[int]) -> list[_Paragraph]:
    """Join lines into paragraphs; a short line before a new-block start, or a chapter page, ends one."""
    stream = [(page, line) for page, lines in enumerate(pages) for line in lines]
    width = _typical_width(pages)
    paragraphs: list[_Paragraph] = []
    buffer, start_page = "", 0
    for i, (page, line) in enumerate(stream):
        if not buffer:
            buffer, start_page = line, page
        elif buffer.endswith("-") and line[:1].islower():
            buffer = buffer[:-1] + line
        else:
            buffer = f"{buffer} {line}"
        if _ends_paragraph(line, stream[i + 1] if i + 1 < len(stream) else None, page, width, breaks):
            paragraphs.append(_Paragraph(start_page, clean_inline(buffer)))
            buffer = ""
    return [p for p in paragraphs if p.text]


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


def _block(text: str, first: bool) -> Block:
    looks_heading = first and len(text) < 80 and not _SENTENCE_END.search(text)
    return Block("heading" if looks_heading else "paragraph", text)


def _group(paragraphs: list[_Paragraph], starts: list[tuple[int, str]]) -> list[ExtractedSection]:
    if not paragraphs:
        return []
    if len(starts) < 2:
        starts = sorted({(p.page, f"Page {p.page + 1}") for p in paragraphs})
    elif starts[0][0] > 0:
        starts = [(0, "Opening pages"), *starts]
    sections: list[ExtractedSection] = []
    bounds = [page for page, _ in starts[1:]] + [math.inf]
    cursor = 0
    for (page, title), end in zip(starts, bounds, strict=True):
        section = ExtractedSection(title=title, page=page + 1)
        while cursor < len(paragraphs) and paragraphs[cursor].page < end:
            section.blocks.append(_block(paragraphs[cursor].text, first=not section.blocks))
            cursor += 1
        if section.blocks:
            sections.append(section)
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


def _read_pages(pdf: pdfium.PdfDocument, limits: ExtractionLimits) -> list[list[str]]:
    pages: list[list[str]] = []
    total = 0
    for index in range(len(pdf)):
        page = pdf[index]
        try:
            textpage = page.get_textpage()
            try:
                text = textpage.get_text_range()
            finally:
                textpage.close()
        finally:
            page.close()
        lines = [clean_inline(line) for line in text.splitlines()]
        pages.append([line for line in lines if line])
        total += len(text)
        if total > limits.max_text_chars * 2:
            raise DocumentExtractionError("This PDF contains more text than the configured limit.", code="text_limit")
    return pages


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
        pages = _read_pages(pdf, limits)
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
    breaks = {page for page, _ in starts} if len(starts) >= 2 else set()
    sections = _group(_paragraphs(_strip_running_lines(pages), breaks), starts)
    usable_title = meta_title if meta_title and not meta_title.lower().startswith("microsoft") else None
    return Extraction(title=usable_title or title, sections=sections, page_count=page_count, warnings=warnings)
