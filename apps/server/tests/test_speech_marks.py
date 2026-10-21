# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for speech marks: how they're read, how sentences split around them, and what they set.

Scope: ``speech_marks.encode``/``apply``/``strip`` with the real sentence splitter, and hostile input
(forged mark characters, too many marks, unknown or malformed marks).
Does NOT belong: Importing a document with speech marks turned on (``test_document_speech_marks.py``).
"""

from __future__ import annotations

import json

from ltts.documents.segmenter import FIRST_MARK, MAX_MARKS, PAUSE_MARK, split_sentences
from ltts.documents.speech_marks import apply, encode, strip


def voices(name: str) -> str | None:
    return {"Sam": "kokoro:sam", "kokoro:ava": "kokoro:ava"}.get(name)


def read(text: str) -> tuple[list[str], list[tuple[int, str, str]], list[str]]:
    """The spoken sentences, their annotations and every warning for ``text``."""
    encoded = encode(text)
    sentences = split_sentences(encoded.text)
    annotations, warnings = apply(list(enumerate(sentences)), encoded.marks, voices)
    return [strip(s) for s in sentences], [(a.index, a.kind, a.value) for a in annotations], encoded.warnings + warnings


def test_a_pause_ends_its_sentence_and_sets_the_pause_after_it() -> None:
    sentences, annotations, warnings = read("Wait {pause 2s} what was that? Nothing.")
    assert sentences == ["Wait", "what was that?", "Nothing."]
    assert annotations == [(0, "pause", "2000")]
    assert warnings == []


def test_a_pause_after_a_full_stop_leaves_no_empty_sentence() -> None:
    sentences, annotations, _ = read("Wait. {pause 500ms} What was that?")
    assert sentences == ["Wait.", "What was that?"]
    assert annotations == [(0, "pause", "500")]


def test_a_bare_pause_is_one_second() -> None:
    assert read("One. {pause} Two.")[1] == [(0, "pause", "1000")]


def test_a_voice_covers_every_sentence_until_it_closes() -> None:
    sentences, annotations, _ = read('{voice Sam}"Hello," he said. Then he left.{/voice} The end.')
    assert sentences == ['"Hello," he said.', "Then he left.", "The end."]
    assert annotations == [(0, "voice", "kokoro:sam"), (1, "voice", "kokoro:sam")]


def test_a_closing_mark_after_a_full_stop_still_lets_the_sentence_end() -> None:
    sentences, annotations, _ = read("{effect radio}Come in.{/effect} Over.")
    assert sentences == ["Come in.", "Over."]
    assert annotations == [(0, "effect", "radio")]


def test_a_voice_that_does_not_exist_is_read_by_the_reading_voice_with_a_warning() -> None:
    _, annotations, warnings = read("{voice Nobody}Hello.{/voice}")
    assert annotations == []
    assert warnings == ["Speech marks: there is no voice called 'Nobody', so the reading voice is used."]


def test_sounds_styles_and_pronunciations_land_on_their_sentences() -> None:
    text = "{say Kael = Kay-el}Kael ran. {sound laugh}Ha! {style calm}Breathe.{/style} Kael stopped."
    sentences, annotations, warnings = read(text)
    assert sentences == ["Kael ran.", "Ha!", "Breathe.", "Kael stopped."]
    said = json.dumps([["Kael", "Kay-el"]])
    assert annotations == [(0, "speak_as", said), (1, "sound", "laugh"), (2, "style", "calm"), (3, "speak_as", said)]
    assert warnings == []


def test_doubled_braces_are_literal_and_unknown_marks_stay_as_text() -> None:
    sentences, annotations, warnings = read("Use {{braces}} here. {bogus} stays.")
    assert sentences == ["Use {braces} here.", "{bogus} stays."]
    assert annotations == []
    assert warnings == ["Speech mark '{bogus}' was left as text: it isn't a speech mark."]


def test_malformed_marks_explain_what_is_wrong() -> None:
    warnings = read("{pause forever} {effect lasers}x {say Kael} {voice} {/sound}")[2]
    assert warnings == [
        "Speech mark '{pause forever}' was left as text: a pause takes a length up to 10 s, such as {pause 2s}.",
        "Speech mark '{effect lasers}' was left as text: there is no effect called 'lasers'.",
        "Speech mark '{say Kael}' was left as text: write it as {say word = how to say it}.",
        "Speech mark '{voice}' was left as text: name the voice, such as {voice Sam}.",
        "Speech mark '{/sound}' was left as text: only voice, effect and style marks are closed.",
    ]


def test_a_pause_longer_than_ten_seconds_is_refused() -> None:
    assert read("A. {pause 11s} B.")[1] == []


def test_mark_characters_already_in_the_text_cannot_forge_marks() -> None:
    forged = f"Hi.{chr(FIRST_MARK)} There{PAUSE_MARK} now.{chr(FIRST_MARK + 3)}"
    sentences, annotations, _ = read(forged)
    assert sentences == ["Hi.", "There now."]
    assert annotations == []
    assert encode(forged).marks == []


def test_marks_past_the_limit_are_left_as_text() -> None:
    encoded = encode("{sound laugh}" * (MAX_MARKS + 3))
    assert len(encoded.marks) == MAX_MARKS
    assert encoded.warnings.count("Speech mark '{sound laugh}' was left as text: too many marks.") == 3


def test_text_without_marks_splits_exactly_as_before() -> None:
    plain = 'Dr. Smith said "Hi." Then J. K. Rowling left... and returned! Did she? Yes.'
    assert split_sentences(encode(plain).text) == split_sentences(plain)


def test_a_range_closed_before_a_sentence_or_opened_after_one_leaves_it_alone() -> None:
    encoded = encode("{voice Sam}{/voice}")  # mark 0 opens, mark 1 closes
    opened, closed = chr(FIRST_MARK), chr(FIRST_MARK + 1)
    parts = [f"One.{opened}", "Two.", f"{closed}Three."]  # as fold() leaves marks that stood alone
    annotations, _ = apply(list(enumerate(parts)), encoded.marks, voices)
    assert [(a.index, a.kind, a.value) for a in annotations] == [(1, "voice", "kokoro:sam")]
