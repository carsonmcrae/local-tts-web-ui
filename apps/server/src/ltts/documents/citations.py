# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Find bracketed citation markers ("[12]", "[3, 4]", "[5–7]", "[12, 15–17]") to leave unread.

Scope: Conservative: keeping text is preferred to leaving it unread. A marker is one or more bracket
groups of citation numbers (1 to 999, in lists and ranges that go up), after a word and a space or
glued after punctuation that ends a word, and followed by a space, punctuation or the end. Never when
the bracket follows a letter, digit, underscore or closing parenthesis (``array[3]``, ``matrix[2][3]``),
holds letters, operators, a zero or a minus (``x[i+1]``, ``[0, 1]``, ``list[-1]``), starts a sentence
(a reference list's "[1] Smith"), follows a word naming a value ("the interval [1, 2]", "returns
[3]"), or sits in a sentence that reads as code or mathematics. The document has to use them too: a
references section, or at least ``MIN_RUN`` markers. A find is a (written, spoken) pair, the marker
and nothing, that ``cleanup_store.py`` records and can undo.
Does NOT belong: Superscript and glued footnote markers (``cleanup.py``), storing or applying them.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from ltts.documents.structures import Segment

MIN_RUN = 3  # markers a document needs before any is trusted, unless it has a references section
_NUMBER = r"[1-9]\d{0,2}"
_ITEM = rf"({_NUMBER})(?:\s?[-–—]\s?({_NUMBER}))?"
_GROUP = rf"\[{_ITEM}(?:,\s?{_ITEM})*\]"
_RUN = re.compile(rf"(?:{_GROUP})+(?=[\s.,;:!?\"'”’)]|$)")
_ITEMS = re.compile(_ITEM)
_TWO_NUMBERS = re.compile(rf"\[{_NUMBER},\s?{_NUMBER}\]")  # also an interval: "[1, 2]"
_GLUE = frozenset(".,;:!?\"'”’")  # punctuation a marker may be glued after, when it ends a word
# Code or mathematics: a bracket straight after a name or a call, operators, braces, backticks, TeX.
CODE_OR_MATH = re.compile(r"[\w)]\[|[=<>≤≥≠≈∈∉⊂⊆⊇∀∃±×÷^{}`\\|]|\w[+*]\w|\s[+*]\s")
REFERENCES_TITLE = re.compile(
    r"^(?:references|bibliography|works cited|literature cited|sources|citations|(?:end|foot)?notes)[.:]?$",
    re.IGNORECASE,
)
# Words a bracket after names a value, an index or a key rather than cites a source.
_VALUE_WORDS = frozenset({
    "interval", "intervals", "range", "ranges", "domain", "segment", "set", "sets", "list", "lists", "array",
    "arrays", "vector", "vectors", "tuple", "tuples", "matrix", "matrices", "sequence", "element", "elements",
    "entry", "entries", "item", "items", "index", "indices", "indexes", "value", "values", "key", "keys", "row",
    "rows", "column", "columns", "cell", "cells", "slot", "slots", "bit", "bits", "byte", "bytes", "field",
    "fields", "register", "registers", "point", "points", "coordinates", "size", "shape", "dimensions",
    "return", "returns", "returned", "yields", "gives", "equals", "is", "are", "was", "were", "becomes",
    "contains", "holds", "prints", "outputs", "output", "input", "press", "type", "enter", "select", "choose",
    "option", "options", "step", "button",
})  # fmt: skip
# Words before "[1, 2]" that make it an interval: "continuous on [1, 2]", "maps [1, 2] to [3, 4]".
_RANGE_WORDS = frozenset({"on", "over", "in", "within", "between", "from", "to", "into", "onto", "at", "of"})


def _ascending(run: str) -> bool:
    """Each group's numbers and ranges go up ("[3, 4]", "[12, 15–17]"); a range never ends where it starts."""
    for group in run[1:-1].split("]["):
        last = 0
        for match in _ITEMS.finditer(group):
            low, high = int(match.group(1)), int(match.group(2) or match.group(1))
            if low <= last or (match.group(2) and high <= low):
                return False
            last = high
    return True


def _after_word(token: str, run: str) -> bool:
    """Whether a marker after a space may follow ``token``: a word (or number) that names no value."""
    if not token or not (token[-1].isalnum() or token[-1] in _GLUE):
        return False
    word = "".join(char for char in token if char.isalnum()).lower()
    if len(word) < 2 and not word.isdigit():
        return False  # "x [3]" is a variable and its index
    return word not in _VALUE_WORDS and not (word in _RANGE_WORDS and _TWO_NUMBERS.fullmatch(run))


def _glued(text: str, start: int) -> bool:
    """Whether the marker at ``start`` is glued after one or two punctuation marks that end a word ("war.[3]")."""
    at = start - 1
    while at >= 0 and start - at <= 2 and text[at] in _GLUE:
        at -= 1
    return at < start - 1 and at >= 0 and text[at].isalnum()


def _placed(text: str, start: int, run: str) -> bool:
    if start == 0:
        return False  # starts the sentence: a reference list's label
    if not text[start - 1].isspace():
        return _glued(text, start)
    before = text[:start].split()
    return bool(before) and _after_word(before[-1], run)


def markers(text: str) -> list[str]:
    """The citation markers in one sentence, in order (none in a sentence that reads as code or mathematics)."""
    if CODE_OR_MATH.search(text):
        return []
    return [
        match.group()
        for match in _RUN.finditer(text)
        if _placed(text, match.start(), match.group()) and _ascending(match.group())
    ]


def find(segments: Iterable[Segment], references: set[int]) -> dict[int, list[tuple[str, str]]]:
    """Each sentence's citation markers as (marker, "") pairs, when the document uses them.

    ``references`` are the sentences of the document's references section: its labels are kept, and
    having one is reason enough to trust a marker; without one, ``MIN_RUN`` markers are needed.
    """
    found = {
        segment.index: runs
        for segment in segments
        if segment.index not in references and (runs := markers(segment.text))
    }
    if not references and sum(map(len, found.values())) < MIN_RUN:
        return {}
    return {index: [(run, "") for run in dict.fromkeys(runs)] for index, runs in found.items()}
