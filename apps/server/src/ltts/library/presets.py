# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Immersive reading presets: data about a bundled book that recommends voices, speakers, effects and music.

Scope: The preset schema (``ttsnative.immersive-preset/1``, docs/architecture/literary-library.md
section 5) with every value checked against a pattern, a range or a vocabulary; durable text anchors
(a 16-character hash of a sentence, a short quote and an occurrence number) and their resolution
against a document's sentences, hash first, then quote, never a guess; a report of what a preset would
do for a document (which voices are available, which anchors resolve, which components need features
that aren't here yet); applying the components the reader chose (characters' voices and speaker
annotations go into the same tables the reader's own choices use, and exactly what was written is
recorded in ``document_presets``) and taking them out again. Nothing here changes a document's text,
starts playback, or turns music or effects on.
Does NOT belong: The catalog (``catalog.py``), HTTP (``router.py``) or the effects and music players.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Callable, Mapping, Sequence
from importlib import resources
from importlib.resources.abc import Traversable
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from ltts.common import ApiModel, utc_now
from ltts.db import Database
from ltts.documents.casting import NAME_LIMIT, CastingStore, CharacterAssignment
from ltts.documents.styling import VOICE_ID_PATTERN, StylingStore
from ltts.errors import ConflictError, NotFoundError
from ltts.sfx.events import CATEGORY_OF

