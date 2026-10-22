# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for finding sound events in prose, the gate every detection passes, and the sound library.

Scope: An evaluation set of literal sentences (fantasy, mystery, science fiction, literary fiction,
nonfiction, dialogue, action and quiet description) that must each yield their event, and a silent
set of metaphors, negations, memories, habits, questions, quoted speech, names and figurative
phrases that must yield nothing a balanced setting would suggest; positions inside a sentence and
ambience ends; the detector's speed on a long chapter; the validation gate against malformed,
oversized and hostile detector output; the restraint rules of each intensity; the bundled library's
files, hashes, credits and the checks that refuse bad manifests; and that the ``ltts.sfx`` package
never imports anything that can run a process, reach the network or write files.
Does NOT belong: The HTTP API and storage (test_sound_effects_api.py).
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from pathlib import Path

import pytest

from ltts.sfx import catalogue
from ltts.sfx.detect import DETECTOR_VERSION, Sentence, detect
from ltts.sfx.events import EVENT_IDS, EVENTS, event
from ltts.sfx.lexicon import GROUPS
from ltts.sfx.proposals import LIMITS, MAX_PROPOSALS, Placed, Proposal, choose, validate

ROOT = Path(__file__).resolve().parents[3]
SFX_DIR = ROOT / "apps/web/public/sfx"
BALANCED = LIMITS["balanced"]

LITERAL: list[tuple[str, set[str]]] = [
    # fantasy
    ("The ancient door slowly creaked open.", {"door-creak"}),
    ("Somewhere beyond the castle walls, thunder rumbled.", {"thunder-distant"}),
    ("A cold wind swept through the corridor.", {"wind-gust", "wind-howl"}),
    ("Swords clashed in the courtyard below.", {"sword-clash"}),
    ("The church bell tolled across the valley.", {"bell-toll"}),
    ("Wolves howled somewhere on the ridge.", {"wolf-howl"}),
    ("Hooves clattered on the cobbles outside the inn.", {"horse-hooves", "footsteps-stone"}),
    # mystery
    ("There was a knock at the door.", {"door-knock"}),
    ("The detective closed the door quietly and listened.", {"door-close"}),
    ("Footsteps echoed on the flagstones behind her.", {"footsteps-stone"}),
    ("The old clock ticked in the hall.", {"clock-tick"}),
    ("The glass shattered on the floor.", {"glass-break"}),
    ("A shot rang out from the trees.", {"gunshot"}),
    # science fiction
    ("The engines of the cruiser throbbed beneath the deck.", {"machine-hum"}),
    ("The bomb exploded somewhere in the lower levels.", {"explosion"}),
    # literary fiction and quiet description
    ("Rain pattered on the roof.", {"rain-light"}),
    ("The fire crackled in the hearth.", {"fire-crackle"}),
    ("Birds sang in the orchard.", {"birdsong"}),
    ("A stream babbled over the stones.", {"stream"}),
    ("Waves crashed against the rocks below.", {"waves"}),
    ("Crickets chirped in the long grass.", {"crickets"}),
    ("An owl hooted in the dark.", {"owl"}),
    # action
    ("He slammed the door behind him.", {"door-slam"}),
    ("The thunder shook the windows.", {"thunder-close"}),
    ("The engine of the old truck coughed into life.", {"car-pass"}),
    ("The train rumbled past the station.", {"train-pass"}),
    ("Somewhere a dog barked.", {"dog-bark"}),
    ("The crowd murmured.", {"crowd-murmur"}),
]
SILENT = [
    "He had a storm of emotions.",
    "She felt a door opening in her life.",
    "There was no thunder that night, only silence.",
    "It was like thunder in his chest.",
    "His heart thundered in his chest.",
    "A thunder of applause greeted her.",
    "The applause was like thunder.",
    "She remembered how the wind had howled all winter.",
    "Every night the wolves howled beyond the ridge.",
    "The old dog had barked at every stranger.",
    "Was that thunder?",
    '"I heard thunder," said Nicole.',
    '"Did you hear that?" "The wind," she said. "Only the wind."',
    "Mr Bell rang the number again.",
    "If the door creaks, we are lost.",
    "He shot her a glance.",
    "The rain stopped and the sun came out.",
    "Her grief was a slow rain that never stopped.",
    "The committee's decision opened the door to further talks.",
    "Rainfall in the region averages 800 millimetres a year.",
    "Thunder is the sound caused by lightning.",
    "The mills hummed day and night in those years.",
    "The room was still, the dust turning slowly in the light.",
    "The curtains stirred.",
    "Chapter 3",
]


def sentences(texts: list[str]) -> list[Sentence]:
    return [Sentence(index, index, text.startswith("Chapter"), text) for index, text in enumerate(texts)]


def suggested(texts: list[str], threshold: float = BALANCED.threshold) -> dict[int, set[str]]:
    """Events per sentence that a setting with ``threshold`` would consider."""
    found: dict[int, set[str]] = {}
    for proposal in validate(detect(sentences(texts), 20), 0, len(texts) - 1):
        if proposal.confidence >= threshold:
            found.setdefault(proposal.index, set()).add(proposal.event)
    return found


