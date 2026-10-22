# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The vocabulary of sound events a detector may name, and nothing else it may say.

Scope: Each event has an id, a label for the interface, a category and whether it is ambience that
loops under several sentences. Detectors return event ids only; the catalogue maps each id to a
bundled sound. Anything outside this vocabulary is refused by ``proposals.validate``.
Does NOT belong: How events are found in text (``lexicon.py``, ``detect.py``) or sounds (``catalogue.py``).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal

Category = Literal[
    "weather", "nature", "animals", "doors", "footsteps", "household", "fantasy", "impacts", "vehicles",
    "ambience", "mechanical",
]  # fmt: skip
CATEGORY_LABELS: dict[str, str] = {
    "weather": "Weather",
    "nature": "Nature",
    "animals": "Animals",
    "doors": "Doors and buildings",
    "footsteps": "Footsteps and movement",
    "household": "Household",
    "fantasy": "Fantasy and adventure",
    "impacts": "Impacts and action",
    "vehicles": "Vehicles",
    "ambience": "Atmosphere",
    "mechanical": "Machines",
}


@dataclass(frozen=True, slots=True)
class Event:
    id: str
    label: str
    category: Category
    loop: bool = False  # ambience: plays under the sentences that follow until it is ended


EVENTS: tuple[Event, ...] = (
    Event("rain-light", "Light rain", "weather", loop=True),
    Event("rain-heavy", "Heavy rain", "weather", loop=True),
    Event("thunder-distant", "Distant thunder", "weather"),
    Event("thunder-close", "Thunder overhead", "weather"),
    Event("wind-gust", "A gust of wind", "weather"),
    Event("wind-howl", "Howling wind", "weather", loop=True),
    Event("stream", "A running stream", "nature", loop=True),
    Event("waves", "Waves on the shore", "nature", loop=True),
    Event("fire-crackle", "A crackling fire", "nature", loop=True),
    Event("crickets", "Crickets at night", "nature", loop=True),
    Event("birdsong", "Birdsong", "nature"),
    Event("owl", "An owl's hoot", "animals"),
    Event("wolf-howl", "A wolf's howl", "animals"),
    Event("dog-bark", "A dog barking", "animals"),
    Event("horse-hooves", "Horse's hooves", "animals"),
    Event("door-creak", "A creaking door", "doors"),
    Event("door-close", "A door closing", "doors"),
    Event("door-slam", "A door slamming", "doors"),
    Event("door-knock", "A knock at the door", "doors"),
    Event("footsteps-wood", "Footsteps on wood", "footsteps"),
    Event("footsteps-stone", "Footsteps on stone", "footsteps"),
    Event("footsteps-gravel", "Footsteps on gravel", "footsteps"),
    Event("footsteps-run", "Running footsteps", "footsteps"),
    Event("clock-tick", "A ticking clock", "household", loop=True),
    Event("clock-chime", "A clock chiming", "household"),
    Event("bell-toll", "A tolling bell", "fantasy"),
    Event("sword-clash", "Clashing swords", "fantasy"),
    Event("glass-break", "Breaking glass", "impacts"),
    Event("thud", "A heavy thud", "impacts"),
    Event("gunshot", "A gunshot", "impacts"),
    Event("explosion", "An explosion", "impacts"),
    Event("car-pass", "A passing car", "vehicles"),
    Event("train-pass", "A passing train", "vehicles"),
    Event("crowd-murmur", "A murmuring crowd", "ambience", loop=True),
    Event("city-distant", "A city in the distance", "ambience", loop=True),
    Event("machine-hum", "Humming machinery", "mechanical", loop=True),
)
EVENT_IDS: frozenset[str] = frozenset(event.id for event in EVENTS)
# Each event's category, for code that stores or checks event ids (the literary library's presets).
CATEGORY_OF: Mapping[str, Category] = MappingProxyType({event.id: event.category for event in EVENTS})
# The vocabulary's contract: an id, once published, keeps its meaning and category. Removing an id or
# moving it to another category bumps this number (test_sound_vocabulary.py holds the snapshot); adding
# events does not.
VOCABULARY_VERSION = 1
_BY_ID: dict[str, Event] = {event.id: event for event in EVENTS}


def event(event_id: str) -> Event:
    """The event with ``event_id``; callers validate ids against ``EVENT_IDS`` first."""
    return _BY_ID[event_id]
