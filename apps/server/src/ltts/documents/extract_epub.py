# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
"""Purpose: EPUB 2/3 extraction without third-party EPUB libraries (EbookLib is AGPL).

Scope: Locates the package document via META-INF/container.xml, reads the OPF manifest and spine
with defusedxml, maps navigation labels (EPUB 3 nav or EPUB 2 NCX) to spine items for chapter
titles, and converts each XHTML spine item into blocks. All reads go through ``SafeZip``.
Does NOT belong: HTML-to-text conversion (``html_text.py``) or ZIP validation (``safezip.py``).
"""

from __future__ import annotations

import posixpath
from pathlib import Path
from urllib.parse import unquote

# Type only: every document is parsed with defusedxml (SafeET below), never with xml.etree.
# nosemgrep: python.lang.security.use-defused-xml.use-defused-xml
from xml.etree.ElementTree import Element

from defusedxml import ElementTree as SafeET

from ltts.documents.extract_text import decode_bytes
from ltts.documents.html_text import html_to_blocks
from ltts.documents.safezip import SafeZip
from ltts.documents.structures import ExtractedSection, Extraction, ExtractionLimits
from ltts.errors import DocumentExtractionError

_HTML_TYPES = {"application/xhtml+xml", "text/html"}
_NCX_TYPE = "application/x-dtbncx+xml"


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _children(element: Element, name: str) -> list[Element]:
    return [child for child in element.iter() if _local(child.tag) == name]


def _parse(data: bytes) -> Element:
    try:
        return SafeET.fromstring(data)
    except Exception as exc:  # defusedxml raises several parser-specific types
        raise DocumentExtractionError("The EPUB's structure could not be read.", code="corrupt_document") from exc


def _resolve(base_dir: str, href: str) -> str:
    return posixpath.normpath(posixpath.join(base_dir, unquote(href.split("#", 1)[0])))


def _nav_document_labels(book: SafeZip, path: str) -> dict[str, str]:
    """EPUB 3: the target and text of every link in the navigation document (first link wins)."""
    nav_dir = posixpath.dirname(path)
    labels: dict[str, str] = {}
    for anchor in _children(_parse(book.read_xml(path)), "a"):
        target = anchor.get("href")
        text = "".join(anchor.itertext()).strip()
        if target and text:
            labels.setdefault(_resolve(nav_dir, target), text)
    return labels


def _ncx_labels(book: SafeZip, path: str) -> dict[str, str]:
    """EPUB 2: the content source and label of every NCX navPoint (first one wins)."""
    ncx_dir = posixpath.dirname(path)
    labels: dict[str, str] = {}
    for point in _children(_parse(book.read_xml(path)), "navPoint"):
        texts = _children(point, "text")
        contents = _children(point, "content")
        src = contents[0].get("src") if contents else None
        if texts and src and texts[0].text:
            labels.setdefault(_resolve(ncx_dir, src), texts[0].text.strip())
    return labels


def _nav_labels(book: SafeZip, base_dir: str, manifest: dict[str, tuple[str, str, str]]) -> dict[str, str]:
    """Map spine file paths to human chapter titles from the EPUB 3 nav or, failing that, the EPUB 2 NCX."""
    labels: dict[str, str] = {}
    for href, media_type, props in manifest.values():
        path = _resolve(base_dir, href)
        if not book.has(path):
            continue
        if "nav" in props.split():
            labels = _nav_document_labels(book, path) | labels  # labels found earlier keep priority
        elif media_type == _NCX_TYPE and not labels:
            labels = _ncx_labels(book, path)
    return labels


def extract_epub_file(path: Path, title: str | None, limits: ExtractionLimits) -> Extraction:
    with SafeZip(path, limits) as book:
        container = _parse(book.read_xml("META-INF/container.xml"))
        rootfiles = [el.get("full-path") for el in _children(container, "rootfile")]
        opf_path = next((p for p in rootfiles if p and book.has(p)), None)
        if not opf_path:
            raise DocumentExtractionError("The EPUB has no readable package file.", code="corrupt_document")
        opf = _parse(book.read_xml(opf_path))
        base_dir = posixpath.dirname(opf_path)

        manifest = {
            item.get("id", ""): (item.get("href", ""), item.get("media-type", ""), item.get("properties", ""))
            for item in _children(opf, "item")
        }
        book_title = next((el.text.strip() for el in _children(opf, "title") if el.text), None) or title
        labels = _nav_labels(book, base_dir, manifest)

        sections: list[ExtractedSection] = []
        for itemref in _children(opf, "itemref"):
            href, media_type, _ = manifest.get(itemref.get("idref", ""), ("", "", ""))
            item_path = _resolve(base_dir, href)
            if media_type not in _HTML_TYPES or not book.has(item_path):
                continue
            blocks = html_to_blocks(decode_bytes(book.read_xml(item_path)))
            if not blocks:
                continue
            first_heading = next((b.text for b in blocks if b.kind == "heading"), None)
            section_title = labels.get(item_path) or first_heading or f"Part {len(sections) + 1}"
            sections.append(ExtractedSection(title=section_title[:200], blocks=blocks))
    return Extraction(title=book_title, sections=sections)
