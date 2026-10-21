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
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from ltts.documents.segmenter import FIRST_MARK, MAX_MARKS, PAUSE_MARK
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


def _marks_in(text: str, count: int) -> list[int]:
    return [ord(char) - FIRST_MARK for char in text if FIRST_MARK <= ord(char) < FIRST_MARK + count]


@dataclass(frozen=True, slots=True)
class Annotation:
    index: int
    kind: str
    value: str


def _read_marks(
    index: int, text: str, marks: Sequence[Mark], open_ranges: dict[str, str]
) -> tuple[dict[str, str], list[Annotation]]:
    """The ranged marks covering one sentence (updating ``open_ranges``) and its pauses and sounds."""
    active = dict(open_ranges)
    points: list[Annotation] = []
    for number in _marks_in(text, len(marks)):
        mark = marks[number]
        if mark.kind in _RANGED and mark.closing:
            open_ranges.pop(mark.kind, None)
        elif mark.kind in _RANGED:
            open_ranges[mark.kind] = active[mark.kind] = mark.value
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
