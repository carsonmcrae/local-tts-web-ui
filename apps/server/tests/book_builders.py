# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Build FB2 books and MOBI files (valid and deliberately broken) in memory for tests.

Scope: Shared limits and a file writer for the format tests; FB2 XML with title-info, body
sections and notes in any encoding; a small PalmDOC LZ77 compressor; and MOBI files with a PalmDB
record table, PalmDOC and MOBI headers, EXTH metadata, trailing record entries and switches for
DRM, compression type and KF8.
Generating fixtures in code keeps binary blobs out of the repository and documents exactly what
each case contains.
Does NOT belong: Assertions (tests) or app code.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from pathlib import Path

from ltts.documents.structures import ExtractionLimits

LIMITS = ExtractionLimits(1_000_000, 50, 500, 20 * 1024 * 1024, 200)
FB2_NS = "http://www.gribuser.ru/xml/fictionbook/2.0"


def write(directory: Path, name: str, data: bytes) -> Path:
    """Save ``data`` as ``directory/name``: extractors read documents from disk."""
    path = directory / name
    path.write_bytes(data)
    return path


def make_fb2(
    sections: list[tuple[str | None, list[str]]],
    *,
    title: str = "Test Book",
    authors: tuple[tuple[str, str], ...] = (("Anna", "Writer"),),
    lang: str = "en",
    notes: list[tuple[str, str]] | None = None,
    encoding: str = "utf-8",
    declared: str | None = None,
    extra: str = "",
) -> bytes:
    """``sections`` are ``(title, paragraphs)``; ``notes`` are ``(label, text)``; ``extra`` goes after the bodies."""
    people = "".join(
        f"<author><first-name>{first}</first-name><last-name>{last}</last-name></author>" for first, last in authors
    )
    body = "".join(
        "<section>"
        + (f"<title><p>{heading}</p></title>" if heading else "")
        + "".join(f"<p>{paragraph}</p>" for paragraph in paragraphs)
        + "</section>"
        for heading, paragraphs in sections
    )
    note_body = ""
    if notes:
        note_body = (
            '<body name="notes"><title><p>Notes</p></title>'
            + "".join(
                f'<section id="n{i}"><title><p>{label}</p></title><p>{text}</p></section>'
                for i, (label, text) in enumerate(notes, start=1)
            )
            + "</body>"
        )
    xml = (
        f'<?xml version="1.0" encoding="{declared or encoding}"?>'
        f'<FictionBook xmlns="{FB2_NS}" xmlns:l="http://www.w3.org/1999/xlink">'
        f"<description><title-info><genre>prose</genre>{people}<book-title>{title}</book-title>"
        f'<coverpage><image l:href="#cover.jpg"/></coverpage><lang>{lang}</lang></title-info></description>'
        f"<body>{body}</body>{note_body}{extra}</FictionBook>"
    )
    return xml.encode(encoding)


def palmdoc_compress(data: bytes) -> bytes:
    """A simple greedy PalmDOC LZ77 encoder: back-references, space+letter pairs and escaped literals."""
    out = bytearray()
    index = 0
    while index < len(data):
        match = None
        for length in range(min(10, len(data) - index), 2, -1):
            start = data.rfind(data[index : index + length], max(0, index - 2047), index)
            if start >= 0:
                match = (index - start, length)
                break
        byte = data[index]
        if match:
            distance, length = match
            out += struct.pack(">H", 0x8000 | (distance << 3) | (length - 3))
            index += length
        elif byte == 0x20 and index + 1 < len(data) and 0x40 <= data[index + 1] <= 0x7F:
            out.append(data[index + 1] ^ 0x80)
            index += 2
        elif 1 <= byte <= 8 or byte >= 0x80:
            out += bytes([1, byte])
            index += 1
        else:
            out.append(byte)
            index += 1
    return bytes(out)


def exth_block(entries: list[tuple[int, bytes]]) -> bytes:
    body = b"".join(struct.pack(">II", kind, len(value) + 8) + value for kind, value in entries)
    block = b"EXTH" + struct.pack(">II", len(body) + 12, len(entries)) + body
    return block + b"\0" * (-len(block) % 4)


@dataclass
class MobiSpec:
    html: bytes = b"<html><body><h1>Chapter One</h1><p>It was a bright cold day.</p></body></html>"
    title: str = "Full Name Title"
    exth: list[tuple[int, bytes]] = field(default_factory=lambda: [(100, b"Anna Writer"), (503, b"The EXTH Title")])
    compression: int = 2
    encryption: int = 0
    version: int = 6
    encoding: int = 65001
    extra_flags: int = 0
    trailing: bytes = b""  # appended to every text record (the entries ``extra_flags`` describes)
    record_size: int = 4096
    text_records: int | None = None  # override the declared count
    header_length: int = 0xE8


def make_record0(spec: MobiSpec, text_length: int, text_records: int) -> bytes:
    palmdoc = struct.pack(
        ">HHIHHHH", spec.compression, 0, text_length, text_records, spec.record_size, spec.encryption, 0
    )
    mobi = bytearray(spec.header_length)
    mobi[0:4] = b"MOBI"
    struct.pack_into(">III", mobi, 4, spec.header_length, 2, spec.encoding)
    struct.pack_into(">I", mobi, 0x24 - 16, spec.version)
    exth = exth_block(spec.exth) if spec.exth else b""
    name = spec.title.encode("utf-8")
    struct.pack_into(">II", mobi, 0x54 - 16, 16 + spec.header_length + len(exth), len(name))
    struct.pack_into(">I", mobi, 0x80 - 16, 0x40 if spec.exth else 0)
    if spec.header_length >= 0xE4:
        struct.pack_into(">H", mobi, 0xF2 - 16, spec.extra_flags)
    return palmdoc + bytes(mobi) + exth + name + b"\0\0"


def palm_database(records: list[bytes], *, name: bytes = b"Test_Book", kind: bytes = b"BOOKMOBI") -> bytes:
    header = bytearray(78)
    header[0 : len(name)] = name
    header[60:68] = kind
    struct.pack_into(">H", header, 76, len(records))
    offset = 78 + 8 * len(records) + 2
    table = bytearray()
    for index, record in enumerate(records):
        table += struct.pack(">II", offset, index * 2)
        offset += len(record)
    return bytes(header) + bytes(table) + b"\0\0" + b"".join(records)


def make_mobi(spec: MobiSpec | None = None) -> bytes:
    spec = spec or MobiSpec()
    chunks = [spec.html[i : i + spec.record_size] for i in range(0, len(spec.html), spec.record_size)] or [b""]
    text = [(palmdoc_compress(chunk) if spec.compression == 2 else chunk) + spec.trailing for chunk in chunks]
    count = len(text) if spec.text_records is None else spec.text_records
    return palm_database([make_record0(spec, len(spec.html), count), *text])
