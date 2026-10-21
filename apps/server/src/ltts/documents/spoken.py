# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: How much of a document is read aloud, for its spoken word count and listening estimate.

Scope: What is left unread, counted from the sentence annotations whenever a document is listed or
opened, so it follows every skip, undo and apply: whole sentences that are skipped (by the cleanup or
by hand) and the footnote and citation markers left out of the sentences that are read, plus the last
sentence that is read. A sentence's text as it is read, without those markers. The counts stored with
a document, of all of its extracted text, never change.
Does NOT belong: Finding or storing the cleanup (``cleanup.py``, ``cleanup_store.py``), pronunciations
or speech normalisation (synthesis), or SQL beyond the one query below.
"""

from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field

from ltts.documents.cleanup_store import MARKERS
from ltts.documents.normalize import word_count

# Every skipped sentence and every sentence with markers left unread (``MARKERS``), of one document or all.
UNREAD_SQL = """
SELECT a.document_id, a.segment_idx, a.kind, a.value, s.text
FROM segment_annotations a JOIN segments s ON s.document_id = a.document_id AND s.idx = a.segment_idx
WHERE a.kind IN ('skip', 'footnotes', 'citations') AND (:document_id IS NULL OR a.document_id = :document_id)
"""


@dataclass(slots=True)
class Unread:
    """What of one document isn't read aloud: characters (with the space after each skipped sentence),
    words, and which sentences are skipped."""

    chars: int = 0
    words: int = 0
    skipped: set[int] = field(default_factory=set)

    def last_read(self, segment_count: int) -> int:
        """The last sentence that is read (the last sentence, when every one is skipped)."""
        last = segment_count - 1
        while last >= 0 and last in self.skipped:
            last -= 1
        return last if last >= 0 else segment_count - 1


def as_read(text: str, pairs: Iterable[Sequence[str]]) -> str:
    """A sentence as it is read: each ``(written, spoken)`` marker pair replaced as a whole word (as
    synthesis replaces them), and the spaces left behind tidied."""
    for written, spoken in pairs:
        text = re.sub(rf"(?<!\w){re.escape(written)}(?!\w)", _constant(spoken), text)
    return " ".join(text.split())


def _constant(value: str) -> Callable[[re.Match[str]], str]:
    return lambda _match: value


def _pairs(value: str) -> list[list[str]]:
    pairs = json.loads(value)
    return pairs if isinstance(pairs, list) else []


def unread(rows: Iterable[sqlite3.Row]) -> dict[str, Unread]:
    """What isn't read aloud of each document, from ``UNREAD_SQL``'s rows."""
    sentences: dict[tuple[str, int], tuple[str, dict[str, str]]] = {}
    for row in rows:
        _, kinds = sentences.setdefault((row["document_id"], row["segment_idx"]), (row["text"], {}))
        kinds[row["kind"]] = row["value"]
    found: dict[str, Unread] = {}
    for (document_id, index), (text, kinds) in sentences.items():
        counted = found.setdefault(document_id, Unread())
        if "skip" in kinds:
            counted.skipped.add(index)
            counted.chars += len(text) + 1
            counted.words += word_count(text)
            continue
        read = as_read(text, [pair for kind in MARKERS if kind in kinds for pair in _pairs(kinds[kind])])
        counted.chars += len(text) - len(read)
        counted.words += word_count(text) - word_count(read)
    return found
