# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Unit tests for text normalisation and sentence segmentation.

Scope: Display clean-up, speech rewriting, sentence splitting edge cases (abbreviations, initials,
decimals, quotes), long-sentence splitting, boundary tagging and determinism.
Does NOT belong: Format-specific extraction tests.
"""

from __future__ import annotations

from ltts.documents.normalize import clean_inline, clean_text, speech_text, word_count
from ltts.documents.segmenter import MAX_SEGMENT_CHARS, segment_extraction, split_sentences
from ltts.documents.structures import Block, ExtractedSection, Extraction


def test_clean_text_removes_invisible_and_control_characters() -> None:
    raw = "Hel\N{SOFT HYPHEN}lo\N{ZERO WIDTH SPACE} wor\ald\r\n\r\n  next\N{NO-BREAK SPACE}line  "
    assert clean_text(raw) == "Hello world\n\nnext line"


def test_clean_inline_collapses_lines() -> None:
    assert clean_inline("one\ntwo   three") == "one two three"


def test_speech_text_rewrites_typography_urls_and_footnotes() -> None:
    spoken = speech_text("“Hi” — see https://example.com/x[12] in 1990–1995… Wow!!!")
    assert spoken == '"Hi", see link in 1990 to 1995... Wow!'


def test_speech_text_handles_ampersand_and_markup() -> None:
    assert speech_text("**Bold** & _italic_") == "Bold and italic"


def test_word_count() -> None:
    assert word_count("It's forty-two, isn't it?") == 7


def test_split_sentences_respects_abbreviations_initials_and_decimals() -> None:
    text = "Dr. Smith met J. K. Rowling at 3.30 p.m. on Tuesday. They talked. “Really?” she asked."
    assert split_sentences(text) == [
        "Dr. Smith met J. K. Rowling at 3.30 p.m. on Tuesday.",
        "They talked.",
        "“Really?” she asked.",
    ]


def test_split_sentences_keeps_lowercase_continuations() -> None:
    assert split_sentences("He said wait... then left. Done.") == ["He said wait... then left.", "Done."]


def test_long_sentences_are_split_under_the_limit() -> None:
    clause = "a fairly long clause with several words in it"
    sentence = "; ".join([clause] * 20) + "."
    extraction = Extraction(title=None, sections=[ExtractedSection("S", [Block("paragraph", sentence)])])
    segments, _ = segment_extraction(extraction)
    assert len(segments) > 1
    assert all(len(s.text) <= MAX_SEGMENT_CHARS for s in segments)


def test_boundaries_and_section_index_are_tagged() -> None:
    extraction = Extraction(
        title="Doc",
        sections=[
            ExtractedSection("One", [Block("heading", "One"), Block("paragraph", "First. Second.")]),
            ExtractedSection("Two", [Block("paragraph", "Third.")]),
        ],
    )
    segments, sections = segment_extraction(extraction)
    assert [(s.text, s.boundary, s.section_index, s.kind) for s in segments] == [
        ("One", "paragraph", 0, "heading"),
        ("First.", "sentence", 0, "paragraph"),
        ("Second.", "section", 0, "paragraph"),
        ("Third.", "section", 1, "paragraph"),
    ]
    assert [(s.title, s.start_segment, s.segment_count) for s in sections] == [("One", 0, 3), ("Two", 3, 1)]


def test_segmentation_is_deterministic() -> None:
    text = "Go now. Stop here! Who is it?"
    extraction = Extraction(title=None, sections=[ExtractedSection("S", [Block("paragraph", text)])])
    first, _ = segment_extraction(extraction)
    second, _ = segment_extraction(extraction)
    assert [s.text for s in first] == [s.text for s in second] == ["Go now.", "Stop here!", "Who is it?"]
