# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Turn a Standard Ebooks edition into the smaller, text-only EPUB the catalog ships.

Scope: Reads the source package (metadata, spine, table of contents), keeps the chapters the catalog
wants (whole files, or one poem or story picked out of a file by its id), drops images, figures, note
markers and the publisher's own pages, turns links into plain text, writes chapter headings out for
listening ("Chapter 1: Down the Rabbit-Hole" instead of a Roman numeral), and writes a fresh EPUB 3
package with its own metadata, navigation document and deterministic file times.
Does NOT belong: Choosing works or their rights (sources.json), Project Gutenberg texts
(gutenberg_dickinson.py) or the catalog records (build_catalog.py).
"""

from __future__ import annotations

import io
import posixpath
import re
import zipfile
from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

from defusedxml import ElementTree as SafeET

XHTML = "http://www.w3.org/1999/xhtml"
EPUB = "http://www.idpf.org/2007/ops"
OPF = "http://www.idpf.org/2007/opf"
DC = "http://purl.org/dc/elements/1.1/"
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"
DROPPED_STEMS = frozenset({"titlepage", "imprint", "colophon", "uncopyright", "loi", "frontispiece", "halftitlepage", "endnotes"})
FIXED_TIME = (2026, 10, 21, 0, 0, 0)
_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
_REMOVED = {f"{{{XHTML}}}figure", f"{{{XHTML}}}img", f"{{{XHTML}}}svg", f"{{{XHTML}}}link", f"{{{XHTML}}}script"}
ET.register_namespace("", XHTML)
ET.register_namespace("epub", EPUB)


@dataclass
class Chapter:
    stem: str  # the file name without .xhtml, or a poem's id
    title: str  # what the table of contents says
    xml: bytes


@dataclass
class Source:
    """What the catalog needs from a Standard Ebooks package."""

    title: str
    creators: list[str]
    language: str
    word_count: int | None
    abstract: str | None
    revision: str
    modified: str
    transcriptions: list[str]
    spine: list[str]  # archive paths of the XHTML spine items, in reading order
    labels: dict[str, str]  # archive path (with #fragment for poems) → table-of-contents label
    archive: zipfile.ZipFile = field(repr=False)


def roman_to_int(text: str) -> int | None:
    total, previous = 0, 0
    for char in reversed(text.strip().upper()):
        value = _ROMAN.get(char)
        if value is None:
            return None
        total += value if value >= previous else -value
        previous = max(previous, value)
    return total or None


def _meta(opf: ET.Element, prop: str) -> str | None:
    for meta in opf.iter(f"{{{OPF}}}meta"):
        if meta.get("property") == prop and meta.text:
            return meta.text.strip()
    return None


def read_source(path: str) -> Source:
    archive = zipfile.ZipFile(path)
    opf = SafeET.fromstring(archive.read("epub/content.opf"))
    manifest = {item.get("id"): item.get("href", "") for item in opf.iter(f"{{{OPF}}}item")}
    spine = [posixpath.join("epub", manifest[ref.get("idref", "")]) for ref in opf.iter(f"{{{OPF}}}itemref")]
    nav = SafeET.fromstring(archive.read("epub/toc.xhtml"))
    labels: dict[str, str] = {}
    for anchor in nav.iter(f"{{{XHTML}}}a"):
        href, text = anchor.get("href"), "".join(anchor.itertext()).strip()
        if href and text:
            labels.setdefault(posixpath.join("epub", href), text)
    version = _meta(opf, "schema:version") or ""
    words = _meta(opf, "schema:wordCount")
    return Source(
        title=next(el.text for el in opf.iter(f"{{{DC}}}title") if el.text),
        creators=[el.text for el in opf.iter(f"{{{DC}}}creator") if el.text],
        language=next((el.text for el in opf.iter(f"{{{DC}}}language") if el.text), "en"),
        word_count=int(words) if words and words.isdigit() else None,
        abstract=_meta(opf, "schema:abstract"),
        revision=version.split("-")[0][:7],
        modified=_meta(opf, "dcterms:modified") or "",
        transcriptions=[el.text for el in opf.iter(f"{{{DC}}}source") if el.text],
        spine=[item for item in spine if item.endswith(".xhtml")],
        labels=labels,
        archive=archive,
    )


def _remove(parents: dict[ET.Element, ET.Element], element: ET.Element) -> None:
    """Take an element out of the tree, keeping the text that followed it."""
    parent = parents[element]
    children = list(parent)
    position = children.index(element)
    if element.tail:
        if position:
            previous = children[position - 1]
            previous.tail = (previous.tail or "") + element.tail
        else:
            parent.text = (parent.text or "") + element.tail
    parent.remove(element)


def _types(element: ET.Element) -> set[str]:
    return set((element.get(f"{{{EPUB}}}type") or "").split())


def _heading_text(heading: ET.Element) -> str | None:
    """Write a numbered heading out: "Chapter 1", "Book 2", "Stave 3: Marley's Ghost"; None to keep it."""
    label, number, title = "Chapter", None, None
    for span in heading.iter():
        types = _types(span)
        text = "".join(span.itertext()).strip()
        if "se:label" in types:
            label = text
        elif "z3998:roman" in types and roman_to_int(text):
            number = roman_to_int(text)
        elif "title" in types and span is not heading:
            title = text
    if number is None and "z3998:roman" in _types(heading):
        number = roman_to_int("".join(heading.itertext()))
    if number is None:
        return None
    return f"{label} {number}: {title}" if title else f"{label} {number}"


def _rewrite_headings(body: ET.Element, parents: dict[ET.Element, ET.Element]) -> str | None:
    """Replace numbered headings and heading groups by one plain heading; return the first heading's text."""
    first: str | None = None
    for element in list(body.iter()):
        tag = element.tag.rsplit("}", 1)[-1]
        if tag not in ("hgroup", "h2", "h3") or element not in parents:
            continue
        if tag != "hgroup" and parents[element].tag == f"{{{XHTML}}}hgroup":
            continue  # handled with its group
        text = _heading_text(element) if (tag == "hgroup" or "z3998:roman" in _types(element)) else None
        if text is None:
            text = " ".join("".join(element.itertext()).split())
            if tag == "hgroup":
                parts = [" ".join("".join(child.itertext()).split()) for child in element]
                text = ": ".join(part for part in parts if part)
            else:
                first = first or text
                continue
        level = "h2" if tag != "h3" else "h3"
        replacement = ET.Element(f"{{{XHTML}}}{level}")
        replacement.text, replacement.tail = text, element.tail
        parent = parents[element]
        parent.insert(list(parent).index(element), replacement)
        parent.remove(element)
        first = first or text
    return first


