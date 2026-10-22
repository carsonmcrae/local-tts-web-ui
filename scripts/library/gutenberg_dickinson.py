# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Turn the Project Gutenberg text of Emily Dickinson's three series of poems into verse chapters.

Scope: Reads the plain text (#12242: the 1890, 1891 and 1896 series edited by Todd and Higginson), drops
the Project Gutenberg start and end markers and the transcriber's note, keeps each series' preface and
its four sections (Life, Love, Nature, Time and Eternity) as chapters, and sets every poem as verse: a
numbered heading with the editors' title when there is one, stanzas as paragraphs, lines kept as lines
with their indentation, and the editors' bracketed notes as plain paragraphs. The text itself is not
changed.
Does NOT belong: Packaging (epub_rewrite.write_epub) or rights (sources.json).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from epub_rewrite import EPUB, XHTML, Chapter, roman_to_int, xml_text

SECTIONS = ("LIFE", "LOVE", "NATURE", "TIME AND ETERNITY")
SMALL_WORDS = frozenset({"and", "of", "the", "a", "an", "in", "to", "at", "for", "on", "or", "by"})
SERIES_NAMES = {1: "First Series", 2: "Second Series", 3: "Third Series"}
_START = re.compile(r"^\*\*\* START OF THE PROJECT GUTENBERG EBOOK")
_END = re.compile(r"^\*\*\* END OF THE PROJECT GUTENBERG EBOOK")
_NUMBER = re.compile(r"^([IVXLC]+)\.$")
_SECTION_ONE_LINE = re.compile(r"^(I|II|III|IV)\. (LIFE|LOVE|NATURE|TIME AND ETERNITY)\.$")
_SECTION_NAME = re.compile(r"^(LIFE|LOVE|NATURE|TIME AND ETERNITY)\.$")
_TITLE = re.compile(r"^[A-Z][A-Z' ,!?;:-]*[A-Z!?]\.?$")
_PREFACE = re.compile(r"^PREFACE\.?$")


@dataclass
class Poem:
    number: int
    title: str | None
    part: str | None = None  # a part label when one title covers two numbered poems ("Forbidden Fruit", I and II)
    notes: list[str] = field(default_factory=list)
    stanzas: list[list[str]] = field(default_factory=list)


@dataclass
class Section:
    series: int
    name: str  # "Preface", "Life", ...
    prose: list[str] = field(default_factory=list)
    poems: list[Poem] = field(default_factory=list)

    @property
    def stem(self) -> str:
        return f"series-{self.series}-{self.name.lower().replace(' ', '-')}"

    @property
    def title(self) -> str:
        return f"{SERIES_NAMES[self.series]}: {self.name}"


def title_case(caps: str) -> str:
    """The editors' capitalised titles as ordinary titles: "LOVE'S BAPTISM." becomes "Love's Baptism"."""
    text = caps.rstrip(".")
    words = re.sub(r"[A-Za-z]+(?:'[A-Za-z]+)?", lambda m: m.group(0)[0] + m.group(0)[1:].lower(), text).split(" ")
    return " ".join(w.lower() if i and w.lower() in SMALL_WORDS else w for i, w in enumerate(words))


def _body_lines(text: str) -> list[str]:
    lines = text.splitlines()
    start = next(i for i, line in enumerate(lines) if _START.match(line)) + 1
    end = next(i for i, line in enumerate(lines) if _END.match(line))
    body = lines[start:end]
    # The transcriber's note (2004) is not part of the book: from its heading to its signature.
    note = next((i for i, line in enumerate(body) if line.strip() == "TRANSCRIBER'S NOTE"), None)
    if note is not None:
        signed = next(i for i in range(note, len(body)) if body[i].strip() == "---JT")
        del body[note : signed + 1]
    return [line.rstrip() for line in body]


def _section_heading(lines: list[str], i: int) -> tuple[str, int] | None:
    """A section heading at line ``i``: its name and the next line to read, or None."""
    one = _SECTION_ONE_LINE.match(lines[i])
    if one:
        return one.group(2), i + 1
    number = _NUMBER.match(lines[i])
    if number and roman_to_int(number.group(1)) in (1, 2, 3, 4):
        j = i + 1
        while j < len(lines) and not lines[j].strip():
            j += 1
        name = _SECTION_NAME.match(lines[j]) if j < len(lines) else None
        # "III." then "LOVE." is a poem called Love unless Love is the third section: the number must fit.
        if name and SECTIONS.index(name.group(1)) + 1 == roman_to_int(number.group(1)):
            return name.group(1), j + 1
    return None


def parse(text: str) -> list[Section]:
    lines = _body_lines(text)
    sections: list[Section] = []
    series = 0
    current: Section | None = None
    poem: Poem | None = None
    stanza: list[str] = []
    i = 0

    def flush_stanza() -> None:
        nonlocal stanza
        if stanza and poem is not None:
            poem.stanzas.append(stanza)
        stanza = []

    while i < len(lines):
        line = lines[i]
        if line.strip() == "POEMS" and i + 2 < len(lines) and lines[i + 2].strip() == "by EMILY DICKINSON":
            flush_stanza()
            series, poem = series + 1, None
            current = None
            i += 3
            continue
        if _PREFACE.match(line.strip()):
            flush_stanza()
            current, poem = Section(series, "Preface"), None
            sections.append(current)
            i += 1
            continue
        heading = _section_heading(lines, i)
        if heading:
            flush_stanza()
            current, poem = Section(series, title_case(heading[0])), None
            sections.append(current)
            i = heading[1]
            continue
        if current is None:
            i += 1  # the series title page
            continue
        if not line.strip():
            flush_stanza()
            i += 1
            continue
        if current.name != "Preface" and _NUMBER.match(line):
            numeral = _NUMBER.match(line).group(1)  # type: ignore[union-attr]
            if poem is not None and not poem.stanzas and not stanza:
                poem.part = numeral  # a numbered part of the poem just announced, not a new poem
            else:
                flush_stanza()
                poem = Poem(roman_to_int(numeral) or 0, None)
                current.poems.append(poem)
            i += 1
            continue
        if current.name == "Preface" and line.startswith("    "):
            if poem is None:  # the series' epigraph, set as verse without a heading
                poem = Poem(0, None)
                current.poems.append(poem)
            stanza.append(line)
            i += 1
            continue
        if poem is not None and not poem.stanzas and not stanza and poem.title is None and _TITLE.match(line) and len(line) < 60:
            poem.title = title_case(line)
            i += 1
            continue
        if poem is not None and not poem.stanzas and line.startswith("["):
            note = [line]
            while not note[-1].rstrip().endswith("]"):
                i += 1
                note.append(lines[i])
            poem.notes.append(" ".join(part.strip() for part in note).strip("[]"))
            i += 1
            continue
        if current.name == "Preface" or poem is None:
            # Prose (the editors' prefaces, or a stray epigraph before the first section): paragraphs.
            paragraph = [line.strip()]
            while i + 1 < len(lines) and lines[i + 1].strip() and not _section_heading(lines, i + 1):
                i += 1
                paragraph.append(lines[i].strip())
            current.prose.append(" ".join(paragraph))
            i += 1
            continue
        stanza.append(line)
        i += 1
    flush_stanza()
    return [s for s in sections if s.prose or s.poems]


def _verse(stanzas: list[list[str]]) -> str:
    out: list[str] = []
    for stanza in stanzas:
        spans: list[str] = []
        for line in stanza:
            indent = len(line) - len(line.lstrip(" "))
            level = min(indent // 2, 3)
            attr = f' class="i{level}"' if level else ""
            spans.append(f"<span{attr}>{xml_text(line.strip())}</span>")
        out.append("<p>" + "<br/>".join(spans) + "</p>")
    return "".join(out)


def _chapter(section: Section) -> Chapter:
    parts = [f'<h2 epub:type="title">{xml_text(section.title)}</h2>']
    parts += [f"<p>{xml_text(p)}</p>" for p in section.prose]
    for poem in section.poems:
        heading = f"{poem.number}. {poem.title}" if poem.title else f"{poem.number}."
        if poem.part:
            heading += f" ({poem.part})"
        parts.append('<article epub:type="z3998:poem">' + (f"<h3>{xml_text(heading)}</h3>" if poem.number else ""))
        parts += [f"<p>{xml_text(note)}</p>" for note in poem.notes]
        parts.append(_verse(poem.stanzas))
        parts.append("</article>")
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f'<html xmlns="{XHTML}" xmlns:epub="{EPUB}" xml:lang="en-US" lang="en-US">'
        f"<head><title>{xml_text(section.title)}</title></head>"
        f'<body epub:type="bodymatter"><section id="{section.stem}" epub:type="chapter">{"".join(parts)}</section></body></html>\n'
    )
    return Chapter(stem=section.stem, title=section.title, xml=xml.encode("utf-8"))


def dickinson_chapters(text: str) -> list[Chapter]:
    sections = parse(text)
    for section in sections:  # every section numbers its poems 1, 2, 3… without a gap or a repeat
        numbers = [poem.number for poem in section.poems if poem.number]
        if numbers != list(range(1, len(numbers) + 1)):
            raise SystemExit(f"Dickinson {section.title}: poem numbers are not 1..{len(numbers)}: {numbers}")
    if sum(len(s.poems) for s in sections if s.series == 1 and s.name != "Preface") != 115:
        raise SystemExit("Dickinson first series: expected the printed 115 poems")
    return [_chapter(section) for section in sections]
