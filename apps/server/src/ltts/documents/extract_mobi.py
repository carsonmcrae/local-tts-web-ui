# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Read MOBI books (Mobipocket and older Kindle files) without DRM.

Scope: Parses the PalmDOC and MOBI headers in record 0, refuses DRM-protected books (any nonzero
encryption value), HUFF/CDIC compression and KF8-only (AZW3) books with clear messages, reads the
EXTH title, author and language, decompresses the text records within the text and decompressed-size
limits, decodes them with the declared encoding and reads the result through the HTML path.
Written from the published format description. DRM is never bypassed.
Does NOT belong: PalmDB record parsing and decompression (``palmdoc.py``) or HTML reading
(``extract_html.py``).
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from pathlib import Path

from ltts.documents.extract_html import html_to_extraction
from ltts.documents.normalize import clean_inline
from ltts.documents.palmdoc import damaged, decompress, record_bounds, strip_trailing_entries
from ltts.documents.structures import Extraction, ExtractionLimits
from ltts.errors import DocumentExtractionError

_NONE, _PALMDOC, _HUFF_CDIC = 1, 2, 17480
_ENCODINGS = {1252: "cp1252", 65001: "utf-8"}
_EXTH_AUTHOR, _EXTH_LANGUAGE, _EXTH_TITLE = 100, 524, 503
_MAX_EXTH_RECORDS = 1024
_MARKUP_ALLOWANCE = 8  # decompressed HTML bytes allowed for each character of the text limit
_KF8_VERSION = 8


@dataclass(slots=True)
class _Header:
    compression: int
    text_length: int
    text_records: int
    record_size: int
    encoding: str = "cp1252"
    extra_flags: int = 0
    title: str | None = None
    exth: dict[int, list[bytes]] = field(default_factory=dict)


def _u32(data: bytes, offset: int) -> int | None:
    return struct.unpack_from(">I", data, offset)[0] if offset + 4 <= len(data) else None


def _refuse_unreadable(compression: int, encryption: int, version: int) -> None:
    if encryption:
        raise DocumentExtractionError(
            "DRM-protected books can't be opened. Only books without copy protection can be read.",
            code="drm_protected",
        )
    if version >= _KF8_VERSION:
        raise DocumentExtractionError(
            "This is a Kindle KF8 (AZW3) book, which can't be read yet. Convert it to EPUB first.",
            code="unsupported_kindle_format",
        )
    if compression == _HUFF_CDIC:
        raise DocumentExtractionError(
            "This book uses HUFF/CDIC compression, which isn't supported. Convert it to EPUB first.",
            code="unsupported_compression",
        )
    if compression not in (_NONE, _PALMDOC):
        raise damaged("The MOBI file uses an unknown compression and may be damaged.")


def _exth(record0: bytes, start: int) -> dict[int, list[bytes]]:
    """EXTH metadata records by type; a damaged block simply ends early."""
    if record0[start : start + 4] != b"EXTH" or start + 12 > len(record0):
        return {}
    length, count = struct.unpack_from(">II", record0, start + 4)
    end = min(start + length, len(record0))
    position = start + 12
    found: dict[int, list[bytes]] = {}
    for _ in range(min(count, _MAX_EXTH_RECORDS)):
        if position + 8 > end:
            break
        kind, size = struct.unpack_from(">II", record0, position)
        if size < 8 or position + size > end:
            break
        found.setdefault(kind, []).append(record0[position + 8 : position + size])
        position += size
    return found


def _header(record0: bytes) -> _Header:
    if len(record0) < 24:
        raise damaged()
    compression, _, text_length, text_records, record_size, encryption = struct.unpack_from(">HHIHHH", record0)
    # Checked before anything else is read, so a DRM-protected book is refused and never decoded.
    _refuse_unreadable(compression, encryption, _u32(record0, 0x24) or 0)
    if record0[16:20] != b"MOBI":
        raise damaged()
    header_length = _u32(record0, 20) or 0
    header = _Header(compression, text_length, text_records, max(record_size, 4096))
    header.encoding = _ENCODINGS.get(_u32(record0, 0x1C) or 0, "cp1252")
    if header_length >= 0xE4 and len(record0) >= 0xF4:
        (header.extra_flags,) = struct.unpack_from(">H", record0, 0xF2)
    name_offset, name_length = _u32(record0, 0x54) or 0, _u32(record0, 0x58) or 0
    if name_offset and name_offset + name_length <= len(record0):
        header.title = record0[name_offset : name_offset + name_length].decode(header.encoding, errors="replace")
    if (_u32(record0, 0x80) or 0) & 0x40:
        header.exth = _exth(record0, 16 + header_length)
    return header


def _text(data: bytes, bounds: list[int], header: _Header, limits: ExtractionLimits) -> str:
    if header.text_records < 1 or header.text_records > len(bounds) - 2:
        raise damaged()
    cap = min(limits.max_archive_uncompressed_bytes, limits.max_text_chars * _MARKUP_ALLOWANCE)
    per_record = 2 * header.record_size
    parts: list[bytes] = []
    total = 0
    for index in range(1, header.text_records + 1):
        record = strip_trailing_entries(data[bounds[index] : bounds[index + 1]], header.extra_flags)
        if header.compression == _PALMDOC:
            record = decompress(record, per_record)
        total += len(record)
        if total > cap:
            raise DocumentExtractionError("The book is too large once decompressed.", code="archive_limits")
        parts.append(record)
    raw = b"".join(parts)
    if 0 < header.text_length < len(raw):
        raw = raw[: header.text_length]
    return raw.decode(header.encoding, errors="replace")


def _metadata(header: _Header, key: int) -> str | None:
    values = [clean_inline(value.decode(header.encoding, errors="replace")) for value in header.exth.get(key, [])]
    return ", ".join(value for value in values if value) or None


def extract_mobi_file(path: Path, title: str | None, limits: ExtractionLimits) -> Extraction:
    data = path.read_bytes()
    if data[60:68] != b"BOOKMOBI":
        raise damaged("This file isn't a MOBI book.")
    bounds = record_bounds(data)
    header = _header(data[bounds[0] : bounds[1]])
    book_title = _metadata(header, _EXTH_TITLE) or clean_inline(header.title or "") or None
    result = html_to_extraction(_text(data, bounds, header, limits), title, limits, known_title=book_title)
    result.author = _metadata(header, _EXTH_AUTHOR)
    result.language = _metadata(header, _EXTH_LANGUAGE)
    return result