def rewrite_chapter(xml: bytes, fragment: str | None, label: str | None, stem: str) -> Chapter:
    """One shipped chapter from a source file (or the element ``fragment`` names inside it)."""
    root = SafeET.fromstring(xml)
    body = next(el for el in root if el.tag == f"{{{XHTML}}}body")
    if fragment:
        wanted = next((el for el in body.iter() if el.get("id") == fragment), None)
        if wanted is None:
            raise ValueError(f"no element with id {fragment!r}")
        wanted.tail = None
        for child in list(body):
            body.remove(child)
        body.append(wanted)
    parents = {child: parent for parent in root.iter() for child in parent}
    for element in list(root.iter()):
        if element not in parents:
            continue
        if element.tag in _REMOVED or (element.tag == f"{{{XHTML}}}a" and "noteref" in _types(element)):
            _remove(parents, element)
    for anchor in root.iter(f"{{{XHTML}}}a"):
        anchor.tag = f"{{{XHTML}}}span"  # the text stays; nothing in a shipped book points anywhere
        for name in [name for name in anchor.attrib if name in ("href", "target", "rel")]:
            del anchor.attrib[name]
    heading = _rewrite_headings(body, {child: parent for parent in root.iter() for child in parent})
    title = heading or (label or stem.replace("-", " ").title())
    head = next((el for el in root if el.tag == f"{{{XHTML}}}head"), None)
    if head is not None:
        for child in list(head):
            head.remove(child)
        title_el = ET.SubElement(head, f"{{{XHTML}}}title")
        title_el.text = title
    out = b'<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(root, encoding="unicode").encode("utf-8")
    return Chapter(stem=stem, title=title, xml=out)


def choose_chapters(source: Source, selection: list[str] | None) -> list[Chapter]:
    """The chapters that ship: the selection (``stem`` or ``stem#id``), or every spine item but the dropped ones."""
    by_stem = {posixpath.basename(path)[: -len(".xhtml")]: path for path in source.spine}
    chapters: list[Chapter] = []
    if selection is None:
        for path in source.spine:
            stem = posixpath.basename(path)[: -len(".xhtml")]
            if stem in DROPPED_STEMS:
                continue
            chapters.append(rewrite_chapter(source.archive.read(path), None, source.labels.get(path), stem))
        return chapters
    for item in selection:
        stem, _, fragment = item.partition("#")
        path = by_stem[stem]
        label = source.labels.get(f"{path}#{fragment}" if fragment else path)
        chapters.append(rewrite_chapter(source.archive.read(path), fragment or None, label, fragment or stem))
    return chapters


