# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: Decide a document's real type from its bytes, not from its name or browser MIME type.

Scope: Magic-byte checks for PDF and ZIP containers (EPUB vs DOCX by their mandatory parts), a
binary-content check for text formats, and agreement between the claimed extension and content.
Does NOT belong: Parsing content (extractors) or size limits (``service.py``).
"""

from __future__ import annotations

import zipfile
from pathlib import Path

from ltts.documents.structures import DocumentType
from ltts.errors import UnsupportedDocumentError

EXTENSIONS: dict[str, DocumentType] = {
    ".txt": DocumentType.TEXT,
    ".text": DocumentType.TEXT,
    ".md": DocumentType.MARKDOWN,
    ".markdown": DocumentType.MARKDOWN,
    ".pdf": DocumentType.PDF,
    ".docx": DocumentType.DOCX,
    ".epub": DocumentType.EPUB,
}
SUPPORTED_LABEL = "TXT, Markdown, PDF, DOCX or EPUB"
_TEXT_PROBE_BYTES = 8192


def _zip_kind(path: Path) -> DocumentType | None:
    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            if "mimetype" in names:
                info = archive.getinfo("mimetype")
                if info.file_size < 100 and archive.read(info).strip() == b"application/epub+zip":
                    return DocumentType.EPUB
            if "word/document.xml" in names and "[Content_Types].xml" in names:
                return DocumentType.DOCX
    except (zipfile.BadZipFile, OSError, KeyError):
        return None
    return None


def _looks_binary(head: bytes) -> bool:
    if b"\x00" in head and not head.startswith((b"\xff\xfe", b"\xfe\xff")):
        return True
    control = sum(1 for byte in head if byte < 9 or 13 < byte < 32)
    return bool(head) and control / len(head) > 0.05


def detect_type(path: Path, filename: str) -> DocumentType:
    """Return the verified type or raise ``UnsupportedDocumentError`` with a user-facing reason."""
    suffix = Path(filename).suffix.lower()
    claimed = EXTENSIONS.get(suffix)
    if claimed is None:
        raise UnsupportedDocumentError(
            f"“{suffix or 'no extension'}” files aren't supported. Upload {SUPPORTED_LABEL}.",
            code="unsupported_file_type",
        )
    with path.open("rb") as handle:
        head = handle.read(_TEXT_PROBE_BYTES)
    if not head:
        raise UnsupportedDocumentError("The file is empty.", code="empty_document")

    if head.startswith(b"%PDF-"):
        actual: DocumentType | None = DocumentType.PDF
    elif head.startswith(b"PK\x03\x04"):
        actual = _zip_kind(path)
    elif _looks_binary(head):
        actual = None
    else:
        actual = claimed if claimed in (DocumentType.TEXT, DocumentType.MARKDOWN) else None

    if actual is None or actual != claimed:
        raise UnsupportedDocumentError(
            f"The file's contents don't match its {suffix} extension, or it is damaged.",
            code="content_mismatch",
        )
    return actual
