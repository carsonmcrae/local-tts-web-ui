"""Purpose: Edge-case tests for speech rewriting and sentence segmentation, including hostile input.

Scope: Dash pauses and number ranges, whitespace before punctuation, the word before a full stop,
runs of sentence punctuation, empty and over-long input, clause and hard wrapping, empty sections,
and linear running time on inputs that made the previous regexes backtrack quadratically.
Does NOT belong: The basic happy paths (test_text_processing.py) or format-specific extraction.
"""

from __future__ import annotations

import time

import pytest

from ltts.documents.normalize import speech_text
from ltts.documents.segmenter import (
    MAX_SEGMENT_CHARS,
    _split_long,
    _word_before_full_stop,
    segment_extraction,
    split_sentences,
)
from ltts.documents.structures import Block, ExtractedSection, Extraction

EM = "\N{EM DASH}"
EN = "\N{EN DASH}"
BAR = "\N{HORIZONTAL BAR}"


@pytest.mark.parametrize(
    ("text", "spoken"),
    [
        ("Wait - what?", "Wait, what?"),  # a hyphen standing alone between spaces is a pause
        (f"A {EN} b {EN} c", "A, b, c"),
        ("tab\t-\tsep", "tab, sep"),
        ("well-known co-op", "well-known co-op"),  # hyphens inside words stay
        (f"x  {EM}  y", "x, y"),  # an em dash takes the whitespace on both sides
        (f"word{EM}word", "word, word"),
        (f"{BAR} start", ", start"),
        (f"end {EM}", "end,"),
        (f"a {EM} - b", "a, - b"),  # the space after the em dash is taken, so the hyphen is not a pause
        ("x-  - y", "x-, y"),
        (f"1990 {EN} 1995", "1990 to 1995"),
        (f"3{EM}4 and 7 {EN}8", "3 to 4 and 7 to 8"),
        (f"1{EN}2{EN}3", "1 to 2 to 3"),  # a digit can end one range and start the next
        (f"May {EN} June", "May, June"),
    ],
)
def test_dashes_become_pauses_or_ranges(text: str, spoken: str) -> None:
    assert speech_text(text) == spoken


@pytest.mark.parametrize(
    ("text", "spoken"),
    [
        ("Hi , there !", "Hi, there!"),
        ("Wait ; really : yes .", "Wait; really: yes."),
        ("ok\N{LINE SEPARATOR},", "ok,"),  # any Unicode whitespace before punctuation goes
        ("a , , b", "a,, b"),
        ("trailing space ", "trailing space"),
    ],
)
def test_whitespace_before_closing_punctuation_is_removed(text: str, spoken: str) -> None:
    assert speech_text(text) == spoken


def test_speech_rewriting_stays_linear_on_long_whitespace_runs() -> None:
    hostile = " " * 200_000 + "x"
    started = time.perf_counter()
    assert speech_text(hostile) == "x"
    assert speech_text(f"a{hostile}{EM}") == "a x,"
    assert time.perf_counter() - started < 2.0


@pytest.mark.parametrize(
    ("text", "end", "word"),
    [
        ("Mr. ", 4, "Mr"),
        ("see e.g. ", 9, "e.g"),
        ("under_score. ", 13, "under_score"),
        ("Caf\N{LATIN SMALL LETTER E WITH ACUTE}. ", 6, "Caf\N{LATIN SMALL LETTER E WITH ACUTE}"),
        (". ", 2, None),  # a full stop with no word before it
        ("Hi! ", 4, None),  # not a full stop
        ("   ", 3, None),
    ],
)
def test_word_before_full_stop(text: str, end: int, word: str | None) -> None:
    assert _word_before_full_stop(text, end) == word


def test_split_sentences_edge_cases() -> None:
    assert split_sentences("") == []
    assert split_sentences("Hi. ") == ["Hi."]
    assert split_sentences("Wow!!! Next.") == ["Wow!!!", "Next."]
    assert split_sentences("Ask?! Yes.") == ["Ask?!", "Yes."]
    assert split_sentences("See e.g. this. Then go.") == ["See e.g. this.", "Then go."]
    assert split_sentences('He said "Stop." Then left.') == ['He said "Stop."', "Then left."]


def test_split_sentences_stays_linear_on_punctuation_and_word_runs() -> None:
    started = time.perf_counter()
    assert split_sentences("!" * 200_000 + "x") == ["!" * 200_000 + "x"]
    assert split_sentences("a" * 200_000 + "? B") == ["a" * 200_000 + "?", "B"]
    assert time.perf_counter() - started < 2.0


def test_clauseless_sentences_are_wrapped_at_spaces() -> None:
    pieces = _split_long("word " * 100, 60)
    assert all(len(piece) <= 60 for piece in pieces)
    assert " ".join(pieces) == ("word " * 100).strip()


def test_words_longer_than_the_limit_are_cut_at_the_limit() -> None:
    assert _split_long("x" * 150, 60) == ["x" * 60, "x" * 60, "x" * 30]


def test_hard_wrapping_never_yields_an_empty_piece() -> None:
    # The second clause wraps to nothing but whitespace, which must not become a segment.
    sentence = "b" * 300 + "; " + "a" * 100 + " " * 300
    assert _split_long(sentence) == ["b" * 300 + ";", "a" * 100]


def test_empty_sections_are_dropped_and_indexes_stay_contiguous() -> None:
    extraction = Extraction(
        title=None,
        sections=[
            ExtractedSection("Empty", []),
            ExtractedSection("Blank", [Block("paragraph", "")]),
            ExtractedSection("Real", [Block("paragraph", "One. Two.")]),
            ExtractedSection("Also real", [Block("heading", "Three")]),
        ],
    )
    segments, sections = segment_extraction(extraction)
    assert [(s.title, s.index, s.start_segment) for s in sections] == [("Real", 0, 0), ("Also real", 1, 2)]
    assert [s.section_index for s in segments] == [0, 0, 1]
    assert [s.boundary for s in segments] == ["sentence", "section", "section"]


def test_every_segment_respects_the_length_limit() -> None:
    text = " ".join(["An unpunctuated run of ordinary words"] * 40) + "."
    segments, _ = segment_extraction(
        Extraction(title=None, sections=[ExtractedSection("S", [Block("paragraph", text)])])
    )
    assert len(segments) > 1 and all(len(s.text) <= MAX_SEGMENT_CHARS for s in segments)
    assert [s.boundary for s in segments][-1] == "section"
