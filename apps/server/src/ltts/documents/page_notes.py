# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Find footnote text at the foot of PDF pages, to skip when reading aloud.

Scope: Conservative: a miss is better than a wrong find. On a page, the run of lines its text ends
with (after any page number and furniture) when every one is set noticeably smaller than the
document's body text (at most ``SMALL_SHARE`` of its usual size), all of them sit below the rest of
the page's text, and the first starts with a note's number or symbol ("1", "12.", "¹", "*", "†")
that marks a word on the same page ("war.1", "war1", "war¹", "war*"). A line starting with a number
or symbol starts the next note. Notes continued from the page before, notes beside the text and
pages whose text is read out of order are left alone. Sizes come from PDFium's character boxes
(``extract_pdf.py``).
Does NOT belong: Reading the PDF (``extract_pdf.py``) or running headers and page numbers (``cleanup.py``).
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from ltts.documents.cleanup import SUPERSCRIPT_DIGITS, is_page_number
from ltts.documents.structures import Furniture

SMALL_SHARE = 0.88  # a footnote line is at most this share of the body text's size (8 or 9 pt beside 11)
_TOLERANCE = 1.0  # PDF units a note may reach above the lowest line of text (rounding, descenders)
_SYMBOLS = "*†‡§¶‖#"
_TO_DIGITS = str.maketrans(SUPERSCRIPT_DIGITS, "0123456789")
_TO_SUPERSCRIPT = str.maketrans("0123456789", SUPERSCRIPT_DIGITS)
# "1 Smith", "12. Smith", "3) Smith", "1Smith" (a raised number set close, as TeX does), "¹Smith", "* Smith",
# "†Smith"; never "1.5 cm", "2019 saw" or "3rd".
_LABEL = re.compile(
    rf"^(?:(\d{{1,3}})(?:[.)]?\s+|(?=[A-Z]))|([{SUPERSCRIPT_DIGITS}]{{1,3}})\s*|([{_SYMBOLS}]{{1,3}})\s*)(?=\S)"
)
_ENDS_MARKER = r"(?=[\s.,;:!?\"'”’)]|$)"


@dataclass(frozen=True, slots=True)
class LineBox:
    """How large a line's type is and where it sits on its page, in PDF units (y grows up the page)."""

    size: float  # the height of its characters' font boxes
    bottom: float
    top: float


def note_label(line: str) -> str | None:
    """The number (as digits) or symbol a footnote line starts with, if it starts with one."""
    match = _LABEL.match(line)
    if match is None:
        return None
    return match.group(1) or (match.group(2) or "").translate(_TO_DIGITS) or match.group(3)


def _marks(label: str, text: str) -> bool:
    """Whether ``label`` marks a word in ``text``: glued after it ("war1", "war.1") or raised ("war¹")."""
    if not label.isdigit():
        return re.search(rf"(?<=[^\W_]|[.,;:!?\"'”’)]){re.escape(label)}(?![{_SYMBOLS}])", text) is not None
    raised = label.translate(_TO_SUPERSCRIPT)
    glued = rf"(?:(?<=[^\W\d_{SUPERSCRIPT_DIGITS}])|(?<=[^\W_][.,;:!?\"'”’)])){label}(?!\d){_ENDS_MARKER}"
    return re.search(rf"(?<=\S)(?<![{SUPERSCRIPT_DIGITS}]){raised}(?![{SUPERSCRIPT_DIGITS}])|{glued}", text) is not None


def _page_notes(
    lines: Sequence[str], boxes: Sequence[LineBox | None], taken: Mapping[int, Furniture], small: float
) -> list[int]:
    """The positions of one page's footnote lines (see the module docs), or none."""
    order = [at for at in range(len(lines)) if at not in taken]
    while order and is_page_number(lines[order[-1]]):
        order.pop()
    notes: list[tuple[int, LineBox]] = []
    while order and (box := boxes[order[-1]]) is not None and box.size <= small:
        notes.insert(0, (order.pop(), box))
    text = [box for at in order if (box := boxes[at]) is not None]
    if not notes or not text:
        return []
    lowest = min(box.bottom for box in text)
    label = note_label(lines[notes[0][0]])
    if label is None or any(box.top > lowest + _TOLERANCE for _, box in notes):
        return []
    return [at for at, _ in notes] if _marks(label, " ".join(lines[at] for at in order)) else []


def find_notes(
    pages: Sequence[Sequence[str]],
    boxes: Sequence[Sequence[LineBox | None]],
    furniture: Sequence[Mapping[int, Furniture]],
) -> list[dict[int, Furniture]]:
    """Each page's footnote lines by their position on the page (never a line that is furniture already).

    ``boxes`` holds each line's box, or None where it couldn't be measured (such a line is never a note).
    The body text's size is the most usual line size of the whole document.
    """
    sizes = sorted(box.size for page in boxes for box in page if box is not None)
    if not sizes:
        return [{} for _ in pages]
    small = sizes[len(sizes) // 2] * SMALL_SHARE
    note: Furniture = "footnote_text"
    return [
        dict.fromkeys(_page_notes(lines, page_boxes, taken, small), note)
        for lines, page_boxes, taken in zip(pages, boxes, furniture, strict=True)
    ]
