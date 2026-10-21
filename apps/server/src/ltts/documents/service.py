# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Orchestrate document ingestion from a saved upload or pasted text to stored segments.

Scope: Enforces document-count and concurrency limits, verifies the real file type, runs the
sandboxed extractor, segments the result, runs the automatic cleanup (``cleanup.py``: what to skip
and which footnote markers to leave unread, stored with the document and noted in its warnings) and
persists it. Web pages are fetched (``url_import``) and then read like an uploaded HTML file.
Temporary files are always removed.
Does NOT belong: HTTP concerns (``router.py``) or parsing (``extract_*``).
"""

from __future__ import annotations

import codecs
import hashlib
import json
import logging
import threading
from pathlib import Path
from typing import NamedTuple

from ltts.common import MB, ensure_free_space, new_id
from ltts.config import Settings
from ltts.documents import cleanup
from ltts.documents.cleanup_store import Annotation, records
from ltts.documents.extract_html import decode_html
from ltts.documents.extract_text import text_to_extraction
from ltts.documents.extractors import extract
from ltts.documents.normalize import clean_inline, word_count
from ltts.documents.repository import DocumentRepository
from ltts.documents.sandbox import extract_isolated
from ltts.documents.schemas import MAX_TITLE_CHARS, DocumentDetail
from ltts.documents.segmenter import segment_extraction
from ltts.documents.sniff import detect_type
from ltts.documents.speech_marks import Annotation as MarkAnnotation
from ltts.documents.speech_marks import Encoded, MarkHooks, apply, encode, fold, strip
from ltts.documents.structures import DocumentType, Extraction, ExtractionLimits, SectionInfo, Segment
from ltts.documents.styling import KINDS
from ltts.documents.url_import import fetch_page
from ltts.errors import BusyError, ConflictError, DocumentExtractionError

log = logging.getLogger("ltts.documents")


class _Source(NamedTuple):
    doc_type: DocumentType
    filename: str | None
    size: int
    sha256: str


_BUSY_WAIT_S = 30.0


def _checked(rows: list[Annotation]) -> list[Annotation]:
    """The cleanup's annotations, checked like any other before they are stored."""
    for _, kind, value in rows:
        if not KINDS[kind](value):
            raise ValueError(f"invalid {kind} annotation")
    return rows


def display_filename(filename: str) -> str:
    """A safe label for the UI: base name only, no control characters, bounded length."""
    base = filename.replace("\\", "/").rsplit("/", 1)[-1]
    cleaned = "".join(ch for ch in base if ch.isprintable()).strip()
    return cleaned[:MAX_TITLE_CHARS] or "document"


