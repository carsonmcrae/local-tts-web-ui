# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Low-level, bounds-checked reading of Palm database files (the container MOBI books use).

Scope: The record table (every offset checked against the file), PalmDOC LZ77 decompression with an
output cap, and removal of the trailing entries MOBI appends to text records. Written from the
published format description; every loop is bounded by the input size or an explicit cap, so a
malformed file fails with a clean error instead of hanging or exhausting memory.
Does NOT belong: MOBI headers, metadata or text decoding (``extract_mobi.py``).
"""

from __future__ import annotations

import struct

from ltts.errors import DocumentExtractionError

HEADER_SIZE = 78
_ENTRY_SIZE = 8


def damaged(detail: str = "The MOBI file is damaged or incomplete.") -> DocumentExtractionError:
    return DocumentExtractionError(detail, code="corrupt_document")


def record_bounds(data: bytes) -> list[int]:
    """Start offsets of every record plus the file's end, so record ``i`` is ``data[b[i]:b[i + 1]]``."""
    if len(data) < HEADER_SIZE:
        raise damaged()
    (count,) = struct.unpack_from(">H", data, 76)
    table_end = HEADER_SIZE + count * _ENTRY_SIZE
    if count == 0 or table_end > len(data):
        raise damaged("The MOBI file's record table is damaged.")
    bounds = [struct.unpack_from(">I", data, HEADER_SIZE + index * _ENTRY_SIZE)[0] for index in range(count)]
    previous = table_end
    for offset in bounds:
        if offset < previous or offset > len(data):
            raise damaged("The MOBI file's record table is damaged.")
        previous = offset
    return [*bounds, len(data)]


def _backward_size(record: bytes, end: int) -> int:
    """A trailing entry's size: a variable-length number read backwards from ``end`` (at most 4 bytes)."""
    value = 0
    for shift, position in zip(range(0, 28, 7), range(end - 1, max(end - 5, -1), -1), strict=False):
        byte = record[position]
        value |= (byte & 0x7F) << shift
        if byte & 0x80:
            break
    return value


def strip_trailing_entries(record: bytes, flags: int) -> bytes:
    """Remove the extra data MOBI appends to a text record, as described by the header's flags.

    Each flag bit above bit 0 adds an entry whose size is stored at its end; bit 0 marks multibyte
    character overlap, whose length is in the low two bits of the last remaining byte.
    """
    end = len(record)
    for bit in range(1, 16):
        if flags & (1 << bit):
            size = _backward_size(record, end)
            if size > end:
                raise damaged()
            end -= size
    if flags & 1 and end:
        end -= (record[end - 1] & 3) + 1
    if end < 0:
        raise damaged()
    return record[:end]


def decompress(source: bytes, limit: int) -> bytes:
    """Expand PalmDOC LZ77 data, refusing output longer than ``limit`` bytes."""
    out = bytearray()
    index = 0
    size = len(source)
    while index < size:
        byte = source[index]
        index += 1
        if 1 <= byte <= 8:  # copy the next 1 to 8 bytes literally
            if index + byte > size:
                raise damaged()
            out += source[index : index + byte]
            index += byte
        elif byte < 0x80:  # a literal byte
            out.append(byte)
        elif byte >= 0xC0:  # a space followed by an ASCII character
            out += b" "
            out.append(byte ^ 0x80)
        else:  # a back-reference: 11 bits of distance, 3 bits of length
            if index >= size:
                raise damaged()
            pair = (byte << 8) | source[index]
            index += 1
            distance, length = (pair >> 3) & 0x7FF, (pair & 7) + 3
            if distance == 0 or distance > len(out):
                raise damaged()
            start = len(out) - distance
            for offset in range(length):  # the copy may overlap the bytes it produces
                out.append(out[start + offset])
        if len(out) > limit:
            raise DocumentExtractionError("The book is too large once decompressed.", code="archive_limits")
    return bytes(out)
