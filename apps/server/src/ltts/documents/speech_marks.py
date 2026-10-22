# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Optional speech marks in pasted or plain text: pauses, voices, effects, styles, sounds, pronunciations.

Scope: Only when turned on for a document. Readable marks in braces, never code: ``{pause}``/``{pause 2s}``
(the sentence ends there), ``{voice Sam}…{/voice}`` (a voice's name or id), ``{effect radio}…{/effect}``,
``{style calm}…{/style}``, ``{sound laugh}`` (before its sentence) and ``{say Kael = Kay-el}``. ``{{``
writes a literal brace; anything else in braces stays as text, with a warning naming it. ``encode`` swaps
each recognised mark for a private-use character that survives extraction and segmentation (characters
already in the text from that range are dropped, so text can't forge a mark); ``apply`` turns them into
sentence annotations, and ``strip`` removes them, so the text the reader sees never contains a mark.
Does NOT belong: Storing annotations (``styling.py``) or splitting sentences (``segmenter.py``).
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field

from ltts.documents.segmenter import FIRST_MARK, MAX_MARKS, PAUSE_MARK
from ltts.documents.structures import SectionInfo, Segment
from ltts.documents.styling import SOUNDS, STYLES
from ltts.effects import EFFECTS

_MARK = re.compile(r"(?<!\{)\{(/?)([a-z]+)(?:\s+([^{}]{1,200}))?\}(?!\})")
_PAUSE = re.compile(r"^(\d{1,5})\s*(ms|s)?$")
_RANGED = {"voice", "effect", "style"}
_KINDS = {"pause", "sound", "say", *_RANGED}


@dataclass(frozen=True, slots=True)
class Mark:
    kind: str  # pause, voice, effect, style, sound, say
    value: str
    closing: bool = False


@dataclass
class Encoded:
    text: str
    marks: list[Mark] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _pause_ms(value: str) -> int | None:
    match = _PAUSE.match(value.strip() or "1s")
    if not match:
        return None
    amount = int(match.group(1))
    milliseconds = amount if match.group(2) == "ms" else amount * 1000
    return milliseconds if 0 <= milliseconds <= 10_000 else None


def _valid(kind: str, value: str) -> str | None:
    """Why a mark can't be used, or None when it can (voices are checked later, against the voices)."""
    checks = {
        "pause": (_pause_ms(value) is not None, "a pause takes a length up to 10 s, such as {pause 2s}"),
        "effect": (value in EFFECTS, f"there is no effect called {value!r}"),
        "style": (value in STYLES, f"there is no speaking style called {value!r}"),
        "sound": (value in SOUNDS, f"there is no sound called {value!r}"),
        "say": (
            "=" in value and all(part.strip() for part in value.split("=", 1)),
            "write it as {say word = how to say it}",
        ),
        "voice": (bool(value), "name the voice, such as {voice Sam}"),
    }
    fine, problem = checks[kind]
    return None if fine else problem


def _problem(closing: bool, kind: str, value: str) -> str | None:
    if kind not in _KINDS:
        return "it isn't a speech mark"
    if closing:
        return None if kind in _RANGED else "only voice, effect and style marks are closed"
    return _valid(kind, value)


def _is_mark(char: str) -> bool:
    return char == PAUSE_MARK or FIRST_MARK <= ord(char) < FIRST_MARK + MAX_MARKS


def encode(text: str) -> Encoded:
    """Swap recognised marks for private-use characters; unknown ones stay as text with a warning."""
    text = "".join(char for char in text if not _is_mark(char))  # never let the text forge a mark
    encoded = Encoded("")
    pieces: list[str] = []
    position = 0
    for match in _MARK.finditer(text):
        pieces.append(text[position : match.start()])
        position = match.end()
        closing, kind, value = match.group(1) == "/", match.group(2), (match.group(3) or "").strip()
        problem = _problem(closing, kind, value)
        if not problem and len(encoded.marks) >= MAX_MARKS:
            problem = "too many marks"
        if problem:
            encoded.warnings.append(f"Speech mark {match.group(0)!r} was left as text: {problem}.")
            pieces.append(match.group(0))
            continue
        encoded.marks.append(Mark(kind, value, closing))
        mark = chr(FIRST_MARK + len(encoded.marks) - 1)
        pieces.append(mark + PAUSE_MARK if kind == "pause" else mark)
    pieces.append(text[position:])
    encoded.text = "".join(pieces).replace("{{", "{").replace("}}", "}")
    return encoded


def strip(text: str) -> str:
    """Text without any mark characters, with the spacing they leave behind tidied."""
    return " ".join("".join(" " if _is_mark(char) else char for char in text).split())


_RANK = {"sentence": 0, "line": 1, "paragraph": 2, "section": 3}


def fold(segments: list[Segment], sections: list[SectionInfo]) -> tuple[list[Segment], list[SectionInfo]]:
    """Move marks standing alone (a line holding only ``{voice Sam}``) onto the sentence they belong to.

    A lone pause belongs to the sentence before it; any other lone mark to the sentence after it (or the
    one before, at the very end). Sentences and sections are then numbered again without the empty ones.
    """
    kept: list[Segment] = []
    carried = ""
    for segment in segments:
        if strip(segment.text):
            segment.text = carried + segment.text
            carried = ""
            kept.append(segment)
            continue
        alone = "".join(char for char in segment.text if _is_mark(char))
        if kept and _RANK[segment.boundary] > _RANK[kept[-1].boundary]:
            kept[-1].boundary = segment.boundary  # keep the paragraph or section break it ended
        if PAUSE_MARK in alone and kept:
            kept[-1].text += alone
        else:
            carried += alone
    if carried and kept:
        kept[-1].text += carried
    return kept, _renumber(kept, sections)


def _renumber(kept: list[Segment], sections: list[SectionInfo]) -> list[SectionInfo]:
    firsts: dict[int, int] = {}
    counts: dict[int, int] = {}
    for position, segment in enumerate(kept):
        segment.index = position
        firsts.setdefault(segment.section_index, position)
        counts[segment.section_index] = counts.get(segment.section_index, 0) + 1
    out: list[SectionInfo] = []
    numbers: dict[int, int] = {}
    for section in sections:
        if section.index in counts:
            numbers[section.index] = len(out)
            out.append(SectionInfo(len(out), section.title, firsts[section.index], counts[section.index], section.page))
    for segment in kept:
        segment.section_index = numbers[segment.section_index]
    return out


def _marks_in(text: str, count: int) -> list[tuple[int, bool, bool]]:
    """Each mark in ``text`` as (number, before the sentence's words, after them)."""
    words = [position for position, char in enumerate(text) if not (_is_mark(char) or char.isspace())]
    first, last = (words[0], words[-1]) if words else (len(text), -1)
    return [
        (ord(char) - FIRST_MARK, position < first, position > last)
        for position, char in enumerate(text)
        if FIRST_MARK <= ord(char) < FIRST_MARK + count
    ]


@dataclass(frozen=True, slots=True)
class Annotation:
    index: int
    kind: str
    value: str


@dataclass(frozen=True, slots=True)
class MarkHooks:
    """What importing marked text needs from the rest of the app."""

    find_voice: Callable[[str], str | None]  # a mark's voice name or id -> a voice id, or None
    annotate: Callable[[str, int, str, str], None]  # (document, sentence, kind, value)


def voice_finder(voices: Callable[[], Iterable[tuple[str, str]]]) -> Callable[[str], str | None]:
    """Find a mark's voice by id or name (ignoring case) among ``voices()``, listed once, when first needed."""
    known: dict[str, str] = {}

    def find(wanted: str) -> str | None:
        if not known:
            for voice_id, name in voices():
                known.setdefault(name.casefold(), voice_id)
                known[voice_id.casefold()] = voice_id
        return known.get(wanted.strip().casefold())

    return find


def _read_marks(
    index: int, text: str, marks: Sequence[Mark], open_ranges: dict[str, str]
) -> tuple[dict[str, str], list[Annotation]]:
    """The ranged marks covering one sentence (updating ``open_ranges``) and its pauses and sounds.

    A range closed before the sentence's words doesn't cover it; one opened after them starts with the next.
    """
    active = dict(open_ranges)
    points: list[Annotation] = []
    for number, before, after in _marks_in(text, len(marks)):
        mark = marks[number]
        if mark.kind in _RANGED and mark.closing:
            open_ranges.pop(mark.kind, None)
            if before:
                active.pop(mark.kind, None)
        elif mark.kind in _RANGED:
            open_ranges[mark.kind] = mark.value
            if not after:
                active[mark.kind] = mark.value
        elif mark.kind == "pause":
            points.append(Annotation(index, "pause", str(_pause_ms(mark.value))))
        elif mark.kind == "sound":
            points.append(Annotation(index, "sound", mark.value))
    return active, points


def _said_as(text: str, says: Sequence[tuple[str, str]]) -> list[list[str]]:
    plain = strip(text)
    return [[written, said] for written, said in says if re.search(rf"(?<!\w){re.escape(written)}(?!\w)", plain)]


def apply(
    segments: Sequence[tuple[int, str]],
    marks: Sequence[Mark],
    find_voice: Callable[[str], str | None],
) -> tuple[list[Annotation], list[str]]:
    """Annotations for the marked sentences ``(index, text)``, and warnings for voices that don't exist."""
    annotations: list[Annotation] = []
    warnings: list[str] = []
    open_ranges: dict[str, str] = {}
    says = [
        (written.strip(), said.strip()) for written, said in (m.value.split("=", 1) for m in marks if m.kind == "say")
    ]
    for index, text in segments:
        active, points = _read_marks(index, text, marks, open_ranges)
        annotations += points
        for kind, value in active.items():
            chosen = find_voice(value) if kind == "voice" else value
            if chosen is None:
                warnings.append(f"Speech marks: there is no voice called {value!r}, so the reading voice is used.")
            else:
                annotations.append(Annotation(index, kind, chosen))
        replacements = _said_as(text, says)
        if replacements:
            annotations.append(Annotation(index, "speak_as", json.dumps(replacements)))
    return annotations, sorted(set(warnings))
