# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The immersive reading preset format: what a bundled book's preset may say, and how its anchors resolve.

Scope: The preset schema (``ttsnative.immersive-preset/1``, docs/architecture/literary-library.md
section 5) with every value checked against a pattern, a range or a vocabulary (voice ids, the
sound-effects events and the music tracks); durable text anchors (a 16-character hash of a sentence,
a short quote and an occurrence number) and their resolution against a document's sentences, hash
first, then quote, never a guess; and loading the shipped preset files, leaving a bad one out with a
log line. Nothing here changes a document's text, starts playback, or turns music or effects on.
Does NOT belong: Reporting, applying and removing presets (``preset_service.py``), the catalog
(``catalog.py``), HTTP (``router.py``) or the effects and music players.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Mapping, Sequence
from importlib import resources
from importlib.resources.abc import Traversable
from typing import Literal

from pydantic import ConfigDict, Field, model_validator

from ltts.common import ApiModel
from ltts.documents.casting import NAME_LIMIT
from ltts.documents.styling import VOICE_ID_PATTERN
from ltts.sfx.events import CATEGORY_OF

log = logging.getLogger("ltts.library")


SCHEMA = "ttsnative.immersive-preset/1"
SLUG = r"^[a-z0-9][a-z0-9-]{0,39}$"
PRESET_ID = r"^[a-z0-9][a-z0-9-]{2,79}$"
HASH = r"^[0-9a-f]{16}$"
QUOTE_CHARS = 80
Component = Literal["narrator", "characters", "speakers", "effects", "music"]
COMPONENTS: tuple[Component, ...] = ("narrator", "characters", "speakers", "effects", "music")
_PACKAGE = "ltts.library"
# The event vocabulary is the sound-effects feature's own (``ltts.sfx.events``, versioned there); a preset
# may only name an event that exists, in its category. The music tracks are frozen here (docs/architecture/
# literary-library.md 5.3) as the web app's apps/web/src/features/music/library.json; test_library_presets.py
# keeps the two equal.
KNOWN_EVENTS: Mapping[str, str] = CATEGORY_OF
KNOWN_TRACKS: frozenset[str] = frozenset({
    "contemplation", "calm-ambient", "rising-moon", "warriors-lament", "waiting", "washed-up", "currents",
    "gymnopedie-1", "vaporware", "nocturne-op9-1", "moonlight-sonata-1", "pathetique-2", "soft-rain", "brook",
    "ocean-waves", "forest-rain", "small-stream",
})  # fmt: skip


class Strict(ApiModel):
    """A preset record: exact field names, nothing unknown."""

    model_config = ConfigDict(alias_generator=None, extra="forbid", populate_by_name=True)


def sentence_hash(text: str) -> str:
    """The anchor hash: the first 16 hex characters of SHA-256 over the text with its whitespace collapsed."""
    return hashlib.sha256(" ".join(text.split()).encode("utf-8")).hexdigest()[:16]


class Anchor(Strict):
    chapter: str = Field(pattern=SLUG)
    hash: str = Field(pattern=HASH)
    quote: str = Field(min_length=1, max_length=QUOTE_CHARS)
    occurrence: int = Field(default=1, ge=1)


class VoiceRef(Strict):
    preferred: str = Field(pattern=VOICE_ID_PATTERN, max_length=120)
    fallbacks: list[str] = Field(default=[], max_length=8)

    @model_validator(mode="after")
    def _check(self) -> VoiceRef:
        for voice in self.fallbacks:
            if len(voice) > 120 or voice.count(":") != 1 or " " in voice:
                raise ValueError(f"invalid fallback voice {voice!r}")
        return self

    @property
    def candidates(self) -> list[str]:
        return [self.preferred, *self.fallbacks]


class Narrator(Strict):
    voice: VoiceRef
    note: str | None = Field(default=None, max_length=300)


class Character(Strict):
    id: str = Field(pattern=SLUG)
    name: str = Field(min_length=1, max_length=NAME_LIMIT)  # the name the dialogue analysis finds
    aliases: list[str] = Field(default=[], max_length=12)  # other names the analysis gives the same person
    description: str | None = Field(default=None, max_length=300)
    voice: VoiceRef

    @property
    def names(self) -> list[str]:
        return [self.name, *self.aliases]


class SpeakerAnnotation(Strict):
    anchor: Anchor
    speaker: str = Field(pattern=SLUG)  # a character id
    scope: Literal["quoted", "sentence"] = "quoted"
    confidence: Literal["verified", "likely", "uncertain"] = "verified"
    provenance: Literal["curated", "analysis"] = "curated"


