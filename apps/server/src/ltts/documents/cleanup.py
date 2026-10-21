# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Find what in an extracted document shouldn't be read aloud: page furniture and footnote markers.

Scope: Deterministic and conservative (a miss is better than a wrong find). On paged documents (PDF),
lines at the top or bottom of pages repeated on many pages, digits ignored (running headers and
footers), and page-number lines that count along with the pages. On other documents, paragraphs that
only say "Page 12", "12 of 300" or "- 12 -", when several count up through it. In sentences,
superscript footnote markers after a word, and digits glued after punctuation only when the document
has a notes section holding those notes. Nothing is changed here: ``cleanup_store.py`` records and
applies the finds so they can be reviewed and undone.
Does NOT belong: Storing, applying or undoing the cleanup (``cleanup_store.py``) or reading PDFs.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from itertools import pairwise
from typing import Literal

from ltts.documents.structures import Furniture, SectionInfo, Segment

SkipReason = Literal["header", "footer", "page_number", "manual"]
SKIP_REASONS: tuple[str, ...] = ("header", "footer", "page_number", "manual")
AUTOMATIC: tuple[str, ...] = ("header", "footer", "page_number")  # the skips the cleanup makes (and undoes)
MIN_PAGES = 3  # shorter documents get no header, footer or page-number finds
MIN_RUN = 3  # page-number paragraphs or glued footnote markers needed before any of them is trusted
RUNNING_LINE_SHARE = 0.4  # a running header or footer is on at least this share of the pages
EDGE_LINES = 2  # lines at the top and at the bottom of a page that may be furniture

# Page numbers: "12", "Page 12", "12 of 300", "12/300", "- 12 -" (any dash) and Roman numerals ("xiv").
_PLAIN_NUMBER = re.compile(r"^(?:(page)\s*)?(\d{1,4})(?:\s*(of|/)\s*\d{1,4})?$", re.IGNORECASE)
_DASHED_NUMBER = re.compile(r"^[-–—]\s*(\d{1,4})\s*[-–—]$")
_ROMAN = re.compile(r"^(?=[ivxlc])c{0,3}(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$", re.IGNORECASE)
_ROMAN_VALUES = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}

SUPERSCRIPT_DIGITS = "".join(map(chr, (0x2070, 0xB9, 0xB2, 0xB3, *range(0x2074, 0x207A))))
_LETTER = rf"[^\W\d_{SUPERSCRIPT_DIGITS}]"
_ALNUM = rf"[^\W_{SUPERSCRIPT_DIGITS}]"
# A superscript marker ends a word of three letters or more, or follows punctuation after a word or
# number ("war.¹", "(1999).²", 'said.”³'), and no word character follows it.
_SUPERSCRIPT = re.compile(
    rf"(?<!\S)(\S*?(?:{_LETTER}{{3}}|{_ALNUM}[.,;:!?\"'”’)\]]{{1,2}}))([{SUPERSCRIPT_DIGITS}]+)(?!\w)"
)
# Superscripts starting a word are verse numbers ("¹In the beginning"); a document using them keeps all.
_VERSE_LIKE = re.compile(rf"(?<!\S)[{SUPERSCRIPT_DIGITS}]+")
# Up to three digits glued after punctuation that ends a word of two letters or more ("war.12 The").
_GLUED = re.compile(rf"(?<!\S)(\S*?({_LETTER}{{2,}})(?:[.,;:!?][\"'”’)\]]?|[\"'”’)\]]))(\d{{1,3}})(?=\s|$)")
_TRAILING_WORD = re.compile(rf"({_LETTER}+)\W*$")
_MATH = re.compile(r"[+=*/^<>]")
_UNITS = frozenset({"metre", "metres", "meter", "meters", "feet", "foot", "inch", "inches", "yard", "yards",
                    "mile", "miles", "sec", "secs"})  # fmt: skip
# Words a glued number belongs to rather than marks a note: "Fig.12", "No.5", "vol.3".
_REFERENCE_WORDS = frozenset({
    "no", "nos", "nr", "fig", "figs", "vol", "vols", "pp", "ch", "chap", "sec", "sect", "art", "eq", "ref",
    "refs", "para", "op", "cf", "ed", "eds", "ibid", "ver", "ps", "pt", "bk", "tab", "app", "page", "line",
    "verse", "item", "note", "notes", "chapter", "part", "table", "figure", "psalm", "step", "level",
    "room", "grade", "class", "act", "scene", "book", "vs", "st", "dr", "mr", "mrs", "ms", "mt", "ft",
})  # fmt: skip
_NOTES_TITLE = re.compile(r"^(?:foot|end|chapter )?notes[.:]?$", re.IGNORECASE)
_NOTE_BODY = re.compile(r"^\[?(\d{1,3})\]?[.):]?(?:\s+\S|$)")  # "1. A note", or "1." alone
_NAMES = {
    "header": ("running header", "running headers"),
    "footer": ("running footer", "running footers"),
    "page_number": ("page number", "page numbers"),
}

