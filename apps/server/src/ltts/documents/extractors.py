"""Purpose: Dispatch a verified document type to its extractor and enforce post-extraction rules.

Scope: One ``extract`` entry point used both in-process (tests) and inside the sandbox process;
rejects documents that yield no readable text or exceed the extracted-text limit.
Does NOT belong: Type detection (``sniff.py``) or process isolation (``sandbox.py``).
"""

from __future__ import annotations

from pathlib import Path

from ltts.documents.extract_docx import extract_docx_file
from ltts.documents.extract_epub import extract_epub_file
from ltts.documents.extract_markdown import extract_markdown_file
from ltts.documents.extract_pdf import extract_pdf_file
from ltts.documents.extract_text import extract_text_file
from ltts.documents.structures import DocumentType, Extraction, ExtractionLimits
from ltts.errors import DocumentExtractionError


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
    elif doc_type is DocumentType.PDF:
        result = extract_pdf_file(path, title, limits)
    elif doc_type is DocumentType.DOCX:
        result = extract_docx_file(path, title, limits)
    else:
        result = extract_epub_file(path, title, limits)
    return _check(result, limits)
