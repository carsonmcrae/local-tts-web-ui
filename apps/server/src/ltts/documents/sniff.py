# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Decide a document's real type from its bytes, not from its name or browser MIME type.

Scope: Magic-byte checks for PDF, MOBI and ZIP containers (EPUB vs DOCX by their mandatory parts,
FB2 by its book file), markers for HTML and FB2 text, a binary-content check for text formats, and
agreement between the claimed extension and content.
Does NOT belong: Parsing content (extractors) or size limits (``service.py``).
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path

from ltts.documents.safezip import is_safe_member_name
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
    ".html": DocumentType.HTML,
    ".htm": DocumentType.HTML,
    ".fb2": DocumentType.FB2,
    ".mobi": DocumentType.MOBI,
    ".azw": DocumentType.MOBI,
    ".azw3": DocumentType.MOBI,  # opened only to explain that KF8 books aren't supported
}
FB2_ZIP_SUFFIX = ".fb2.zip"
SUPPORTED_LABEL = "TXT, Markdown, PDF, DOCX, EPUB, HTML, FB2 or MOBI"
_TEXT_PROBE_BYTES = 8192
_HTML_DOCUMENT = re.compile(rb"<(?:!doctype\s+html|html|head|body)[\s>]", re.IGNORECASE)
_HTML_FRAGMENT = re.compile(rb"^\s*<(?:h[1-6]|p|div|article|main|section|table|title|meta)[\s/>]", re.IGNORECASE)
_FB2_ROOT = re.compile(rb"<(?:[\w.-]+:)?FictionBook[\s>]")


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
            if any(name.lower().endswith(".fb2") and is_safe_member_name(name) for name in names):
                return DocumentType.FB2
    except (zipfile.BadZipFile, OSError, KeyError):
        return None
    return None


def _looks_binary(head: bytes) -> bool:
    if b"\x00" in head and not head.startswith((b"\xff\xfe", b"\xfe\xff")):
        return True
    control = sum(1 for byte in head if byte < 9 or 13 < byte < 32)
    return bool(head) and control / len(head) > 0.05


def looks_like_html(head: bytes) -> bool:
    """Whether text bytes look like an HTML page: a doctype, ``<html>``/``<head>``/``<body>``, or a leading tag."""
    probe = head[:_TEXT_PROBE_BYTES].removeprefix(b"\xef\xbb\xbf")
    return not _looks_binary(probe) and bool(_HTML_DOCUMENT.search(probe) or _HTML_FRAGMENT.match(probe))


def _text_kind(head: bytes, claimed: DocumentType) -> DocumentType | None:
    if claimed in (DocumentType.TEXT, DocumentType.MARKDOWN):
        return claimed
    if claimed is DocumentType.HTML:
        return claimed if looks_like_html(head) else None
    if claimed is DocumentType.FB2:
        return claimed if _FB2_ROOT.search(head) else None
    return None


def _claimed(filename: str) -> tuple[str, DocumentType | None]:
    name = filename.lower()
    if name.endswith(FB2_ZIP_SUFFIX):
        return FB2_ZIP_SUFFIX, DocumentType.FB2
    suffix = Path(name).suffix
    return suffix, EXTENSIONS.get(suffix)


def detect_type(path: Path, filename: str) -> DocumentType:
    """Return the verified type or raise ``UnsupportedDocumentError`` with a user-facing reason."""
    suffix, claimed = _claimed(filename)
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
    elif head[60:68] == b"BOOKMOBI":
        actual = DocumentType.MOBI
    elif _looks_binary(head):
        actual = None
    else:
        actual = _text_kind(head, claimed)

    if actual is None or actual != claimed:
        raise UnsupportedDocumentError(
            f"The file's contents don't match its {suffix} extension, or it is damaged.",
            code="content_mismatch",
        )
    return actual