Pair = tuple[str, str]  # (written, spoken): a word with its footnote marker, and the word without it


@dataclass(frozen=True, slots=True)
class PageNumber:
    value: int
    roman: bool = False
    explicit: bool = False  # says it is a page number: "Page 12", "12 of 300" or "- 12 -"


def _roman_value(numeral: str) -> int:
    values = [_ROMAN_VALUES[char] for char in numeral.lower()]
    return sum(-value if value < after else value for value, after in zip(values, [*values[1:], 0], strict=True))


def page_number(line: str) -> PageNumber | None:
    """The page number a line consists of, when that is all it is."""
    text = line.strip()
    if match := _PLAIN_NUMBER.match(text):
        return PageNumber(int(match.group(2)), explicit=bool(match.group(1) or match.group(3)))
    if match := _DASHED_NUMBER.match(text):
        return PageNumber(int(match.group(1)), explicit=True)
    if _ROMAN.match(text):
        return PageNumber(_roman_value(text), roman=True)
    return None


def is_page_number(line: str) -> bool:
    return page_number(line) is not None


def running_key(line: str) -> str:
    """A line as compared across pages: lower case, with every run of digits alike (numbered headers)."""
    return re.sub(r"\d+", "#", line.lower()).strip()


def _edges(count: int) -> tuple[range, range]:
    """Positions of a page's top and bottom lines that may be furniture; short pages offer only their outermost."""
    depth = min(EDGE_LINES if count > 2 * EDGE_LINES + 1 else 1, count)
    return range(depth), range(max(count - depth, depth), count)


def _edge_lines(pages: Sequence[Sequence[str]]) -> Iterator[tuple[int, int, str]]:
    """(page, position, line) for every line at the top or bottom edge of a page."""
    for page, lines in enumerate(pages):
        top, bottom = _edges(len(lines))
        for position in (*top, *bottom):
            yield page, position, lines[position]


def _repeated_lines(pages: Sequence[Sequence[str]]) -> set[str]:
    """Running keys of edge lines (not page numbers) found on at least RUNNING_LINE_SHARE of the pages."""
    seen = {(page, running_key(line)) for page, _, line in _edge_lines(pages) if not is_page_number(line)}
    pages_with = Counter(key for _, key in seen)
    threshold = max(MIN_PAGES, math.ceil(len(pages) * RUNNING_LINE_SHARE))
    return {key for key, count in pages_with.items() if key and count >= threshold}


def _counting_numbers(pages: Sequence[Sequence[str]]) -> set[tuple[int, int]]:
    """Page-number lines whose number keeps the same distance from its page's position on MIN_PAGES pages.

    A chapter numbered "3" at the top of page 40 doesn't count along, so it is never taken for one.
    """
    candidates: list[tuple[int, int, tuple[bool, int]]] = []
    for page, position, line in _edge_lines(pages):
        number = page_number(line)
        if number is not None:
            candidates.append((page, position, (number.roman, number.value - page)))
    pages_per_offset = Counter(offset for _, offset in {(page, offset) for page, _, offset in candidates})
    return {(page, position) for page, position, offset in candidates if pages_per_offset[offset] >= MIN_PAGES}


def find_furniture(pages: Sequence[Sequence[str]], headings: Iterable[str] = ()) -> list[dict[int, Furniture]]:
    """Each page's furniture lines by their position on the page (none for fewer than MIN_PAGES pages).

    A line repeated at the top or bottom of at least RUNNING_LINE_SHARE of the pages (and MIN_PAGES of
    them) is a running header or footer; a page-number line is one only when it counts along with the
    pages (``_counting_numbers``). ``headings``, the outline's chapter titles, are never furniture.
    """
    found: list[dict[int, Furniture]] = [{} for _ in pages]
    if len(pages) < MIN_PAGES:
        return found
    protected = {running_key(title) for title in headings if not is_page_number(title)}
    numbers = _counting_numbers(pages)
    repeated = _repeated_lines(pages) - protected
    for page, position, line in _edge_lines(pages):
        key = running_key(line)
        if key in protected:
            continue
        if (page, position) in numbers:
            found[page][position] = "page_number"
        elif key in repeated:
            found[page][position] = "header" if position in _edges(len(pages[page]))[0] else "footer"
    return found


def is_top(position: int, count: int) -> bool:
    """Whether a furniture line at ``position`` of a page with ``count`` lines is at its top."""
    return position in _edges(count)[0]


@dataclass(slots=True)
class Findings:
    """What an import found: sentences to skip and why, and footnote markers to leave unread."""

    skips: dict[int, Furniture] = field(default_factory=dict)
    footnotes: dict[int, list[Pair]] = field(default_factory=dict)

    def counts(self) -> dict[str, int]:
        found: Counter[str] = Counter(self.skips.values())
        return {**{reason: found[reason] for reason in AUTOMATIC}, "footnote": count_markers(self.footnotes.values())}


