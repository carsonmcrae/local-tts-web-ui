# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Decide, locally and deterministically, how each sentence of a document should be read.

Scope: Reads the document in order and looks at each sentence's context (its kind, its paragraph,
whether a quotation is still open from an earlier sentence). For every sentence it gives:
- its speaking style: narration, question, lively, dialogue or calm;
- whether it wants a steadier delivery (headings, list items, announcements);
- the speaker of its quoted speech when a dialogue tag names one ("…," said Nicole / Nicole asked, "…");
- its quoted and unquoted parts, so narration and dialogue can be voiced separately.

Dialogue tags shape the style (whispered → calm, shouted → lively, asked → question), as do
parentheses, interjections and question or exclamation marks. Nothing is guessed that the text does
not show: an untagged line has no speaker, and sarcasm or stressed words are left alone, because
punctuation cannot reveal them.
Does NOT belong: Voices, synthesis or storage; ``styling.py`` combines this with the user's choices.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

NARRATION, QUESTION, LIVELY, DIALOGUE, CALM = "narration", "question", "lively", "dialogue", "calm"
OPEN_QUOTES = '"\N{LEFT DOUBLE QUOTATION MARK}\N{LEFT-POINTING DOUBLE ANGLE QUOTATION MARK}'
CLOSE_QUOTES = '"\N{RIGHT DOUBLE QUOTATION MARK}\N{RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK}'
_CLOSERS = (
    "\"')] \N{RIGHT DOUBLE QUOTATION MARK}\N{RIGHT SINGLE QUOTATION MARK}\N{RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK}"
)
_QUIET_VERBS = ("whispered", "murmured", "muttered", "breathed", "sighed", "mumbled", "hissed", "sobbed", "wept")
_LOUD_VERBS = ("shouted", "yelled", "screamed", "cried", "exclaimed", "snapped", "roared", "bellowed", "laughed",
               "shrieked", "called")  # fmt: skip
_ASK_VERBS = ("asked", "wondered", "inquired", "enquired", "demanded", "queried")
_SAY_VERBS = ("said", "replied", "answered", "added", "told", "continued", "explained", "agreed", "began",
              "insisted", "offered", "admitted", "remarked", "repeated", "warned", "promised", "joked", "teased",
              "suggested")  # fmt: skip
_SPEECH = "|".join((*_QUIET_VERBS, *_LOUD_VERBS, *_ASK_VERBS, *_SAY_VERBS, "says", "asks", "whispers", "shouts"))
_NAME = r"((?:[A-Z][a-z'\N{RIGHT SINGLE QUOTATION MARK}-]+)(?: [A-Z][a-z'-]+)?)"
_NOT_NAMES = frozenset({"He", "She", "They", "It", "I", "We", "You", "The", "A", "An", "His", "Her", "Their",
                        "Then", "And", "But", "So", "Someone", "Somebody", "Everyone", "Nobody"})  # fmt: skip
_TAG_AFTER = re.compile(rf"^\W*(?:{_SPEECH})\s+{_NAME}\b|^\W*{_NAME}\s+(?:{_SPEECH})\b")
_TAG_BEFORE = re.compile(rf"\b{_NAME}\s+(?:{_SPEECH})\W*$|\b(?:{_SPEECH})\s+{_NAME}\W*$")
_INTERJECTION = re.compile(r"^(oh|ah|wow|hey|no|yes|ouch|oops|ha|whoa|hooray|alas|what|ugh)\b[\s,!.?]*", re.I)
_LIST_ITEM = re.compile(r"^\s*(?:[-*\N{BULLET}\N{EN DASH}]|\(?\d{1,3}[.)]|\(?[a-z][.)])\s+")
_ANNOUNCEMENT = re.compile(
    r"^(attention|ladies and gentlemen|now boarding|please note|warning|this is an announcement)\b", re.I
)


@dataclass(frozen=True, slots=True)
class Part:
    text: str
    quoted: bool


@dataclass(frozen=True, slots=True)
class Line:
    """How one sentence should be read."""

    style: str
    steady: bool = False  # headings, lists and announcements read evenly
    speaker: str | None = None  # the character a dialogue tag names
    parts: tuple[Part, ...] = ()  # quoted and unquoted pieces, when the sentence mixes them

    @property
    def dialogue(self) -> bool:
        return any(part.quoted for part in self.parts) or self.style == DIALOGUE


