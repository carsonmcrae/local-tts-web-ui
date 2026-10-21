# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Turn (X)HTML chapter files into heading and paragraph blocks.

Scope: ``BlockBuilder``, which gathers text into blocks as block-level tags open and close (h1–h6
become headings, image alt text is kept, a ``<br>`` inside a paragraph ends a block that the next
one continues, so verse keeps its lines), and a tolerant ``html.parser``-based walker for EPUB
chapters that drops script/style/head/nav content. ``html.parser`` never fetches external
resources or expands DTD entities, which makes it safe for untrusted content.
Does NOT belong: EPUB packaging (``extract_epub.py``) or whole web pages (``extract_html.py``).
"""

from __future__ import annotations

from html.parser import HTMLParser

from ltts.documents.normalize import clean_inline
from ltts.documents.structures import Block

_SKIP = {"script", "style", "head", "title", "nav", "svg", "math", "template", "noscript", "rt", "rp"}
BLOCKS = {
    "p", "div", "section", "article", "li", "blockquote", "pre", "tr", "td", "th", "dd", "dt",
    "figcaption", "aside", "header", "footer", "body", "br", "hr", "ul", "ol", "table", "mbp:pagebreak",
}  # fmt: skip
HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


class BlockBuilder:
    """Collects text into heading and paragraph blocks; ``levels`` holds each block's heading level (0 = text)."""

    def __init__(self) -> None:
        self.blocks: list[Block] = []
        self.levels: list[int] = []
        self.chars = 0
        self._buffer: list[str] = []
        self._level = 0

    def flush(self, *, line_break: bool = False) -> bool:
        """Close the text gathered so far as a block; ``line_break`` marks a ``<br>`` inside a paragraph."""
        text = clean_inline("".join(self._buffer))
        self._buffer.clear()
        if not text:
            return False
        self.blocks.append(Block("heading" if self._level else "paragraph", text, line_break=line_break))
        self.levels.append(self._level)
        self.chars += len(text)
        return True

    def _end_paragraph(self) -> None:
        """A block-level boundary: a line break just before it broke no line, so the block ends its paragraph."""
        if not self.flush() and self.blocks and self.blocks[-1].line_break:
            self.blocks[-1].line_break = False

    def start(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in HEADINGS:
            self._end_paragraph()
            self._level = int(tag[1])
        elif tag == "br":
            self.flush(line_break=True)
        elif tag in BLOCKS:
            self._end_paragraph()
        elif tag == "img":
            alt = dict(attrs).get("alt")
            if alt and len(alt) > 3:
                self._buffer.append(f" {alt} ")

    def end(self, tag: str) -> None:
        if tag in HEADINGS:
            self._end_paragraph()
            self._level = 0
        elif tag == "br":  # <br/> arrives as a start and an end; a stray </br> breaks a line like <br>
            self.flush(line_break=True)
        elif tag in BLOCKS:
            self._end_paragraph()

    def text(self, data: str) -> None:
        self._buffer.append(data)


class _BlockCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.builder = BlockBuilder()
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIP:
            self._skip_depth += 1
        elif tag != "img" or not self._skip_depth:
            self.builder.start(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP:
            self._skip_depth = max(0, self._skip_depth - 1)
        else:
            self.builder.end(tag)

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self.builder.text(data)

    def close(self) -> None:
        super().close()
        self.builder.flush()


def html_to_blocks(markup: str) -> list[Block]:
    collector = _BlockCollector()
    collector.feed(markup)
    collector.close()
    return collector.builder.blocks
