# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The bundled sound library as validated data: what each sound is, its file, licence and events.

Scope: Reads ``library.json`` (written by ``scripts/media/sound-library.py``) once and checks every
record: a safe id and file name (no path can be formed from them), bounded text fields, a length,
size and SHA-256 for the file, a recommended gain, whether it loops, the events it serves (all in
the vocabulary, and every event served by at least one sound), and its licence. Unknown fields
are refused. Serves the library to the web app with the event and category lists it needs.
Does NOT belong: The audio files (``apps/web/public/sfx``), playing them, or choosing sounds for text.
"""

from __future__ import annotations

import json
from functools import lru_cache
from importlib import resources
from typing import Annotated

from pydantic import ConfigDict, Field, field_validator

from ltts.common import ApiModel
from ltts.sfx.events import CATEGORY_LABELS, EVENT_IDS, EVENTS, Category

SOUND_ID = r"^[a-z0-9][a-z0-9-]{0,39}$"
FILE_NAME = r"^[a-z0-9][a-z0-9-]{0,39}\.mp3$"
MAX_SOUND_BYTES = 1_000_000
MAX_SOUND_SECONDS = 30.0


class Licence(ApiModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=60)
    url: str = Field(max_length=200, pattern=r"^https://[^\s]+$")


class SoundOut(ApiModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=SOUND_ID)
    name: str = Field(min_length=1, max_length=60)
    category: Category
    description: str = Field(max_length=300)
    keywords: list[Annotated[str, Field(min_length=1, max_length=30)]] = Field(max_length=20)
    file: str = Field(pattern=FILE_NAME)
    duration_seconds: float = Field(gt=0, le=MAX_SOUND_SECONDS)
    bytes: int = Field(ge=1, le=MAX_SOUND_BYTES)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    gain: float = Field(ge=0.05, le=1.5)  # recommended level, as a multiplier of the effects volume
    loop: bool
    events: list[str] = Field(min_length=1, max_length=10)
    licence: Licence
    attribution: str | None = Field(default=None, max_length=200)
    source: str = Field(min_length=1, max_length=300)

    @field_validator("events")
    @classmethod
    def _known_events(cls, value: list[str]) -> list[str]:
        unknown = [event for event in value if event not in EVENT_IDS]
        if unknown:
            raise ValueError(f"not events in the vocabulary: {', '.join(unknown)}")
        return value


class EventOut(ApiModel):
    id: str
    label: str
    category: Category
    loop: bool


class CategoryOut(ApiModel):
    id: Category
    label: str


class LibraryOut(ApiModel):
    version: int = Field(ge=1)
    sounds: list[SoundOut] = Field(max_length=500)
    events: list[EventOut]
    categories: list[CategoryOut]


def parse_library(raw: object) -> LibraryOut:
    """A validated library from the manifest's data; raises ``ValueError`` for anything wrong in it."""
    if not isinstance(raw, dict) or not isinstance(raw.get("sounds"), list):
        raise ValueError("The sound library must be an object with a list of sounds.")
    sounds = [SoundOut.model_validate(item) for item in raw["sounds"]]
    for field in ("id", "file"):
        values = [getattr(sound, field) for sound in sounds]
        if len(set(values)) != len(values):
            raise ValueError(f"Every sound needs its own {field}.")
    served = {event for sound in sounds for event in sound.events}
    missing = sorted(EVENT_IDS - served)
    if missing:
        raise ValueError(f"No sound serves: {', '.join(missing)}.")
    return LibraryOut(
        version=raw.get("version", 0),
        sounds=sounds,
        events=[EventOut(id=event.id, label=event.label, category=event.category, loop=event.loop) for event in EVENTS],
        categories=[CategoryOut(id=category, label=label) for category, label in CATEGORY_LABELS.items()],  # type: ignore[arg-type]
    )


@lru_cache(maxsize=1)
def library() -> LibraryOut:
    text = resources.files("ltts.sfx").joinpath("library.json").read_text("utf-8")
    return parse_library(json.loads(text))


def sound(sound_id: str) -> SoundOut | None:
    return next((item for item in library().sounds if item.id == sound_id), None)


def default_sound(event_id: str) -> SoundOut:
    """The first bundled sound that serves ``event_id`` (the library check guarantees one)."""
    return next(item for item in library().sounds if event_id in item.events)