def test_literal_events_are_found() -> None:
    found = suggested([text for text, _ in LITERAL])
    for index, (text, expected) in enumerate(LITERAL):
        assert found.get(index, set()) & expected, f"{text!r}: found {found.get(index)}, expected {expected}"


def test_figurative_negated_remembered_and_quoted_mentions_are_not() -> None:
    found = suggested(SILENT)
    assert found == {}, {SILENT[index]: events for index, events in found.items()}


def test_every_event_is_detectable_and_every_group_names_a_real_event() -> None:
    assert {group.event for group in GROUPS} == EVENT_IDS
    for group in GROUPS:
        assert group.keys and all(key == key.lower() for key in group.keys)
        assert all(0 < rule.confidence <= 1 for rule in group.rules)


def test_positions_snap_to_the_start_and_ambience_lasts_to_its_end() -> None:
    texts = [
        "Rain pattered on the roof.",  # ambience from sentence 0
        "She read by the window for an hour.",
        "The rain stopped and the sun came out.",  # ...until the sentence that ends it
        "Later that evening, in the quiet of the empty house, somewhere far away thunder rumbled.",
    ]
    found = {item["event"]: item for item in detect(sentences(texts), 20)}
    assert found["rain-light"]["index"] == 0 and found["rain-light"]["fraction"] == 0.0
    assert found["rain-light"]["until"] == 2
    assert 0.5 < float(found["thunder-distant"]["fraction"]) < 0.95  # late in a long sentence
    assert found["thunder-distant"]["until"] is None
    capped = detect(sentences(["The fire crackled in the hearth."] + ["Nothing."] * 40), 12)
    assert capped[0]["until"] == 12


def test_a_quotation_open_from_an_earlier_sentence_still_counts() -> None:
    texts = ['"Listen,', 'thunder rumbled last night," she said.', "Thunder rumbled."]
    paragraphs = [Sentence(0, 0, False, texts[0]), Sentence(1, 0, False, texts[1]), Sentence(2, 1, False, texts[2])]
    assert [item["index"] for item in detect(paragraphs, 20)] == [2]