class EffectAnnotation(Strict):
    id: str = Field(pattern=SLUG)
    anchor: Anchor
    end_anchor: Anchor | None = None
    event: str = Field(pattern=SLUG)
    category: str = Field(pattern=SLUG)
    intent: str = Field(min_length=1, max_length=300)
    sound_id: str | None = Field(default=None, pattern=SLUG)
    position: float = Field(default=0.0, ge=0.0, le=1.0)
    offset_ms: int = Field(default=0, ge=-1500, le=5000)
    duration_s: float | None = Field(default=None, gt=0, le=240)
    volume: int = Field(default=100, ge=0, le=150)  # percent of the sound's own recommended level
    loop: bool = False
    provenance: Literal["curated"] = "curated"
    review: Literal["proposed", "reviewed"] = "proposed"

    @model_validator(mode="after")
    def _check(self) -> EffectAnnotation:
        if KNOWN_EVENTS.get(self.event) != self.category:
            raise ValueError(f"unknown sound event {self.event!r} in {self.category!r}")
        if self.loop and self.end_anchor is None and self.duration_s is None:
            raise ValueError("a looping effect needs an end anchor or a duration")
        return self


class MusicRecommendation(Strict):
    track_id: str = Field(pattern=SLUG)
    volume: int = Field(default=10, ge=0, le=100)
    note: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _check(self) -> MusicRecommendation:
        if self.track_id not in KNOWN_TRACKS:
            raise ValueError(f"unknown music track {self.track_id!r}")
        return self


class MusicChapter(Strict):
    chapter: str = Field(pattern=SLUG)
    track_id: str = Field(pattern=SLUG)
    volume: int = Field(default=10, ge=0, le=100)

    @model_validator(mode="after")
    def _check(self) -> MusicChapter:
        if self.track_id not in KNOWN_TRACKS:
            raise ValueError(f"unknown music track {self.track_id!r}")
        return self


class Music(Strict):
    recommendation: MusicRecommendation
    chapters: list[MusicChapter] = Field(default=[], max_length=200)


class Preset(Strict):
    schema_: str = Field(alias="schema", pattern=r"^ttsnative\.immersive-preset/1$")
    preset_id: str = Field(pattern=PRESET_ID)
    preset_version: int = Field(ge=1)
    work_id: str = Field(pattern=PRESET_ID)
    edition_id: str = Field(min_length=1, max_length=200)
    text_version: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=400)
    narrator: Narrator | None = None
    characters: list[Character] = Field(default=[], max_length=60)
    speakers: list[SpeakerAnnotation] = Field(default=[], max_length=5000)
    effects: list[EffectAnnotation] = Field(default=[], max_length=500)
    music: Music | None = None

    @model_validator(mode="after")
    def _check(self) -> Preset:
        ids = [character.id for character in self.characters]
        if len(set(ids)) != len(ids):
            raise ValueError("character ids repeat")
        names = [name for character in self.characters for name in character.names]
        if len(set(names)) != len(names):
            raise ValueError("character names repeat")
        for speaker in self.speakers:
            if speaker.speaker not in ids:
                raise ValueError(f"speaker annotation names an unknown character {speaker.speaker!r}")
        effect_ids = [effect.id for effect in self.effects]
        if len(set(effect_ids)) != len(effect_ids):
            raise ValueError("effect ids repeat")
        return self

    @property
    def components(self) -> list[Component]:
        present = {
            "narrator": self.narrator is not None,
            "characters": bool(self.characters),
            "speakers": bool(self.speakers),
            "effects": bool(self.effects),
            "music": self.music is not None,
        }
        return [name for name in COMPONENTS if present[name]]


def load_presets(package: Traversable | None = None) -> dict[str, Preset]:
    """Every shipped preset by work id; a preset that fails validation is left out and logged."""
    root = (package or resources.files(_PACKAGE)).joinpath("presets")
    presets: dict[str, Preset] = {}
    for item in sorted(root.iterdir(), key=lambda entry: entry.name):
        if not item.name.endswith(".json"):
            continue
        try:
            preset = Preset.model_validate(json.loads(item.read_text("utf-8")))
        except ValueError:
            log.error("preset left out: it does not match the schema", extra={"file": item.name})
            continue
        presets[preset.work_id] = preset
    return presets


# -- anchors ---------------------------------------------------------------------
Sentences = Sequence[tuple[int, str]]  # (segment index, stored text)


def resolve(anchor: Anchor, sentences: Sentences, *, quotes: bool = True) -> int | None:
    """The segment index an anchor names: the n-th sentence with its hash, else the n-th starting with its quote.

    The quote is only trusted (``quotes``) for the edition the preset was written against; another
    edition's sentence may begin the same way and mean something else.
    """
    by_hash = [index for index, text in sentences if sentence_hash(text) == anchor.hash]
    if len(by_hash) >= anchor.occurrence:
        return by_hash[anchor.occurrence - 1]
    if not quotes:
        return None
    quote = " ".join(anchor.quote.split())
    by_quote = [index for index, text in sentences if " ".join(text.split()).startswith(quote)]
    if len(by_quote) >= anchor.occurrence:
        return by_quote[anchor.occurrence - 1]
    return None


def make_anchor(chapter: str, text: str, occurrence: int = 1) -> Anchor:
    """An anchor for a stored sentence (the anchor tool and the tests use this)."""
    quote = " ".join(text.split())[:QUOTE_CHARS]
    return Anchor(chapter=chapter, hash=sentence_hash(text), quote=quote, occurrence=occurrence)


# -- reports and applying ------------------------------------------------------------
