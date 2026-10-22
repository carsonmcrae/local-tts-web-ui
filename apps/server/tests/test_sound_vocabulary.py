# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""
Purpose: The sound-effect vocabulary is a contract: an id keeps its meaning and category within a version.
Scope: The version-1 snapshot of every event id and its category (an id may be added without a new
  version; removing or moving one means bumping VOCABULARY_VERSION and adding a snapshot here), the
  category labels, and, once the literary library's presets module is on the same branch, that its
  copy of the vocabulary matches this one (skipped until then).
Does NOT belong: Detection (test_sound_detection.py) or the bundled sounds (test_sound_effects_api.py).
"""

from __future__ import annotations

import pytest

from ltts.sfx.events import CATEGORY_LABELS, CATEGORY_OF, EVENT_IDS, EVENTS, VOCABULARY_VERSION

VERSION_1: dict[str, str] = {
    "rain-light": "weather", "rain-heavy": "weather", "thunder-distant": "weather", "thunder-close": "weather",
    "wind-gust": "weather", "wind-howl": "weather", "stream": "nature", "waves": "nature", "fire-crackle": "nature",
    "crickets": "nature", "birdsong": "nature", "owl": "animals", "wolf-howl": "animals", "dog-bark": "animals",
    "horse-hooves": "animals", "door-creak": "doors", "door-close": "doors", "door-slam": "doors",
    "door-knock": "doors", "footsteps-wood": "footsteps", "footsteps-stone": "footsteps",
    "footsteps-gravel": "footsteps", "footsteps-run": "footsteps", "clock-tick": "household",
    "clock-chime": "household", "bell-toll": "fantasy", "sword-clash": "fantasy", "glass-break": "impacts",
    "thud": "impacts", "gunshot": "impacts", "explosion": "impacts", "car-pass": "vehicles",
    "train-pass": "vehicles", "crowd-murmur": "ambience", "city-distant": "ambience", "machine-hum": "mechanical",
}  # fmt: skip


def test_every_version_one_id_keeps_its_category() -> None:
    assert VOCABULARY_VERSION == 1, "a new vocabulary version needs its own snapshot in this file"
    assert VERSION_1.items() <= dict(CATEGORY_OF).items()  # ids may be added, never removed or moved
    assert frozenset(CATEGORY_OF) == EVENT_IDS
    assert len({event.id for event in EVENTS}) == len(EVENTS)
    assert set(CATEGORY_OF.values()) <= set(CATEGORY_LABELS)


def test_the_vocabulary_cannot_be_changed_in_place() -> None:
    with pytest.raises(TypeError):
        CATEGORY_OF["thud"] = "weather"  # type: ignore[index]


def test_the_literary_library_presets_use_this_vocabulary() -> None:
    presets = pytest.importorskip("ltts.library.presets", reason="the literary-library branch is not merged here")
    assert dict(CATEGORY_OF) == presets.KNOWN_EVENTS