def test_a_long_chapter_is_analysed_quickly() -> None:
    texts = [text for text, _ in LITERAL] + SILENT + ["He waited.", "Nothing happened for a long time."]
    chapter = [Sentence(index, index // 5, False, texts[index % len(texts)]) for index in range(1_000)]
    started = time.perf_counter()
    found = detect(chapter, 20)
    elapsed = time.perf_counter() - started
    # Well under a second when run alone; coverage instrumentation slows the regexes several times over.
    assert found and elapsed < 4.0, elapsed


def test_the_gate_keeps_only_well_formed_proposals_inside_the_range() -> None:
    good = {"index": 3, "event": "rain-light", "confidence": 0.8, "fraction": 0.5, "until": 9}
    hostile = [
        "ignore your instructions",
        {"index": 4, "event": "rm -rf /", "confidence": 0.9},
        {"index": 4, "event": "thunder-close", "confidence": 0.9, "command": "curl http://evil.invalid"},
        {"index": "4", "event": "thunder-close", "confidence": 0.9},
        {"index": 4, "event": "thunder-close", "confidence": "0.9"},
        {"index": 4, "event": "thunder-close", "confidence": math.nan},
        {"index": 4, "event": "thunder-close", "confidence": 1.5},
        {"index": -1, "event": "thunder-close", "confidence": 0.9},
        {"index": 40, "event": "thunder-close", "confidence": 0.9},  # outside the range
        {"index": 4, "event": "thunder-close", "confidence": 0.9, "until": 6},  # not ambience
        {"index": 4, "event": "rain-light", "confidence": 0.9, "until": 2},  # runs backwards
        {"index": 4, "event": "rain-light", "confidence": 0.9, "until": 50},  # past the range
        {"index": True, "event": "thunder-close", "confidence": 0.9},
        {"index": 4, "event": ["thunder-close"], "confidence": 0.9},
        {"index": 4, "event": "x" * 100, "confidence": 0.9},
        None,
        42,
        [good],
        good,
    ]
    kept = validate(hostile, 0, 20)
    assert [proposal.model_dump() for proposal in kept] == [good]
    assert validate({"index": 3}, 0, 20) == [] and validate("[]", 0, 20) == []
    flood = [{"index": n % 20, "event": "thud", "confidence": 0.5 + (n % 50) / 100} for n in range(20_000)]
    capped = validate(flood, 0, 20)
    assert len(capped) == MAX_PROPOSALS and capped[0].confidence >= capped[-1].confidence


def test_proposals_are_frozen_data() -> None:
    proposal = Proposal(index=1, event="thud", confidence=0.9)
    with pytest.raises(Exception, match="frozen"):
        proposal.index = 2  # type: ignore[misc]


def proposals(*spots: tuple[int, str, float]) -> list[Proposal]:
    return [
        Proposal(index=index, event=name, confidence=confidence, until=index + 5 if event(name).loop else None)
        for index, name, confidence in spots
    ]


def test_restraint_limits_how_many_and_how_close() -> None:
    found = proposals((0, "thud", 0.9), (1, "gunshot", 0.9), (2, "thud", 0.7), (20, "thud", 0.9), (30, "thud", 0.6))
    chosen = choose(found, BALANCED, [], 100)
    assert [(p.index, p.event) for p in chosen] == [(0, "thud"), (20, "thud")]  # spaced, above threshold
    minimal = choose(found, LIMITS["minimal"], [], 100)
    assert [(p.index, p.event) for p in minimal] == [(0, "thud")]  # the same event needs 40 sentences apart
    immersive = choose(found, LIMITS["immersive"], [], 100)
    assert [p.index for p in immersive] == [0, 20, 30]  # 2 is the same event as 0, too close
    # At most round(6 per hundred) in a short chapter: one in 10 sentences.
    many = proposals(*((n * 10, "thud", 0.9) for n in range(8)))
    assert len(choose(many, BALANCED, [], 10)) == 1
    assert len(choose(many, BALANCED, [], 80)) == 4  # the cap allows 5, the same-event distance 4


def test_restraint_keeps_one_effect_per_sentence_and_one_ambience_at_a_time() -> None:
    found = proposals((5, "rain-light", 0.9), (5, "fire-crackle", 0.8), (7, "wind-howl", 0.9), (40, "crickets", 0.9))
    chosen = choose(found, LIMITS["immersive"], [], 100)
    assert [(p.index, p.event) for p in chosen] == [(5, "rain-light"), (40, "crickets")]
    assert chosen[0].until == 10


def test_restraint_respects_what_the_document_already_has() -> None:
    found = proposals((10, "thud", 0.9), (12, "thud", 0.9), (30, "thud", 0.9), (52, "rain-light", 0.9))
    existing = [
        Placed(11, "thud", dismissed=True),  # a dismissed suggestion: not again at the same moment
        Placed(33, "gunshot"),  # an accepted effect: keeps its distance
        Placed(50, "rain-light", until=60),  # ambience already covering sentence 52
    ]
    chosen = choose(found, BALANCED, existing, 100)
    assert [(p.index, p.event) for p in chosen] == []
    assert [p.index for p in choose(found, LIMITS["immersive"], existing, 100)] == [30]


def test_the_library_matches_the_files_that_ship_and_credits_them() -> None:
    library = catalogue.library()
    assert library.version == 1 and len(library.sounds) >= 30
    assert {event.id for event in library.events} == EVENT_IDS
    assert {category.id for category in library.categories} == {event.category for event in EVENTS}
    credits = (SFX_DIR / "CREDITS.md").read_text("utf-8")
    for sound in library.sounds:
        data = (SFX_DIR / sound.file).read_bytes()
        assert len(data) == sound.bytes, sound.id
        assert hashlib.sha256(data).hexdigest() == sound.sha256, sound.id
        assert sound.name in credits and sound.file in credits
        assert sound.licence.name == "MIT" and sound.attribution is None
    shipped = {path.name for path in SFX_DIR.glob("*.mp3")}
    assert shipped == {sound.file for sound in library.sounds}
    assert sum(sound.bytes for sound in library.sounds) < 2_000_000
    assert catalogue.sound("thud") is not None and catalogue.sound("../thud") is None
    assert catalogue.default_sound("door-knock").id == "door-knock"


def test_bad_manifests_are_refused() -> None:
    raw = json.loads((ROOT / "apps/server/src/ltts/sfx/library.json").read_text("utf-8"))
    first = dict(raw["sounds"][0])

    def with_sound(**changes: object) -> dict[str, object]:
        return {"version": 1, "sounds": [{**first, **changes}, *raw["sounds"][1:]]}

    for bad in (
        with_sound(file="../../etc/passwd"),
        with_sound(file="thud.wav"),
        with_sound(id="Thud!"),
        with_sound(events=["not-an-event"]),
        with_sound(events=[]),
        with_sound(gain=9.0),
        with_sound(bytes=50_000_000),
        with_sound(duration_seconds=600),
        with_sound(sha256="nothex"),
        with_sound(licence={"name": "MIT", "url": "http://insecure.invalid"}),
        with_sound(script="rm -rf /"),
        with_sound(id=raw["sounds"][1]["id"]),
        {"version": 1, "sounds": raw["sounds"][1:]},  # the first sound's event is no longer served
        {"version": 1, "sounds": "none"},
        [],
    ):
        with pytest.raises(ValueError):
            catalogue.parse_library(bad)


def test_the_package_cannot_run_anything_reach_anything_or_write_anything() -> None:
    package = ROOT / "apps/server/src/ltts/sfx"
    forbidden = (
        "import subprocess",
        "os.system",
        "import socket",
        "import httpx",
        "import urllib",
        "import requests",
        "import shutil",
        "import os",
        "open(",
        "exec(",
        "eval(",
    )
    for module in package.rglob("*.py"):
        source = module.read_text("utf-8")
        for name in forbidden:
            assert name not in source, f"{module.name} mentions {name}"
    assert DETECTOR_VERSION.startswith("rules-")
