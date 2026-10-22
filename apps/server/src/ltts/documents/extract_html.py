# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Read a whole HTML document (an uploaded page, a fetched web page or a MOBI book's text).

Scope: Charset detection (byte-order mark, a declared charset, then ``<meta charset>``), the page
title, and the readable text: navigation, page headers and footers, asides, forms, scripts and
hidden elements are dropped, and ``<main>`` or ``<article>`` content is preferred when the page has
it. Headings 1–2 start sections. ``html.parser`` never fetches anything or expands DTD entities.
Does NOT belong: Fetching pages (``url_import.py``) or EPUB chapters (``html_text.py``).
"""

from __future__ import annotations

import codecs
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

from ltts.documents.extract_markdown import SectionBuilder
from ltts.documents.extract_text import decode_bytes
from ltts.documents.html_text import BLOCKS, HEADINGS, BlockBuilder
from ltts.documents.normalize import clean_inline
from ltts.documents.structures import ExtractedSection, Extraction, ExtractionLimits
from ltts.errors import DocumentExtractionError

_DROP = {
    "script", "style", "head", "title", "nav", "aside", "form", "noscript", "template", "svg", "math",
    "iframe", "object", "button", "select", "textarea", "canvas", "audio", "video", "rt", "rp", "footer",
}  # fmt: skip
_DROP_ROLES = {"navigation", "banner", "contentinfo", "complementary", "search", "menu", "menubar", "toolbar"}
_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
_NO_SELF_NESTING = {"p", "li", "dt", "dd", "tr", "td", "th", "option"}
_CLOSES_P = {
    "address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figcaption", "figure",
    "footer", "form", "header", "hgroup", "hr", "li", "main", "menu", "nav", "ol", "pre", "section", "table", "ul",
    *HEADINGS,
}  # fmt: skip
_MAX_DEPTH = 512
_DROPPED, _MAIN, _ARTICLE = 1, 2, 4
_BOMS = (codecs.BOM_UTF8, codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)
_META_CHARSET = re.compile(rb"<meta\b[^>]{0,512}?charset\s*=\s*[\"']?\s*([\w.:-]{1,40})", re.IGNORECASE)
_LEGACY = {"iso8859-1": "cp1252", "ascii": "cp1252"}  # browsers read both as Windows-1252


def _codec(name: str | None) -> str | None:
    """The Python codec for a charset label, or None when it is unknown."""
    if not name:
        return None
    try:
        codec = codecs.lookup(name.strip().strip("\"'")).name
    except LookupError:
        return None
    return _LEGACY.get(codec, codec)


def _meta_charset(head: bytes) -> str | None:
    match = _META_CHARSET.search(head)
    codec = _codec(match.group(1).decode("ascii")) if match else None
    # A UTF-16 page cannot declare itself in ASCII; browsers read such a declaration as UTF-8.
    return "utf-8" if codec and codec.startswith(("utf-16", "utf-32")) else codec


def decode_html(raw: bytes, declared: str | None = None) -> str:
    """Decode page bytes: a byte-order mark wins, then ``declared`` (e.g. HTTP), then ``<meta charset>``."""
    if raw.startswith(_BOMS):
        return decode_bytes(raw)
    for codec in (_codec(declared), _meta_charset(raw[:4096])):
        if codec:
            try:
                return raw.decode(codec, errors="replace")
            except LookupError:  # a label for a non-text codec, such as rot13
                continue
    return decode_bytes(raw)


def _closed_by(open_tag: str, tag: str) -> bool:
    """Whether starting ``tag`` implicitly ends an open ``open_tag``, as browsers do (``<p>a<p>b``)."""
    return (open_tag == "p" and tag in _CLOSES_P) or (open_tag == tag and tag in _NO_SELF_NESTING)


def _hidden(tag: str, values: dict[str, str | None]) -> bool:
    style = (values.get("style") or "").lower().replace(" ", "")
    return (
        "hidden" in values
        or (values.get("aria-hidden") or "").strip().lower() == "true"
        or "display:none" in style
        or "visibility:hidden" in style
        or (tag == "dialog" and "open" not in values)
    )


class _PageReader(HTMLParser):
    """Feeds visible text to three builders: the whole page, ``<main>`` and ``<article>`` content."""

    def __init__(self, max_chars: int) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] | None = None
        self.page, self.main, self.article = BlockBuilder(), BlockBuilder(), BlockBuilder()
        self._max_chars = max_chars
        self._stack: list[tuple[str, int]] = []
        self._open: Counter[str] = Counter()
        self._flags: Counter[int] = Counter()
        self._in_title = False

    def _targets(self) -> list[BlockBuilder]:
        if self._flags[_DROPPED]:
            return []
        targets = [self.page]
        if self._flags[_MAIN]:
            targets.append(self.main)
        if self._flags[_ARTICLE]:
            targets.append(self.article)
        return targets

    def _classify(self, tag: str, attrs: list[tuple[str, str | None]]) -> int:
        values = dict(attrs)
        role = (values.get("role") or "").strip().lower()
        landmark_header = tag == "header" and not (self._flags[_MAIN] or self._flags[_ARTICLE])
        if tag in _DROP or role in _DROP_ROLES or landmark_header or _hidden(tag, values):
            return _DROPPED
        if tag == "main" or role == "main":
            return _MAIN
        return _ARTICLE if tag == "article" or role == "article" else 0

    def _push(self, tag: str, flags: int) -> None:
        if len(self._stack) >= _MAX_DEPTH:
            return  # absurdly deep markup: the element's content counts as its parent's
        self._stack.append((tag, flags))
        self._open[tag] += 1
        for flag in (_DROPPED, _MAIN, _ARTICLE):
            self._flags[flag] += bool(flags & flag)

    def _pop(self) -> None:
        tag, flags = self._stack.pop()
        self._open[tag] -= 1
        for flag in (_DROPPED, _MAIN, _ARTICLE):
            self._flags[flag] -= bool(flags & flag)

    def _check_size(self) -> None:
        if self.page.chars > self._max_chars:
            raise DocumentExtractionError(
                f"This page has more than {self._max_chars:,} characters of text, which is over the limit.",
                code="text_limit",
            )

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title" and self.title_parts is None and not self._open["svg"]:
            self.title_parts, self._in_title = [], True
        while self._stack and _closed_by(self._stack[-1][0], tag):
            self._pop()
        flags = self._classify(tag, attrs)
        for builder in self._targets():
            if not flags & _DROPPED:
                builder.start(tag, attrs)
            elif tag in BLOCKS or tag in _CLOSES_P:
                builder.flush()  # a dropped block still separates the paragraphs around it
        if tag not in _VOID:
            self._push(tag, flags)
        self._check_size()

    def handle_endtag(self, tag: str) -> None:
        self._in_title = self._in_title and tag != "title"
        if tag not in _VOID and not self._open[tag]:
            return  # a stray end tag
        targets = self._targets()
        if tag not in _VOID:
            while self._stack[-1][0] != tag:
                self._pop()  # an element left open inside this one
            self._pop()
        for builder in targets:
            builder.end(tag)
        self._check_size()

    def handle_data(self, data: str) -> None:
        if self._in_title and self.title_parts is not None:
            self.title_parts.append(data)
        for builder in self._targets():
            builder.text(data)

    def close(self) -> None:
        super().close()
        for builder in (self.page, self.main, self.article):
            builder.flush()
        self._check_size()

    def content(self) -> BlockBuilder:
        """``<main>`` when it has text, then the page's articles, then everything visible."""
        if self.main.blocks:
            return self.main
        return self.article if self.article.blocks else self.page


def _sections(content: BlockBuilder, first_title: str) -> list[ExtractedSection]:
    builder = SectionBuilder(first_title)
    for block, level in zip(content.blocks, content.levels, strict=True):
        builder.add(block.text, level or None)
    builder.flush()
    return builder.sections


def html_to_extraction(
    markup: str, fallback_title: str | None, limits: ExtractionLimits, *, known_title: str | None = None
) -> Extraction:
    """Readable sections of an HTML document.

    The title is ``known_title`` (a book's own metadata), then ``<title>``, then the first heading.
    """
    reader = _PageReader(limits.max_text_chars)
    reader.feed(markup)
    reader.close()
    content = reader.content()
    page_title = clean_inline("".join(reader.title_parts or []))[:200] or None
    first_heading = next((block.text for block in content.blocks if block.kind == "heading"), None)
    title = known_title or page_title or first_heading or fallback_title
    return Extraction(title=title, sections=_sections(content, title or "Document"))


def extract_html_file(path: Path, title: str | None, limits: ExtractionLimits) -> Extraction:
    return html_to_extraction(decode_html(path.read_bytes()), title, limits)