def count_markers(pairs: Iterable[Sequence[Pair]]) -> int:
    return sum(len(sentence) for sentence in pairs)


def _page_number_paragraphs(segments: Sequence[Segment]) -> dict[int, Furniture]:
    """Paragraphs that only say which page this was ("Page 12", "12 of 300", "- 12 -"), trusted when at
    least MIN_RUN of them count up through the document. Bare numbers could be chapter numbers: never."""
    sizes = Counter(segment.paragraph_index for segment in segments)
    found = [
        (segment.index, number.value)
        for segment in segments
        if segment.kind == "paragraph"
        and sizes[segment.paragraph_index] == 1
        and (number := page_number(segment.text)) is not None
        and number.explicit
    ]
    values = [value for _, value in found]
    if len(found) < MIN_RUN or any(later <= earlier for earlier, later in pairwise(values)):
        return {}
    return {index: "page_number" for index, _ in found}


def _notes(segments: Sequence[Segment], sections: Sequence[SectionInfo]) -> tuple[set[int], set[int]]:
    """The sentences of the document's notes (a "Notes" section or heading) and the note numbers they hold."""
    titled = {info.index for info in sections if _NOTES_TITLE.match(info.title.strip())}
    inside: set[int] = set()
    numbers: set[int] = set()
    in_notes, section, paragraph = False, -1, -1
    for segment in segments:
        if segment.section_index != section:
            in_notes, section = False, segment.section_index
        if segment.kind == "heading":
            in_notes = bool(_NOTES_TITLE.match(segment.text.strip()))
        if in_notes or section in titled:
            inside.add(segment.index)
            body = _NOTE_BODY.match(segment.text) if segment.paragraph_index != paragraph else None
            if body:
                numbers.add(int(body.group(1)))
        paragraph = segment.paragraph_index
    return inside, numbers


def _superscript_pairs(text: str) -> list[Pair]:
    pairs: list[Pair] = []
    for match in _SUPERSCRIPT.finditer(text):
        before = match.group(1)
        word = _TRAILING_WORD.search(before)
        if _MATH.search(before) or (word and word.group(1).lower() in _UNITS):
            continue
        pairs.append((match.group(0), before))
    return pairs


def _glued_pairs(segments: Sequence[Segment], notes: set[int], numbers: set[int]) -> dict[int, list[Pair]]:
    """Digits glued after punctuation that number one of the document's notes, when MIN_RUN are found."""
    found: dict[int, list[Pair]] = {}
    for segment in segments:
        if segment.index in notes:
            continue
        for match in _GLUED.finditer(segment.text):
            if int(match.group(3)) in numbers and match.group(2).lower() not in _REFERENCE_WORDS:
                found.setdefault(segment.index, []).append((match.group(0), match.group(1)))
    return found if count_markers(found.values()) >= MIN_RUN else {}


def _footnotes(segments: Sequence[Segment], sections: Sequence[SectionInfo]) -> dict[int, list[Pair]]:
    notes, numbers = _notes(segments, sections)
    glued = _glued_pairs(segments, notes, numbers) if numbers else {}
    verses = sum(len(_VERSE_LIKE.findall(segment.text)) for segment in segments) >= MIN_RUN
    found: dict[int, list[Pair]] = {}
    for segment in segments:
        pairs = ([] if verses else _superscript_pairs(segment.text)) + glued.get(segment.index, [])
        if pairs:
            found[segment.index] = list(dict.fromkeys(pairs))
    return found


def find(segments: Sequence[Segment], sections: Sequence[SectionInfo], *, paged: bool) -> Findings:
    """What to skip, and which footnote markers to leave unread, in a segmented document.

    Furniture comes from the extractor (``Segment.furniture``, paged documents); other documents are
    searched for page-number paragraphs. Skipped sentences are never searched for footnote markers.
    """
    skips: dict[int, Furniture] = {}
    for segment in segments:
        if segment.furniture is not None:
            skips[segment.index] = segment.furniture
    if not paged:
        skips.update(_page_number_paragraphs(segments))
    return Findings(skips, _footnotes([s for s in segments if s.index not in skips], sections))


def _join(names: Sequence[str]) -> str:
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def describe(counts: Mapping[str, int]) -> str | None:
    """The notice an import adds to the document's warnings, from how many sentences of each reason (and
    how many footnote markers) the cleanup found; None when it found nothing."""
    reasons = [reason for reason in AUTOMATIC if counts.get(reason)]
    total = sum(counts[reason] for reason in reasons)
    parts = [f"{total} {_join([_NAMES[reason][total != 1] for reason in reasons])}"] if total else []
    markers = counts.get("footnote", 0)
    if markers:
        parts.append(f"{markers} footnote marker{'s' if markers != 1 else ''}")
    them = "it" if total + markers == 1 else "them"
    return f"Skipped {', and '.join(parts)} when reading aloud; you can review {them}." if parts else None
