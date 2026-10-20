# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Defensive read-only access to ZIP containers (DOCX, EPUB).

Scope: Up-front checks for entry count, declared uncompressed size, per-entry compression ratio,
encryption and unsafe member names; bounded reads; and DTD/entity rejection for XML parts so
entity-expansion attacks never reach a parser. Nothing is ever extracted to disk (no zip-slip).
Does NOT belong: Format-specific parsing (``extract_docx.py`` / ``extract_epub.py``).
"""

from __future__ import annotations

import posixpath
import re
import zipfile
from pathlib import Path

from ltts.documents.structures import ExtractionLimits
from ltts.errors import DocumentExtractionError

_ENTITY_DECL = re.compile(rb"<!ENTITY", re.IGNORECASE)


def is_safe_member_name(name: str) -> bool:
    if not name or name.startswith(("/", "\\")) or "\\" in name or "\x00" in name:
        return False
    if re.match(r"^[A-Za-z]:", name):
        return False
    normalised = posixpath.normpath(name)
    return not (normalised == ".." or normalised.startswith("../"))


class SafeZip:
    """Validated view over a ZIP file. Use as a context manager."""

    def __init__(self, path: Path, limits: ExtractionLimits):
        self._limits = limits
        try:
            self._zip = zipfile.ZipFile(path)
        except (zipfile.BadZipFile, OSError) as exc:
            raise DocumentExtractionError("The file is not a readable ZIP container.", code="corrupt_document") from exc
        self._validate()

    def __enter__(self) -> SafeZip:
        return self

    def __exit__(self, *_: object) -> None:
        self._zip.close()

    def _validate(self) -> None:
        infos = self._zip.infolist()
        if len(infos) > self._limits.max_archive_entries:
            raise DocumentExtractionError("The document contains too many internal files.", code="archive_limits")
        total = 0
        for info in infos:
            if info.flag_bits & 0x1:
                raise DocumentExtractionError("Encrypted documents aren't supported.", code="encrypted_document")
            total += info.file_size
            ratio = info.file_size / max(info.compress_size, 1)
            if info.file_size > 1_000_000 and ratio > self._limits.max_compression_ratio:
                raise DocumentExtractionError(
                    "The document expands to a suspicious size (possible archive bomb).",
                    code="archive_limits",
                )
        if total > self._limits.max_archive_uncompressed_bytes:
            raise DocumentExtractionError("The document is too large once decompressed.", code="archive_limits")

    def names(self) -> list[str]:
        return [name for name in self._zip.namelist() if is_safe_member_name(name)]

    def has(self, name: str) -> bool:
        return is_safe_member_name(name) and name in self._zip.NameToInfo

    def read(self, name: str) -> bytes:
        if not self.has(name):
            raise DocumentExtractionError("A required part of the document is missing.", code="corrupt_document")
        info = self._zip.getinfo(name)
        try:
            # ZipExtFile never yields more than the declared size and verifies the CRC.
            with self._zip.open(info) as member:
                return member.read(info.file_size + 1)
        except (zipfile.BadZipFile, OSError, EOFError) as exc:
            raise DocumentExtractionError("Part of the document is damaged.", code="corrupt_document") from exc

    def read_xml(self, name: str) -> bytes:
        """Read an XML part, refusing any entity declarations (billion-laughs / XXE)."""
        data = self.read(name)
        if _ENTITY_DECL.search(data):
            raise DocumentExtractionError(
                "The document contains XML entity declarations, which are not allowed.",
                code="unsafe_document",
            )
        return data

    def assert_no_entities(self) -> None:
        for name in self.names():
            if name.lower().endswith((".xml", ".rels", ".opf", ".ncx", ".xhtml", ".html", ".htm")):
                self.read_xml(name)
