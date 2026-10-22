# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Apply a bundled book's reading preset to a document, report what it would do, and take it out again.

Scope: The report of what a preset offers a document (which voices are installed here, which anchors
resolve, what was applied); applying the components the reader chose: characters' voices and speaker
annotations go into the same tables the reader's own choices use, sound effects become rows the
preset owns in the sound-effects store (anchors resolved here, the volume mapped to the sound's own
level, an ambience's end from its anchor or its duration), music is only recorded as chosen (the
track is a device setting the web app's player keeps), and exactly what was written is recorded in
``document_presets``; removing takes out exactly that. Nothing here changes a document's text, starts
playback, or turns music or effects on.
Does NOT belong: The preset format and anchors (``presets.py``), the sound-effects store's own rules
(``ltts.sfx.store``), HTTP (``router.py``) or the players.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from pydantic import Field

from ltts.common import ApiModel, utc_now
from ltts.db import Database
from ltts.documents.casting import CastingStore, CharacterAssignment
from ltts.documents.styling import StylingStore
from ltts.errors import NotFoundError
from ltts.library.presets import COMPONENTS, Component, EffectAnnotation, Preset, Sentences, VoiceRef, resolve
from ltts.sfx import catalogue
from ltts.sfx.store import MAX_SPAN, MAX_VOLUME, PresetEffectIn, SoundEffectStore

SECONDS_PER_SENTENCE = 4  # roughly how long a read sentence lasts, for an ambience given as a duration


def _effect_volume(effect: EffectAnnotation) -> int:
    """The store's percent of the effects volume, from the preset's percent of the sound's own recommended level."""
    sound = catalogue.sound(effect.sound_id) if effect.sound_id else catalogue.default_sound(effect.event)
    return min(MAX_VOLUME, round((sound.gain if sound else 1.0) * effect.volume))


def _until(effect: EffectAnnotation, start: int, sentences: Sentences, quotes: bool, last: int) -> int | None:
    """The sentence an ambience lasts to: its end anchor when that resolves at or after the start, else its duration."""
    if not effect.loop:
        return None
    end = resolve(effect.end_anchor, sentences, quotes=quotes) if effect.end_anchor else None
    if end is None or end < start:
        if effect.duration_s is None:
            return None  # the end was anchored to text that isn't here: no guess, and the store refuses the row
        end = start + max(1, round(effect.duration_s / SECONDS_PER_SENTENCE))
    return min(end, start + MAX_SPAN, last)


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
    available: bool  # can be applied in this version of TTSNative (every component, since 2.2.0)
    note: str  # what it does
    applied: bool


class PresetMusicOut(ApiModel):
    track_id: str  # a track of the web app's music library; choosing it is the player's, per device
    volume: int  # the recommended level, 0-100 %
    note: str | None


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
    effects: int  # curated sound effects in the preset
    effects_placed: int  # of those, rows now in the document's sound-effects arrangement (0 until applied)
    music: PresetMusicOut | None
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
    "effects": "The book's sound effects, placed in the Sounds panel; off until you turn them on in the player.",
    "music": "A recommended background track; music stays off until you turn it on in the player.",
}


@dataclass(frozen=True)
class PresetStores:
    """The document stores a preset writes into: the same ones the reader's own choices use."""

    styling: StylingStore
    casting: CastingStore
    sfx: SoundEffectStore


class PresetService:
    def __init__(
        self,
        db: Database,
        stores: PresetStores,
        sentences: Callable[[str], Sentences],
        available: Callable[[str], bool],
        presets: dict[str, Preset],
    ):
        self._db = db
        self._styling = stores.styling
        self._casting = stores.casting
        self._sfx = stores.sfx
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

    @staticmethod
    def _music(preset: Preset) -> PresetMusicOut | None:
        if preset.music is None:
            return None
        track = preset.music.recommendation
        return PresetMusicOut(track_id=track.track_id, volume=track.volume, note=track.note)

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
            effects_placed=len((written.get("effects") or {}).get("placed") or []),
            music=self._music(preset),
            edition_matches=same_edition,
            components=[
                PresetComponentOut(name=name, available=True, note=NOTES[name], applied=name in written)
                for name in preset.components
            ],
            applied_at=record[1] if record else None,
            applied_version=record[2] if record else None,
        )

    def apply(self, document_id: str, preset: Preset, components: Sequence[str]) -> ReadingPresetOut:
        """Write the chosen components into the document's own tables, remembering exactly what was written."""
        wanted = [name for name in COMPONENTS if name in components]
        if any(name not in preset.components for name in wanted):
            raise NotFoundError("This preset has no such component.", code="component_not_found")
        self.remove(document_id)  # applying again starts from the preset, not from a mix
        written: dict[str, Any] = {}
        if "narrator" in wanted and preset.narrator:
            written["narrator"] = self._choose(preset.narrator.voice).chosen
        voices = {c.id: self._choose(c.voice).chosen for c in preset.characters}
        if "characters" in wanted:
            written["characters"] = self._apply_characters(document_id, preset, voices)
        if "speakers" in wanted:
            written["speakers"] = self._apply_speakers(document_id, preset, voices)
        if "effects" in wanted:
            written["effects"] = self._apply_effects(document_id, preset)
        if "music" in wanted and preset.music:
            # Recorded as chosen, nothing more: the track a device plays is its own setting in the web app.
            track = preset.music.recommendation
            written["music"] = {"track_id": track.track_id, "volume": track.volume}
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO document_presets (document_id, preset_id, preset_version, components_json, applied_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (document_id, preset.preset_id, preset.preset_version, json.dumps(written), utc_now()),
            )
        return self.report(document_id, preset)

    def _apply_characters(self, document_id: str, preset: Preset, voices: dict[str, str | None]) -> dict[str, str]:
        """Cast every name of each character to its voice; returns the voice each name was given."""
        assigned: dict[str, str] = {}
        for character in preset.characters:
            voice = voices[character.id]
            if voice is None:
                continue  # no candidate is available: skipped and visible in the report, never guessed
            for name in character.names:
                self._casting.assign(document_id, CharacterAssignment(name=name, voice_id=voice))
                assigned[name] = voice
        return assigned

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

    def _apply_effects(self, document_id: str, preset: Preset) -> dict[str, Any]:
        """Place the preset's effects as rows it owns in the Sounds panel; what doesn't resolve is skipped."""
        sentences, same_edition = self._sentences_for(document_id, preset)
        last = max((index for index, _ in sentences), default=0)
        rows: list[PresetEffectIn] = []
        unresolved = 0
        for effect in preset.effects:
            start = resolve(effect.anchor, sentences, quotes=same_edition)
            if start is None:
                unresolved += 1
                continue
            rows.append(
                PresetEffectIn(
                    segment_index=start,
                    event=effect.event,
                    sound_id=effect.sound_id,
                    position=effect.position,
                    offset_ms=effect.offset_ms,
                    until_segment=_until(effect, start, sentences, same_edition, last),
                    volume=_effect_volume(effect),
                    loop=effect.loop,
                )
            )
        placement = self._sfx.apply_preset(document_id, preset.preset_id, preset.preset_version, rows)
        return {"placed": placement.placed, "skipped": {**placement.skipped, "unresolved": unresolved}}

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
        if "effects" in written:
            self._sfx.remove_preset(document_id)  # a row the reader edited is theirs by then and stays
        with self._db.connect() as conn:
            conn.execute("DELETE FROM document_presets WHERE document_id = ?", (document_id,))
