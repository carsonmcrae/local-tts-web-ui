# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: FictionBook 2 (FB2) extraction, from a plain ``.fb2`` file or a ``.fb2.zip``.

Scope: Decodes the bytes with the encoding the XML prolog declares (Windows-1251 is common) and
parses them with defusedxml, which refuses entity declarations. Reads the title, authors and
language from ``title-info``, each body section with its title as a section, and footnotes
(``body name="notes"``) as a final "Notes" section. Embedded ``binary`` data, including the cover
image, is never decoded. ZIP files go through ``SafeZip``.
Does NOT belong: ZIP validation (``safezip.py``) or type detection (``sniff.py``).
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path

# Type only: every document is parsed with defusedxml (SafeET below), never with xml.etree.
# nosemgrep: python.lang.security.use-defused-xml.use-defused-xml
from xml.etree.ElementTree import Element

from defusedxml import DefusedXmlException
from defusedxml import ElementTree as SafeET

from ltts.documents.extract_text import decode_bytes
from ltts.documents.normalize import clean_inline
from ltts.documents.safezip import SafeZip
from ltts.documents.structures import Block, ExtractedSection, Extraction, ExtractionLimits
from ltts.errors import DocumentExtractionError

_DECLARED = re.compile(rb"""^\s*<\?xml[^>]{0,500}?encoding\s*=\s*["']([\w.:-]{1,40})["']""")
_PROLOG = re.compile(r"^\s*<\?xml[^>]{0,500}\?>")
_PARAGRAPHS = {"p", "v", "subtitle", "text-author", "td", "th"}
_CONTAINERS = {"poem", "stanza", "cite", "epigraph", "annotation", "table", "tr"}
_NOTE_BODIES = {"notes", "comments", "footnotes"}


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _decode(raw: bytes) -> str:
    """The book as text, using the prolog's encoding; unknown or wrong encodings fall back to UTF-8/1252."""
    match = _DECLARED.match(raw)  # never matches after a byte-order mark, which decode_bytes honours
    if match:
        try:
            return raw.decode(match.group(1).decode("ascii"), errors="replace")
        except LookupError:  # an unknown encoding name, or one that isn't a text encoding
            pass
    return decode_bytes(raw)


def _parse(raw: bytes) -> Element:
    # The text is already decoded, so the prolog (and the encoding it names) must not reach the parser.
    text = _PROLOG.sub("", _decode(raw), count=1)
    try:
        return SafeET.fromstring(text)
    except DefusedXmlException as exc:
        raise DocumentExtractionError(
            "The book contains XML entity declarations, which are not allowed.", code="unsafe_document"
        ) from exc
    except Exception as exc:  # the XML parser raises several error types for damaged files
        raise DocumentExtractionError("The FB2 book's structure could not be read.", code="corrupt_document") from exc


def _read_book(path: Path, limits: ExtractionLimits) -> bytes:
    with path.open("rb") as handle:
        is_zip = handle.read(4) == b"PK\x03\x04"
    if not is_zip:
        return path.read_bytes()
    with SafeZip(path, limits) as archive:
        name = next((n for n in archive.names() if n.lower().endswith(".fb2")), None)
        if name is None:
            raise DocumentExtractionError("The ZIP file doesn't contain an FB2 book.", code="corrupt_document")
        return archive.read(name)


def _text(element: Element) -> str:
    return clean_inline("".join(element.itertext()))


def _children(element: Element | None, name: str) -> list[Element]:
    return [] if element is None else [child for child in element if _local(child.tag) == name]


def _child(element: Element | None, name: str) -> Element | None:
    found = _children(element, name)
    return found[0] if found else None


def _child_text(element: Element | None, name: str) -> str | None:
    found = _child(element, name)
    return (_text(found) or None) if found is not None else None


def _metadata(root: Element) -> tuple[str | None, str | None, str | None]:
    """(title, authors, language) from ``description/title-info``."""
    info = _child(_child(root, "description"), "title-info")
    authors = []
    for author in _children(info, "author"):
        parts = [_child_text(author, part) for part in ("first-name", "middle-name", "last-name")]
        name = " ".join(part for part in parts if part) or _child_text(author, "nickname")
        if name:
            authors.append(name)
    return _child_text(info, "book-title"), ", ".join(authors) or None, _child_text(info, "lang")


class _BookBuilder:
    """Titled FB2 sections become sections; a title that only follows other titles joins their section."""

    def __init__(self) -> None:
        self.sections: list[ExtractedSection] = []
        self._has_text = False

    def heading(self, text: str) -> None:
        if not self.sections or self._has_text:
            self.sections.append(ExtractedSection(title=text[:200]))
            self._has_text = False
        elif not self.sections[-1].blocks:
            self.sections[-1].title = text[:200]  # an untitled part takes its first inner title
        self.sections[-1].blocks.append(Block("heading", text))

    def boundary(self) -> None:
        """An untitled top-level section: start a numbered part if the current one has text."""
        if self._has_text:
            self.sections.append(ExtractedSection(title=f"Part {len(self.sections) + 1}"))
            self._has_text = False

    def paragraph(self, text: str) -> None:
        if not self.sections:
            self.sections.append(ExtractedSection(title="Part 1"))
        self.sections[-1].blocks.append(Block("paragraph", text))
        self._has_text = True


def _title(element: Element) -> str:
    return " — ".join(text for text in (_text(p) for p in element if _local(p.tag) == "p") if text)


def _walk(body: Element, builder: _BookBuilder) -> None:
    """Visit a body in document order without recursion, so deep nesting cannot exhaust the stack."""
    stack: list[Iterator[Element]] = [iter(body)]
    while stack:
        element = next(stack[-1], None)
        if element is None:
            stack.pop()
            continue
        name = _local(element.tag)
        if name == "title":
            title = _title(element)
            if title:
                builder.heading(title)
        elif name == "section":
            if len(stack) == 1 and _child(element, "title") is None:
                builder.boundary()
            stack.append(iter(element))
        elif name in _PARAGRAPHS:
            text = _text(element)
            if text:
                builder.paragraph(text)
        elif name in _CONTAINERS:
            stack.append(iter(element))


def _notes(bodies: list[Element]) -> ExtractedSection | None:
    """Every footnote as one paragraph led by its label ("1. The note's text.")."""
    blocks = [Block("heading", "Notes")]
    for note in (el for body in bodies for el in body.iter() if _local(el.tag) == "section"):
        title = _child(note, "title")
        label = _title(title).rstrip(". ") if title is not None else ""
        texts = [_text(el) for el in note if _local(el.tag) in _PARAGRAPHS]
        text = " ".join(t for t in texts if t)
        if text:
            blocks.append(Block("paragraph", f"{label}. {text}" if label else text))
    return ExtractedSection(title="Notes", blocks=blocks) if len(blocks) > 1 else None


def extract_fb2_file(path: Path, title: str | None, limits: ExtractionLimits) -> Extraction:
    root = _parse(_read_book(path, limits))
    if _local(root.tag) != "FictionBook":
        raise DocumentExtractionError("This file isn't an FB2 book.", code="corrupt_document")
    book_title, author, language = _metadata(root)
    bodies = [child for child in root if _local(child.tag) == "body"]
    builder = _BookBuilder()
    note_bodies = []
    for body in bodies:
        if (body.get("name") or "").strip().lower() in _NOTE_BODIES:
            note_bodies.append(body)
        else:
            _walk(body, builder)
    sections = [section for section in builder.sections if section.blocks]
    notes = _notes(note_bodies)
    if notes is not None:
        sections.append(notes)
    return Extraction(title=book_title or title, sections=sections, author=author, language=language)