@dataclass(frozen=True, slots=True)
class Sentence:
    index: int
    paragraph: int
    kind: str  # heading or paragraph
    text: str


def _split(text: str, open_at_start: bool) -> tuple[list[Part], bool]:
    """The sentence's quoted and unquoted parts, and whether a quotation is still open at its end."""
    parts: list[Part] = []
    quoted = open_at_start
    current = ""
    for char in text:
        is_open, is_close = char in OPEN_QUOTES, char in CLOSE_QUOTES
        if (is_open and not quoted) or (is_close and quoted):
            if current.strip():
                parts.append(Part(current.strip(), quoted))
            current = ""
            quoted = not quoted
            continue
        current += char
    if current.strip():
        parts.append(Part(current.strip(), quoted))
    return parts, quoted


def _end(text: str) -> str:
    return text.rstrip(_CLOSERS)[-1:]


def _speaker(parts: Sequence[Part]) -> tuple[str | None, str | None]:
    """The name and speech verb of a dialogue tag next to the quoted speech, if there is one."""
    for position, part in enumerate(parts):
        if part.quoted:
            continue
        before_quote = position + 1 < len(parts) and parts[position + 1].quoted
        after_quote = position > 0 and parts[position - 1].quoted
        match = (_TAG_AFTER.search(part.text) if after_quote else None) or (
            _TAG_BEFORE.search(part.text) if before_quote else None
        )
        if match:
            name = next((group for group in match.groups() if group), None)
            verb = re.search(_SPEECH, match.group(0))
            if name and name.split()[0] not in _NOT_NAMES:
                return name, verb.group(0) if verb else None
            return None, verb.group(0) if verb else None
    return None, None


def _style(text: str, parts: Sequence[Part], verb: str | None) -> str:
    spoken = " ".join(part.text for part in parts if part.quoted) or text
    if verb in _QUIET_VERBS:
        return CALM
    if verb in _ASK_VERBS or _end(spoken) == "?":
        return QUESTION
    if verb in _LOUD_VERBS or _end(spoken) == "!":
        return LIVELY
    if len(spoken.split()) <= 3 and _INTERJECTION.match(spoken):
        return LIVELY
    if text.startswith("(") and text.rstrip(" .!?").endswith(")"):
        return CALM  # an aside
    return DIALOGUE if any(part.quoted for part in parts) else NARRATION


def analyse(sentences: Sequence[Sentence]) -> dict[int, Line]:
    """How every sentence of a document should be read, in context."""
    lines: dict[int, Line] = {}
    quote_open = False
    paragraph = None
    for sentence in sentences:
        if sentence.paragraph != paragraph:
            quote_open, paragraph = False, sentence.paragraph  # a quotation never runs over a paragraph break here
        text = " ".join(sentence.text.split())
        if sentence.kind == "heading":
            lines[sentence.index] = Line(NARRATION, steady=True)
            continue
        parts, quote_open = _split(text, quote_open)
        name, verb = _speaker(parts)
        mixed = len(parts) > 1 and any(p.quoted for p in parts) and not all(p.quoted for p in parts)
        steady = bool(_LIST_ITEM.match(text) or _ANNOUNCEMENT.match(text) or (text.isupper() and len(text) > 8))
        lines[sentence.index] = Line(
            _style(text, parts, verb), steady=steady, speaker=name, parts=tuple(parts) if mixed else ()
        )
    return _carry_speakers(sentences, lines)


def _carry_speakers(sentences: Sequence[Sentence], lines: dict[int, Line]) -> dict[int, Line]:
    """A quotation that runs over several sentences belongs to the speaker its tag names."""
    by_paragraph: dict[int, list[int]] = {}
    for sentence in sentences:
        by_paragraph.setdefault(sentence.paragraph, []).append(sentence.index)
    for indexes in by_paragraph.values():
        named = [lines[i].speaker for i in indexes if lines[i].speaker]
        if len(set(named)) != 1:
            continue  # no speaker, or several: leave each sentence as tagged
        for i in indexes:
            line = lines[i]
            if line.dialogue and not line.speaker:
                lines[i] = Line(line.style, line.steady, named[0], line.parts)
    return lines


def characters(lines: dict[int, Line]) -> list[tuple[str, int]]:
    """The speakers dialogue tags name, with how many sentences each speaks, most first."""
    counts = Counter(line.speaker for line in lines.values() if line.speaker)
    return counts.most_common()
