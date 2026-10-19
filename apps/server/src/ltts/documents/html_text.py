"""Purpose: Turn (X)HTML chapter files into heading and paragraph blocks.

Scope: A tolerant ``html.parser``-based walker: block elements end paragraphs, h1–h6 become
headings, script/style/head/nav content is dropped. ``html.parser`` never fetches external
resources or expands DTD entities, which makes it safe for untrusted EPUB content.
Does NOT belong: EPUB packaging (``extract_epub.py``).
"""

from __future__ import annotations

from html.parser import HTMLParser

from ltts.documents.normalize import clean_inline
from ltts.documents.structures import Block

_SKIP = {"script", "style", "head", "title", "nav", "svg", "math", "template", "noscript", "rt", "rp"}
_BLOCKS = {
    "p", "div", "section", "article", "li", "blockquote", "pre", "tr", "td", "th", "dd", "dt",
    "figcaption", "aside", "header", "footer", "body", "br", "hr", "ul", "ol", "table",
}  # fmt: skip
_HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


class _BlockCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[Block] = []
        self._buffer: list[str] = []
        self._skip_depth = 0
        self._heading = False

    def _flush(self) -> None:
        text = clean_inline("".join(self._buffer))
        self._buffer.clear()
        if text:
            self.blocks.append(Block("heading" if self._heading else "paragraph", text))

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIP:
            self._skip_depth += 1
        elif tag in _HEADINGS:
            self._flush()
            self._heading = True
        elif tag in _BLOCKS:
            self._flush()
        elif tag == "img" and not self._skip_depth:
            alt = dict(attrs).get("alt")
            if alt and len(alt) > 3:
                self._buffer.append(f" {alt} ")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP:
            self._skip_depth = max(0, self._skip_depth - 1)
        elif tag in _HEADINGS:
            self._flush()
            self._heading = False
        elif tag in _BLOCKS:
            self._flush()

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self._buffer.append(data)

    def close(self) -> None:
        super().close()
        self._flush()


def html_to_blocks(markup: str) -> list[Block]:
    collector = _BlockCollector()
    collector.feed(markup)
    collector.close()
    return collector.blocks
