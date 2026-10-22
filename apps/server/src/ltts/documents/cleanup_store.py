# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Keep, apply, undo and report a document's automatic cleanup.

Scope: What the cleanup found (``cleanup.py``) is recorded when a document is imported, one ``cleanup``
annotation per sentence, and never changes. Applied, a running header, footer, page number or a page's
footnote text is skipped (``skip``, valued with its reason) and a sentence's footnote and citation
markers are left unread (``footnotes`` and ``citations``: spoken-text replacements that ``styling.py``
plans with); undoing removes exactly those and keeps the sentences a reader skipped by hand (``skip`` =
``manual``). The report lists every find and hand-made skip with whether it applies now, and the notice
the import added to the document's warnings. Nothing ever changes a sentence's text.
Does NOT belong: Finding things (``cleanup.py``), HTTP (``styling_router.py``) or synthesis.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import Field

from ltts.common import ApiModel
from ltts.db import Database
from ltts.documents.cleanup import AUTOMATIC, MAX_PAIRS_CHARS, Findings, describe

CleanupReason = Literal["header", "footer", "page_number", "footnote_text", "footnote", "citation", "manual"]
Annotation = tuple[int, str, str]  # (sentence, kind, value)
MARKERS = {"footnotes": "footnote", "citations": "citation"}  # marker kinds left unread, and their reasons
_REPORT_SQL = """
SELECT a.segment_idx, a.kind, a.value, s.text, s.section_idx
FROM segment_annotations a JOIN segments s ON s.document_id = a.document_id AND s.idx = a.segment_idx
WHERE a.document_id = ? AND a.kind IN ('cleanup', 'skip', 'footnotes', 'citations')
ORDER BY a.segment_idx
"""
_INSERT = "INSERT INTO segment_annotations (document_id, segment_idx, kind, value) VALUES (?, ?, ?, ?) "


class CleanupItem(ApiModel):
    index: int
    section_index: int
    reason: CleanupReason
    text: str
    markers: list[str] = Field(default_factory=list)  # the markers left unread ("12", "³", "[4, 5]")
    applied: bool  # skipped (or its markers left unread) right now


class CleanupOut(ApiModel):
    items: list[CleanupItem]
    notice: str | None = None  # the notice the import added to the document's warnings


def _json(value: str) -> Any:
    try:
        return json.loads(value)
    except ValueError:
        return None


def is_pairs(value: str) -> bool:
    """A JSON list of ``[written, spoken]`` pairs of strings, as ``footnotes`` holds."""
    pairs = _json(value)
    return (
        len(value) <= MAX_PAIRS_CHARS
        and isinstance(pairs, list)
        and all(isinstance(pair, list) and len(pair) == 2 and all(isinstance(s, str) for s in pair) for pair in pairs)
    )


def is_record(value: str) -> bool:
    """A find as ``cleanup`` records it: ``{"skip": reason}``, or a sentence's markers by kind
    (``{"footnotes": pairs, "citations": pairs}``, either or both)."""
    found = _json(value)
    if not isinstance(found, dict) or not found:
        return False
    if "skip" in found:
        return len(found) == 1 and found["skip"] in AUTOMATIC
    return set(found) <= set(MARKERS) and all(is_pairs(json.dumps(pairs)) for pairs in found.values())


def records(findings: Findings) -> list[Annotation]:
    """What an import stores for its finds: each sentence's finds, and the cleanup applied."""
    rows: list[Annotation] = []
    for index, reason in sorted(findings.skips.items()):
        rows += [(index, "cleanup", json.dumps({"skip": reason})), (index, "skip", reason)]
    for index in sorted(findings.footnotes.keys() | findings.citations.keys()):
        found = {"footnotes": findings.footnotes.get(index), "citations": findings.citations.get(index)}
        markers = {kind: pairs for kind, pairs in found.items() if pairs}
        rows.append((index, "cleanup", json.dumps(markers)))
        rows += [(index, kind, json.dumps(pairs)) for kind, pairs in markers.items()]
    return rows


def _items(index: int, kinds: dict[str, str], text: str, section: int) -> list[CleanupItem]:
    """One sentence's finds and hand-made skip as report items."""
    found = _json(kinds.get("cleanup", "{}")) or {}
    skip = kinds.get("skip")

    def item(reason: Any, applied: bool, markers: list[str] | None = None) -> CleanupItem:
        return CleanupItem(
            index=index, section_index=section, reason=reason, text=text, markers=markers or [], applied=applied
        )

    if found.get("skip") in AUTOMATIC:
        return [item(found["skip"], skip is not None)]
    items = [
        item(reason, kind in kinds, [written[len(spoken) :].strip() for written, spoken in found[kind]])
        for kind, reason in MARKERS.items()
        if kind in found
    ]
    if skip is not None:
        items.append(item(skip, True))  # skipped by hand ("manual")
    return items


class CleanupStore:
    def __init__(self, db: Database):
        self._db = db

    def report(self, document_id: str) -> CleanupOut:
        with self._db.connect() as conn:
            rows = conn.execute(_REPORT_SQL, (document_id,)).fetchall()
        kinds: dict[int, dict[str, str]] = {}
        where: dict[int, tuple[str, int]] = {}
        for row in rows:
            kinds.setdefault(row["segment_idx"], {})[row["kind"]] = row["value"]
            where[row["segment_idx"]] = (row["text"], row["section_idx"])
        items = [item for index, found in kinds.items() for item in _items(index, found, *where[index])]
        counts = {reason: sum(item.reason == reason for item in items) for reason in AUTOMATIC}
        for reason in MARKERS.values():
            counts[reason] = sum(len(item.markers) for item in items if item.reason == reason)
        return CleanupOut(items=items, notice=describe(counts))

    def undo(self, document_id: str) -> CleanupOut:
        """Read every automatic find again; sentences skipped by hand stay skipped."""
        with self._db.connect() as conn:
            conn.execute(
                "DELETE FROM segment_annotations WHERE document_id = ? "
                "AND (kind IN ('footnotes', 'citations') OR (kind = 'skip' AND value != 'manual'))",
                (document_id,),
            )
        return self.report(document_id)

    def apply(self, document_id: str) -> CleanupOut:
        """Apply every automatic find again, after an undo or after reading some of them by hand."""
        with self._db.connect() as conn:
            rows = conn.execute(
                "SELECT segment_idx, value FROM segment_annotations WHERE document_id = ? AND kind = 'cleanup'",
                (document_id,),
            ).fetchall()
            found = [(row["segment_idx"], _json(row["value"]) or {}) for row in rows]
            skips = [(document_id, index, "skip", one["skip"]) for index, one in found if one.get("skip") in AUTOMATIC]
            notes = [(document_id, index, kind, json.dumps(one[kind])) for index, one in found
                     for kind in MARKERS if kind in one]  # fmt: skip
            conn.executemany(_INSERT + "ON CONFLICT(document_id, segment_idx, kind) DO NOTHING", skips)
            conn.executemany(
                _INSERT + "ON CONFLICT(document_id, segment_idx, kind) DO UPDATE SET value = excluded.value", notes
            )
        return self.report(document_id)