_XML_SPECIAL = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}


def xml_text(text: str) -> str:
    return "".join(_XML_SPECIAL.get(char, char) for char in text)


def _nav(title: str, chapters: list[Chapter], language: str) -> str:
    items = "".join(
        f'<li><a href="text/{xml_text(c.stem)}.xhtml">{xml_text(c.title)}</a></li>' for c in chapters
    )
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f'<html xmlns="{XHTML}" xmlns:epub="{EPUB}" xml:lang="{xml_text(language)}" lang="{xml_text(language)}">'
        f"<head><title>{xml_text(title)}</title></head><body>"
        f'<nav epub:type="toc" id="toc"><h2>Contents</h2><ol>{items}</ol></nav></body></html>\n'
    )


def _opf(meta: dict[str, object], chapters: list[Chapter]) -> str:
    creators = "".join(f"<dc:creator>{xml_text(str(name))}</dc:creator>" for name in meta["creators"])  # type: ignore[attr-defined]
    contributors = "".join(f"<dc:contributor>{xml_text(str(name))}</dc:contributor>" for name in meta["contributors"])  # type: ignore[attr-defined]
    sources = "".join(f"<dc:source>{xml_text(str(url))}</dc:source>" for url in meta["sources"])  # type: ignore[attr-defined]
    manifest = "".join(
        f'<item id="c{i}" href="text/{xml_text(c.stem)}.xhtml" media-type="application/xhtml+xml"/>'
        for i, c in enumerate(chapters, start=1)
    )
    spine = "".join(f'<itemref idref="c{i}"/>' for i in range(1, len(chapters) + 1))
    description = f"<dc:description>{xml_text(str(meta['description']))}</dc:description>" if meta.get("description") else ""
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f'<package xmlns="{OPF}" version="3.0" unique-identifier="uid" xml:lang="{xml_text(str(meta["language"]))}">'
        f'<metadata xmlns:dc="{DC}">'
        f'<dc:identifier id="uid">urn:ttsnative:work:{xml_text(str(meta["work_id"]))}</dc:identifier>'
        f"<dc:title>{xml_text(str(meta['title']))}</dc:title>{creators}{contributors}"
        f"<dc:language>{xml_text(str(meta['language']))}</dc:language>{description}{sources}"
        f"<dc:rights>{xml_text(str(meta['rights']))}</dc:rights>"
        '<meta property="dcterms:modified">2026-10-21T00:00:00Z</meta>'
        f"</metadata><manifest>{manifest}"
        '<item id="nav" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
        f"</manifest><spine>{spine}</spine></package>\n"
    )


def write_epub(meta: dict[str, object], chapters: list[Chapter]) -> bytes:
    """A deterministic EPUB 3 package: the same input always gives the same bytes."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as book:

        def put(name: str, data: bytes, compress: int = zipfile.ZIP_DEFLATED) -> None:
            info = zipfile.ZipInfo(name, date_time=FIXED_TIME)
            info.compress_type = compress
            info.external_attr = 0o644 << 16
            book.writestr(info, data)

        put("mimetype", b"application/epub+zip", zipfile.ZIP_STORED)
        put(
            "META-INF/container.xml",
            b'<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" '
            b'xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>'
            b'<rootfile full-path="epub/content.opf" media-type="application/oebps-package+xml"/>'
            b"</rootfiles></container>\n",
        )
        put("epub/content.opf", _opf(meta, chapters).encode("utf-8"))
        put("epub/toc.xhtml", _nav(str(meta["title"]), chapters, str(meta["language"])).encode("utf-8"))
        for chapter in chapters:
            put(f"epub/text/{chapter.stem}.xhtml", chapter.xml)
    return buffer.getvalue()


def source_cover(source: Source) -> bytes | None:
    try:
        return source.archive.read("epub/images/cover.jpg")
    except KeyError:
        return None


def external_references(epub: bytes) -> list[str]:
    """Every http(s) address left in a shipped book's chapters and navigation (namespaces excepted)."""
    found: list[str] = []
    with zipfile.ZipFile(io.BytesIO(epub)) as book:
        for name in book.namelist():
            if not name.endswith(".xhtml"):
                continue
            text = book.read(name).decode("utf-8")
            for url in re.findall(r"https?://[^\s\"'<>]+", text):
                if "w3.org" not in url and "idpf.org" not in url and "daisy.org" not in url and "standardebooks.org/vocab" not in url:
                    found.append(f"{name}: {url}")
    return found
