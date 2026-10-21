# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for bracketed citation markers (``documents/citations.py``) and what is never taken for one.

Scope: Citation markers after a word or glued after punctuation ("[12]", "[3, 4]", "[5–7]", "[12,
15–17]", "[3][4]") are left unread once the document uses them (a references section, or enough of
them); code, arrays, intervals, indexes, operators, letters, zero, minus signs, reference-list labels
and values ("returns [3]") are kept, and so is a sentence that reads as code or mathematics. Speech
normalisation keeps every bracketed number; superscripts in mathematics are no footnote markers.
Does NOT belong: Storing or undoing the finds (test_document_cleanup_api.py) or whole documents
(test_document_corpus.py).
"""

from __future__ import annotations

import pytest

from ltts.documents.citations import markers
from ltts.documents.cleanup import SUPERSCRIPT_DIGITS, Findings, describe
from ltts.documents.normalize import speech_text
from test_document_cleanup import findings

TWO = SUPERSCRIPT_DIGITS[2]
EN = "\N{EN DASH}"
CITED = ["Caching helps [12].", "Prior work [3, 4] agrees.", f"Several studies [5{EN}7] say so."]


def cited(found: Findings) -> list[str]:
    return [written for pairs in found.citations.values() for written, spoken in pairs if spoken == ""]


@pytest.mark.parametrize(
    ("text", "found"),
    [
        ("Caching helps [12].", ["[12]"]),
        ("Prior work [3, 4] agrees.", ["[3, 4]"]),
        ("Prior work [3,4] agrees.", ["[3,4]"]),
        (f"Several studies [5{EN}7] say so.", [f"[5{EN}7]"]),
        (f"As shown in [12, 15{EN}17], the cost drops.", [f"[12, 15{EN}17]"]),
        ("The town grew.[3][4] Then it shrank.", ["[3][4]"]),  # glued after punctuation, a run of groups
        ('He said "no."[8] and left.', ["[8]"]),
        ("Read the survey (see [3]) first.", ["[3]"]),
        ("It was first measured in 1999 [4].", ["[4]"]),
        ("Table 2 [3] shows it, and so does [9]", ["[3]", "[9]"]),
    ],
)
def test_citation_markers_after_a_word_or_punctuation_are_found(text: str, found: list[str]) -> None:
    assert markers(text) == found


@pytest.mark.parametrize(
    "text",
    [
        "Read array[3] before the loop.",  # straight after a name
        "Then x[i+1] grows.",  # letters and an operator
        "Set matrix[2][3] to zero.",  # after a closing bracket
        "The interval [0, 1] is closed.",  # zero, and a word naming a range
        "Take list[-1] for the last one.",  # a minus
        "The function is continuous on [1, 2] only.",  # an interval after "on"
        "[1] Smith, J. A study of caching.",  # a reference list's label
        "Press [1] to continue.",
        "It returns [3] for every input.",
        "The list [1, 2, 3] has three items.",
        "The pairs [4, 2] are swapped.",  # not in order
        f"The run [3{EN}3] is empty.",  # a range ending where it starts
        "The code [01] is padded.",
        "The value [1000] is too large.",
        "A note [a] explains it.",
        "Then x [3] is read.",  # a single letter is a variable
        "The cell (see [3](x)) holds it.",  # followed by a parenthesis
        "Its label [3]a follows.",  # followed by a letter
        "Here a = [3] and b = [4] are set.",  # code or mathematics
        "Read `[3]` aloud.",
        "f(x)[3] is the third.",  # after a call
    ],
)
def test_code_arrays_intervals_and_values_are_never_citation_markers(text: str) -> None:
    assert markers(text) == []


def test_a_document_needs_several_markers_or_a_references_section() -> None:
    assert cited(findings(("Paper", CITED[:2]))) == []  # two are too few to trust
    assert cited(findings(("Paper", CITED))) == ["[12]", "[3, 4]", f"[5{EN}7]"]
    references = ["# References", "[1] Smith, J. A study.", "[2] Jones, K. Another."]
    assert cited(findings(("Paper", [CITED[0], *references]))) == ["[12]"]  # the labels are kept
    assert cited(findings(("Paper", [CITED[1]]), ("Bibliography", ["Smith, J. A study."]))) == ["[3, 4]"]
    # A PDF's "References" is a paragraph of its own; what follows it is the list, not the text.
    listed = ["References", "Smith, J. A study, 2001. [2] Jones, K. Another, 2004."]
    assert cited(findings(("Paper", [CITED[0], *listed]))) == ["[12]"]


def test_citation_markers_are_counted_and_described_apart_from_footnote_markers() -> None:
    found = findings(("Paper", CITED))
    assert found.counts()["citation"] == 3 and found.counts()["footnote"] == 0
    assert describe({"header": 2, "footnote": 1, "citation": 3}) == (
        "Skipped 2 running headers, and 1 footnote marker and 3 citation markers when reading aloud; "
        "you can review them."
    )
    assert describe({"footnote_text": 1}) == "Skipped 1 footnote when reading aloud; you can review it."


@pytest.mark.parametrize(
    "text",
    [
        f"The area is width * length{TWO} in all.",
        f"Then a{TWO} + b{TWO} = c{TWO} holds.",
        f"The graph of sin{TWO} x rises.",
    ],
)
def test_superscripts_in_mathematics_are_not_footnote_markers(text: str) -> None:
    assert findings(("Maths", [text])).footnotes == {}


@pytest.mark.parametrize(
    "text",
    ["Read array[3] and x[i+1] first.", "The interval [0, 1] holds list[-1].", "Prior work [3, 4] agrees.",
     "Caching helps [12].", "Then x^2 + y^2 = r^2 holds.", "A note [a] explains it."],
)  # fmt: skip
def test_speech_normalisation_keeps_every_bracketed_number(text: str) -> None:
    assert speech_text(text) == text
