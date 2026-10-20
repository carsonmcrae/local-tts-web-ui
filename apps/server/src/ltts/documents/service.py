# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Orchestrate document ingestion from a saved upload or pasted text to stored segments.

Scope: Enforces document-count and concurrency limits, verifies the real file type, runs the
sandboxed extractor, segments the result and persists it. Temporary files are always removed.
Does NOT belong: HTTP concerns (``router.py``) or parsing (``extract_*``).
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
from pathlib import Path

from ltts.common import MB, new_id
from ltts.config import Settings
from ltts.documents.extract_text import text_to_extraction
from ltts.documents.extractors import extract
from ltts.documents.normalize import clean_inline, word_count
from ltts.documents.repository import DocumentRepository
from ltts.documents.sandbox import extract_isolated
from ltts.documents.schemas import MAX_TITLE_CHARS, DocumentDetail
from ltts.documents.segmenter import segment_extraction
from ltts.documents.sniff import detect_type
from ltts.documents.structures import DocumentType, Extraction, ExtractionLimits
from ltts.errors import BusyError, ConflictError, DocumentExtractionError

log = logging.getLogger("ltts.documents")
_BUSY_WAIT_S = 30.0


def display_filename(filename: str) -> str:
    """A safe label for the UI: base name only, no control characters, bounded length."""
    base = filename.replace("\\", "/").rsplit("/", 1)[-1]
    cleaned = "".join(ch for ch in base if ch.isprintable()).strip()
    return cleaned[:MAX_TITLE_CHARS] or "document"


class DocumentService:
    def __init__(self, settings: Settings, repository: DocumentRepository, *, isolate: bool = True):
        self._settings = settings
        self._repo = repository
        self._isolate = isolate
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
            return self._store(extraction, doc_type, label, size, sha256)
        finally:
            path.unlink(missing_ok=True)

    def ingest_text(self, text: str, title: str | None) -> DocumentDetail:
        self._check_capacity()
        if len(text) > self._settings.max_text_chars:
            raise DocumentExtractionError("The pasted text is longer than the configured limit.", code="text_limit")
        extraction = text_to_extraction(text, title)
        if not extraction.sections:
            raise DocumentExtractionError("There's no readable text to add.", code="empty_document")
        raw = text.encode("utf-8")
        return self._store(extraction, DocumentType.PASTE, None, len(raw), hashlib.sha256(raw).hexdigest())

    def _store(
        self, extraction: Extraction, doc_type: DocumentType, filename: str | None, size: int, sha256: str
    ) -> DocumentDetail:
        segments, sections = segment_extraction(extraction)
        if not segments:
            raise DocumentExtractionError("No readable text was found in this document.", code="empty_document")
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
                "warnings_json": json.dumps(extraction.warnings),
                "source_sha256": sha256,
            },
            sections,
            segments,
        )
        log.info(
            "document stored",
            extra={"document_id": document_id, "type": doc_type.value, "segments": len(segments)},
        )
        return self._repo.get(document_id)