log = logging.getLogger("ltts.library")
SCHEMA = "ttsnative.immersive-preset/1"
SLUG = r"^[a-z0-9][a-z0-9-]{0,39}$"
PRESET_ID = r"^[a-z0-9][a-z0-9-]{2,79}$"
HASH = r"^[0-9a-f]{16}$"
QUOTE_CHARS = 80
Component = Literal["narrator", "characters", "speakers", "effects", "music"]
COMPONENTS: tuple[Component, ...] = ("narrator", "characters", "speakers", "effects", "music")
# Components whose players live on other branches: validated and reported, never applied here.
NOT_YET: frozenset[str] = frozenset({"effects", "music"})
_PACKAGE = "ltts.library"
# The event vocabulary is the sound-effects feature's own (``ltts.sfx.events``, versioned there); a preset
# may only name an event that exists, in its category. The music tracks are frozen here (docs/architecture/
# literary-library.md 5.3).
KNOWN_EVENTS: Mapping[str, str] = CATEGORY_OF
KNOWN_TRACKS: frozenset[str] = frozenset({
    "contemplation", "calm-ambient", "rising-moon", "warriors-lament", "waiting", "washed-up", "currents",
    "gymnopedie-1", "vaporware", "soft-rain", "brook",
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
class PresetVoiceOut(ApiModel):
    preferred: str
    chosen: str | None  # the first candidate that is available here, or None


class PresetCharacterOut(ApiModel):
    id: str
    name: str
    description: str | None
    voice: PresetVoiceOut
    lines: int  # sentences the dialogue analysis gives this character in this document


class PresetComponentOut(ApiModel):
    name: Component
    available: bool  # can be applied in this version of TTSNative
    note: str  # what it does, or why it can't be applied yet
    applied: bool


class ReadingPresetOut(ApiModel):
    preset_id: str
    preset_version: int
    work_id: str
    title: str
    summary: str
    narrator: PresetVoiceOut | None
    characters: list[PresetCharacterOut]
    speakers_resolved: int
    speakers_unresolved: int
    effects: int
    music_track_id: str | None
    edition_matches: bool  # the document is the edition and text version the preset was written for
    components: list[PresetComponentOut]
    applied_at: str | None
    applied_version: int | None


class PresetApplyRequest(ApiModel):
    components: list[Component] = Field(min_length=1, max_length=5)


NOTES: dict[str, str] = {
    "narrator": "A recommended reading voice for this book.",
    "characters": "Each character reads their own lines.",
    "speakers": "Lines the analysis can't attribute are given to their speaker.",
    "effects": "Sound effects arrive with a later version of TTSNative.",
    "music": "Background music recommendations arrive with a later version of TTSNative.",
}


class PresetService:
    def __init__(
        self,
        db: Database,
        styling: StylingStore,
        casting: CastingStore,
        sentences: Callable[[str], Sentences],
        available: Callable[[str], bool],
        presets: dict[str, Preset],
    ):
        self._db = db
        self._styling = styling
        self._casting = casting
        self._sentences = sentences
        self._available = available
        self._presets = presets

    def for_work(self, work_id: str) -> Preset | None:
        return self._presets.get(work_id)

    def for_document(self, document_id: str) -> Preset:
        """The preset of the bundled work this document is; a document that isn't one has none."""
        with self._db.connect() as conn:
            row = conn.execute("SELECT work_id FROM bundled_documents WHERE document_id = ?", (document_id,)).fetchone()
        preset = self._presets.get(row["work_id"]) if row else None
        if preset is None:
            raise NotFoundError("This document has no reading preset.", code="preset_not_found")
        return preset

    def _edition_matches(self, document_id: str, preset: Preset) -> bool:
        """Whether the document was opened from the edition and text version the preset's anchors were made for."""
        with self._db.connect() as conn:
            row = conn.execute(
                "SELECT edition_id, text_version FROM bundled_documents WHERE document_id = ?", (document_id,)
            ).fetchone()
        return bool(row) and row["edition_id"] == preset.edition_id and row["text_version"] == preset.text_version

    def _sentences_for(self, document_id: str, preset: Preset) -> tuple[Sentences, bool]:
        """The document's sentences and whether quotes may stand in for hashes (only for the preset's own edition)."""
        return self._sentences(document_id), self._edition_matches(document_id, preset)

    def _choose(self, voice: VoiceRef) -> PresetVoiceOut:
        chosen = next((candidate for candidate in voice.candidates if self._available(candidate)), None)
        return PresetVoiceOut(preferred=voice.preferred, chosen=chosen)

    def _record(self, document_id: str) -> tuple[dict[str, Any], str, int] | None:
        with self._db.connect() as conn:
            row = conn.execute(
                "SELECT components_json, applied_at, preset_version FROM document_presets WHERE document_id = ?",
                (document_id,),
            ).fetchone()
        if row is None:
            return None
        written: dict[str, Any] = json.loads(row["components_json"])
        return written, row["applied_at"], row["preset_version"]

    def report(self, document_id: str, preset: Preset) -> ReadingPresetOut:
        sentences, same_edition = self._sentences_for(document_id, preset)
        resolved = sum(
            1 for speaker in preset.speakers if resolve(speaker.anchor, sentences, quotes=same_edition) is not None
        )
        lines = {character.name: character.lines for character in self._casting.list_for(document_id)}
        record = self._record(document_id)
        written = record[0] if record else {}
        return ReadingPresetOut(
            preset_id=preset.preset_id,
            preset_version=preset.preset_version,
            work_id=preset.work_id,
            title=preset.title,
            summary=preset.summary,
            narrator=self._choose(preset.narrator.voice) if preset.narrator else None,
            characters=[
                PresetCharacterOut(
                    id=c.id,
                    name=c.name,
                    description=c.description,
                    voice=self._choose(c.voice),
                    lines=sum(lines.get(name, 0) for name in c.names),
                )
                for c in preset.characters
            ],
            speakers_resolved=resolved,
            speakers_unresolved=len(preset.speakers) - resolved,
            effects=len(preset.effects),
            music_track_id=preset.music.recommendation.track_id if preset.music else None,
            edition_matches=same_edition,
            components=[
                PresetComponentOut(name=name, available=name not in NOT_YET, note=NOTES[name], applied=name in written)
                for name in preset.components
            ],
            applied_at=record[1] if record else None,
            applied_version=record[2] if record else None,
        )

    def apply(self, document_id: str, preset: Preset, components: Sequence[str]) -> ReadingPresetOut:
        """Write the chosen components into the document's own tables, remembering exactly what was written."""
        wanted = [name for name in COMPONENTS if name in components]
        if any(name in NOT_YET for name in wanted):
            raise ConflictError(
                "Sound effects and music can't be applied in this version yet.", code="component_unavailable"
            )
        if any(name not in preset.components for name in wanted):
            raise NotFoundError("This preset has no such component.", code="component_not_found")
        self.remove(document_id)  # applying again starts from the preset, not from a mix
        written: dict[str, Any] = {}
        if "narrator" in wanted and preset.narrator:
            written["narrator"] = self._choose(preset.narrator.voice).chosen
        voices = {c.id: self._choose(c.voice).chosen for c in preset.characters}
        if "characters" in wanted:
            assigned: dict[str, str] = {}
            for character in preset.characters:
                voice = voices[character.id]
                if voice is None:
                    continue  # no candidate is available: skipped and visible in the report, never guessed
                for name in character.names:
                    self._casting.assign(document_id, CharacterAssignment(name=name, voice_id=voice))
                    assigned[name] = voice
            written["characters"] = assigned
        if "speakers" in wanted:
            written["speakers"] = self._apply_speakers(document_id, preset, voices)
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO document_presets (document_id, preset_id, preset_version, components_json, applied_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (document_id, preset.preset_id, preset.preset_version, json.dumps(written), utc_now()),
            )
        return self.report(document_id, preset)

    def _apply_speakers(self, document_id: str, preset: Preset, voices: dict[str, str | None]) -> list[list[Any]]:
        """Speaker annotations as rows: a quoted line names its speaker, a whole sentence takes the voice."""
        names = {c.id: c.name for c in preset.characters}
        sentences, same_edition = self._sentences_for(document_id, preset)
        rows: list[list[Any]] = []
        for speaker in preset.speakers:
            if speaker.confidence == "uncertain":
                continue
            index = resolve(speaker.anchor, sentences, quotes=same_edition)
            if index is None:
                continue
            if speaker.scope == "quoted":
                self._styling.annotate(document_id, index, "speaker", names[speaker.speaker])
                rows.append([index, "speaker"])
            elif voices.get(speaker.speaker):
                self._styling.annotate(document_id, index, "voice", voices[speaker.speaker])
                rows.append([index, "voice"])
        return rows

    def remove(self, document_id: str) -> None:
        """Take out exactly the rows a preset wrote; the reader's own changes to other rows stay."""
        record = self._record(document_id)
        if record is None:
            return
        written = record[0]
        for name in written.get("characters") or {}:
            self._casting.assign(document_id, CharacterAssignment(name=str(name), voice_id=None))
        for index, kind in written.get("speakers") or []:
            self._styling.annotate(document_id, int(index), str(kind), None)
        with self._db.connect() as conn:
            conn.execute("DELETE FROM document_presets WHERE document_id = ?", (document_id,))