class DocumentService:
    def __init__(
        self,
        settings: Settings,
        repository: DocumentRepository,
        *,
        isolate: bool = True,
        marks: MarkHooks | None = None,
    ):
        self._settings = settings
        self._repo = repository
        self._isolate = isolate
        self._marks = marks  # speech marks in pasted text; off without them
        self._slots = threading.BoundedSemaphore(settings.max_concurrent_extractions)

    @property
    def limits(self) -> ExtractionLimits:
        s = self._settings
        return ExtractionLimits(
            max_text_chars=s.max_text_chars,
            max_pdf_pages=s.max_pdf_pages,
            max_archive_entries=s.max_archive_entries,
            max_archive_uncompressed_bytes=s.max_archive_uncompressed_mb * MB,
            max_compression_ratio=s.max_compression_ratio,
        )

    def _check_capacity(self) -> None:
        if self._repo.count() >= self._settings.max_documents:
            raise ConflictError(
                f"Your library holds the maximum of {self._settings.max_documents} documents. Delete some first.",
                code="document_limit",
            )

    def _run_extraction(self, path: Path, doc_type: DocumentType, title: str) -> Extraction:
        if not self._slots.acquire(timeout=_BUSY_WAIT_S):
            raise BusyError("Other documents are still being processed. Try again in a moment.")
        try:
            if not self._isolate:
                return extract(path, doc_type, title, self.limits)
            return extract_isolated(
                path,
                doc_type,
                title,
                self.limits,
                timeout_s=self._settings.extraction_timeout_s,
                memory_mb=self._settings.extraction_memory_mb,
            )
        finally:
            self._slots.release()

    def ingest_file(self, path: Path, filename: str, size: int, sha256: str) -> DocumentDetail:
        try:
            self._check_capacity()
            label = display_filename(filename)
            doc_type = detect_type(path, label)
            extraction = self._run_extraction(path, doc_type, Path(label).stem)
            return self._store(extraction, _Source(doc_type, label, size, sha256))
        finally:
            path.unlink(missing_ok=True)

    def import_web_page(self, url: str) -> DocumentDetail:
        """Fetch a public web page and add its readable text, read in the sandbox like an upload."""
        self._check_capacity()
        page = fetch_page(url, max_bytes=self._settings.max_upload_bytes)
        tmp_dir = self._settings.path("tmp")
        # Decoded here with the charset the site sent, then handed over as UTF-8 marked by a byte-order mark.
        data = codecs.BOM_UTF8 + decode_html(page.body, page.charset).encode("utf-8")
        ensure_free_space(tmp_dir, len(data), self._settings.min_free_disk_mb)
        path = tmp_dir / f"{new_id()}.page"
        try:
            path.write_bytes(data)
            extraction = self._run_extraction(path, DocumentType.HTML, page.host)
            label = page.address[:MAX_TITLE_CHARS]
            source = _Source(DocumentType.HTML, label, len(page.body), hashlib.sha256(page.body).hexdigest())
            return self._store(extraction, source)
        finally:
            path.unlink(missing_ok=True)

    def ingest_text(self, text: str, title: str | None, *, speech_marks: bool = False) -> DocumentDetail:
        """Add pasted text; with ``speech_marks``, marks such as {pause 2s} become sentence annotations."""
        self._check_capacity()
        if len(text) > self._settings.max_text_chars:
            raise DocumentExtractionError("The pasted text is longer than the configured limit.", code="text_limit")
        marks = encode(text) if speech_marks and self._marks is not None else None
        extraction = text_to_extraction(marks.text if marks else text, title)
        if not extraction.sections:
            raise DocumentExtractionError("There's no readable text to add.", code="empty_document")
        raw = text.encode("utf-8")
        return self._store(
            extraction, _Source(DocumentType.PASTE, None, len(raw), hashlib.sha256(raw).hexdigest()), marks
        )

    def _read_marks(
        self, segments: list[Segment], sections: list[SectionInfo], marks: Encoded
    ) -> tuple[list[Segment], list[SectionInfo], list[MarkAnnotation], list[str]]:
        """The sentences without their marks, and the annotations and warnings the marks make."""
        assert self._marks is not None  # noqa: S101 - only called when speech marks are enabled
        segments, sections = fold(segments, sections)
        annotations, warnings = apply([(s.index, s.text) for s in segments], marks.marks, self._marks.find_voice)
        for segment in segments:
            segment.text = strip(segment.text)
        for section in sections:
            section.title = strip(section.title)
        return segments, sections, annotations, marks.warnings + warnings

    def _store(self, extraction: Extraction, source: _Source, marks: Encoded | None = None) -> DocumentDetail:
        doc_type, filename, size, sha256 = source
        segments, sections = segment_extraction(extraction)
        warnings: list[str] = list(extraction.warnings)
        marked: list[MarkAnnotation] = []
        if marks is not None:
            segments, sections, marked, found = self._read_marks(segments, sections, marks)
            warnings += found
        if not segments:
            raise DocumentExtractionError("No readable text was found in this document.", code="empty_document")
        findings = cleanup.find(segments, sections, paged=extraction.page_count is not None)
        notice = cleanup.describe(findings.counts())
        warnings += [notice] if notice else []
        all_text = " ".join(s.text for s in segments)
        fallback = clean_inline(segments[0].text)[:60]
        title = clean_inline(extraction.title or "")[:MAX_TITLE_CHARS] or fallback or "Untitled"
        document_id = new_id()
        self._repo.insert(
            {
                "id": document_id,
                "title": title,
                "filename": filename,
                "file_type": doc_type.value,
                "size_bytes": size,
                "char_count": len(all_text),
                "word_count": word_count(all_text),
                "page_count": extraction.page_count,
                "segment_count": len(segments),
                "warnings_json": json.dumps(warnings),
                "source_sha256": sha256,
            },
            sections,
            segments,
            _checked(records(findings)),
        )
        for annotation in marked:
            assert self._marks is not None  # noqa: S101 - annotations only come from speech marks
            self._marks.annotate(document_id, annotation.index, annotation.kind, annotation.value)
        log.info(
            "document stored",
            extra={"document_id": document_id, "type": doc_type.value, "segments": len(segments)},
        )
        return self._repo.get(document_id)
