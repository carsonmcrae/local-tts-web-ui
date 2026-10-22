# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Dispatch a verified document type to its extractor and enforce post-extraction rules.

Scope: One ``extract`` entry point used both in-process (tests) and inside the sandbox process;
rejects documents that yield no readable text or exceed the extracted-text limit.
Does NOT belong: Type detection (``sniff.py``) or process isolation (``sandbox.py``).
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from ltts.documents.extract_docx import extract_docx_file
from ltts.documents.extract_epub import extract_epub_file
from ltts.documents.extract_fb2 import extract_fb2_file
from ltts.documents.extract_html import extract_html_file
from ltts.documents.extract_markdown import extract_markdown_file
from ltts.documents.extract_mobi import extract_mobi_file
from ltts.documents.extract_pdf import extract_pdf_file
from ltts.documents.extract_text import extract_text_file
from ltts.documents.structures import DocumentType, Extraction, ExtractionLimits
from ltts.errors import DocumentExtractionError

_LIMITED: dict[DocumentType, Callable[[Path, str | None, ExtractionLimits], Extraction]] = {
    DocumentType.PDF: extract_pdf_file,
    DocumentType.DOCX: extract_docx_file,
    DocumentType.EPUB: extract_epub_file,
    DocumentType.HTML: extract_html_file,
    DocumentType.FB2: extract_fb2_file,
    DocumentType.MOBI: extract_mobi_file,
}


def _check(extraction: Extraction, limits: ExtractionLimits) -> Extraction:
    chars = sum(len(block.text) for section in extraction.sections for block in section.blocks)
    if chars == 0:
        raise DocumentExtractionError("No readable text was found in this document.", code="empty_document")
    if chars > limits.max_text_chars:
        raise DocumentExtractionError(
            f"This document has about {chars:,} characters of text; the limit is {limits.max_text_chars:,}.",
            code="text_limit",
        )
    return extraction


def extract(path: Path, doc_type: DocumentType, title: str | None, limits: ExtractionLimits) -> Extraction:
    if doc_type in (DocumentType.TEXT, DocumentType.PASTE):
        result = extract_text_file(path, title)
    elif doc_type is DocumentType.MARKDOWN:
        result = extract_markdown_file(path, title)
    else:
        result = _LIMITED[doc_type](path, title, limits)
    return _check(result, limits)
