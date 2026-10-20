# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Plain-text and pasted-text extraction.

Scope: Encoding detection (UTF-8/UTF-16 with BOM, then UTF-8, then Windows-1252), paragraph
splitting on blank lines (or single newlines for line-per-paragraph text), and simple chapter
heading recognition ("Chapter 3", "PART TWO").
Does NOT belong: Markdown structure (``extract_markdown.py``).
"""

from __future__ import annotations

import re
from pathlib import Path

from ltts.documents.normalize import clean_inline, clean_text
from ltts.documents.structures import Block, ExtractedSection, Extraction

_CHAPTER = re.compile(
    r"^(chapter|part|book|prologue|epilogue|section)\b[\w .:'’-]{0,60}$|^[IVXLC]{1,7}\.?$", re.IGNORECASE
)


def decode_bytes(raw: bytes) -> str:
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8", errors="replace")
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16", errors="replace")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def _paragraphs(text: str) -> list[str]:
    cleaned = clean_text(text)
    # Blank lines separate paragraphs; text without any is treated as one paragraph per line.
    chunks = re.split(r"\n\s*\n", cleaned) if "\n\n" in cleaned else cleaned.split("\n")
    return [clean_inline(chunk) for chunk in chunks if chunk.strip()]


def text_to_extraction(text: str, title: str | None) -> Extraction:
    sections: list[ExtractedSection] = []
    current = ExtractedSection(title=title or "Text")
    for para in _paragraphs(text):
        if len(para) <= 70 and _CHAPTER.match(para):
            if current.blocks:
                sections.append(current)
            current = ExtractedSection(title=para, blocks=[Block("heading", para)])
            continue
        current.blocks.append(Block("paragraph", para))
    if current.blocks:
        sections.append(current)
    return Extraction(title=title, sections=sections)


def extract_text_file(path: Path, title: str | None) -> Extraction:
    return text_to_extraction(decode_bytes(path.read_bytes()), title)
