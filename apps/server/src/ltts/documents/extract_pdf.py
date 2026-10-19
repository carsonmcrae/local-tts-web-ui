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


def _strip_running_lines(pages: list[list[str]]) -> list[list[str]]:
    """Drop page numbers and lines repeated at the top/bottom of many pages."""
    repeated: set[str] = set()
    if len(pages) >= 3:
        counts: Counter[str] = Counter()
        for lines in pages:
            counts.update({_running_key(line) for line in lines[:EDGE_LINES] + lines[-EDGE_LINES:]})
        threshold = max(2, math.ceil(len(pages) * RUNNING_LINE_SHARE))
        repeated = {key for key, count in counts.items() if count >= threshold}

    cleaned: list[list[str]] = []
    for lines in pages:
        keep = []
        for position, line in enumerate(lines):
            at_edge = position < EDGE_LINES or position >= len(lines) - EDGE_LINES
            if at_edge and (_PAGE_NUMBER.match(line) or _running_key(line) in repeated):
                continue
            keep.append(line)
        cleaned.append(keep)
    return cleaned


def _typical_width(pages: list[list[str]]) -> int:
    lengths = sorted(len(line) for lines in pages for line in lines)
    return lengths[int(len(lengths) * 0.8)] if lengths else 0


def _paragraphs(pages: list[list[str]]) -> list[_Paragraph]:
    """Join lines into paragraphs; a short line followed by a new-block start ends a paragraph."""
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
        nxt = stream[i + 1][1] if i + 1 < len(stream) else ""
        short = len(line) < 0.75 * width
        ends = bool(_SENTENCE_END.search(line))
        if not nxt or (short and _NEW_BLOCK_START.match(nxt) and (ends or len(line) < 0.5 * width)):
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
        page = item.page_index
        if item.level == top and page is not None and 0 <= page < page_count and page not in starts:
            starts[page] = clean_inline(item.title or "")[:200] or f"Page {page + 1}"
    return sorted(starts.items())


def _block(text: str, first: bool) -> Block:
    looks_heading = first and len(text) < 80 and not _SENTENCE_END.search(text)
    return Block("heading" if looks_heading else "paragraph", text)


def _group(paragraphs: list[_Paragraph], starts: list[tuple[int, str]]) -> list[ExtractedSection]:
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
    sections = _group(_paragraphs(_strip_running_lines(pages)), starts)
    usable_title = meta_title if meta_title and not meta_title.lower().startswith("microsoft") else None
    return Extraction(title=usable_title or title, sections=sections, page_count=page_count, warnings=warnings)
