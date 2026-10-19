"""Purpose: Markdown extraction into headed sections of readable paragraphs.

Scope: Parses CommonMark with raw HTML disabled; H1/H2 headings start sections, deeper headings
become heading blocks; links read as their text, images as their alt text; fenced code is skipped
with a single spoken note so listeners know something was omitted.
Does NOT belong: Plain-text heuristics (``extract_text.py``).
"""

from __future__ import annotations

from pathlib import Path

from markdown_it import MarkdownIt
from markdown_it.token import Token

from ltts.documents.extract_text import decode_bytes
from ltts.documents.normalize import clean_inline
from ltts.documents.structures import Block, ExtractedSection, Extraction

_BLOCK_OPEN = {"paragraph_open", "heading_open", "list_item_open", "blockquote_open"}


def _inline_text(token: Token) -> str:
    parts: list[str] = []
    for child in token.children or []:
        if child.type in {"text", "code_inline"}:
            parts.append(child.content)
        elif child.type == "image":
            parts.append(child.content or "")
        elif child.type in {"softbreak", "hardbreak"}:
            parts.append(" ")
    return clean_inline("".join(parts))


class _SectionBuilder:
    """Accumulates blocks; H1/H2 headings start a new section."""

    def __init__(self, title: str) -> None:
        self.sections: list[ExtractedSection] = []
        self.current = ExtractedSection(title=title)

    def add(self, text: str, heading_level: int | None) -> None:
        if heading_level is not None and heading_level <= 2:
            self.flush()
            self.current = ExtractedSection(title=text, blocks=[Block("heading", text)])
        else:
            self.current.blocks.append(Block("heading" if heading_level else "paragraph", text))

    def flush(self) -> None:
        if self.current.blocks:
            self.sections.append(self.current)


def markdown_to_extraction(source: str, title: str | None) -> Extraction:
    tokens = MarkdownIt("commonmark", {"html": False}).parse(source)
    builder = _SectionBuilder(title or "Document")
    pending_heading: int | None = None
    for token in tokens:
        if token.type == "heading_open":
            pending_heading = int(token.tag[1])
        elif token.type == "inline":
            text = _inline_text(token)
            if text:
                builder.add(text, pending_heading)
            pending_heading = None
        elif token.type in {"fence", "code_block"}:
            builder.add("(A code block is omitted here.)", None)
    builder.flush()
    sections = builder.sections
    doc_title = title
    if sections and sections[0].blocks and sections[0].blocks[0].kind == "heading":
        doc_title = sections[0].blocks[0].text
    return Extraction(title=doc_title, sections=sections)


def extract_markdown_file(path: Path, title: str | None) -> Extraction:
    return markdown_to_extraction(decode_bytes(path.read_bytes()), title)
