# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Create, list, update and permanently delete local custom voice profiles.

Scope: Quick voices: validates an uploaded reference recording (container, channels, sample rate,
duration), runs the quality checks (and suggests a cleanup), requires explicit consent, applies the
chosen cleanup, trims and normalises the clip, and stores only that reference WAV plus metadata under
``data/voices/<id>/``; previews a cleanup on a recording. Studio voices: stores a
finished session's chosen take, its built voice file and the session's takes there. Both have a
delivery (sampling preset) that is part of the audio cache revision. No model is trained and nothing
leaves the machine. Deleting a profile removes its recordings, metadata and all audio made with it.
Does NOT belong: Cloning inference (engine) or HTTP parsing (``router.py``).
"""

from __future__ import annotations

import json
import logging
import shutil
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
import soundfile as sf

from ltts.audio import encode_wav, normalize_peak, read_audio, trim_silence
from ltts.common import ApiModel, new_id, utc_now
from ltts.config import Settings
from ltts.db import Database
from ltts.engines.base import Delivery, VoiceInfo, VoiceSpec
from ltts.errors import AppError, ConflictError, NotFoundError, UnsupportedDocumentError
from ltts.voices.cleanup import Cleanup, RecordingCheck, apply_cleanup, suggest_cleanup
from ltts.voices.quality import QualityReport, analyze

log = logging.getLogger("ltts.voices")
CLONING_ENGINE = "chatterbox"
MAX_STORED_S = 30.0
# Stored with each profile, so changing the wording never rewrites what an existing voice was created under.
CONSENT_STATEMENT = (
    "I am the person speaking in this recording, or I have their explicit permission to create and use a "
    "synthetic copy of their voice (for a child, a parent's or guardian's). I won't use it to impersonate or "
    "deceive anyone, to pass generated speech off as a real recording, or in any way that breaks the law or "
    "someone's rights."
)
_FORMATS = {"WAV", "FLAC", "OGG"}
VoiceKind = Literal["quick", "studio"]
_STORES: dict[str, str] = {
    "quick": "A trimmed copy of your reference recording (WAV). No model is trained or uploaded.",
    "studio": "Your session recordings (FLAC) and the voice built from them. No model is trained or uploaded.",
}
_COLUMNS = (
    "id",
    "name",
    "engine_id",
    "duration_s",
    "sample_rate",
    "quality_json",
    "consent_statement",
    "consented_at",
    "source",
    "created_at",
    "kind",
    "delivery",
    "voice_file",
)
_INSERT = (
    "INSERT INTO voice_profiles (id, name, engine_id, duration_s, sample_rate, quality_json, consent_statement, "
    "consented_at, source, created_at, kind, delivery, voice_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)


class VoiceProfileOut(ApiModel):
    id: str
    voice_id: str
    name: str
    engine_id: str
    duration_s: float
    sample_rate: int
    quality: QualityReport
    consented_at: str
    source: str
    created_at: str
    kind: VoiceKind = "quick"
    delivery: Delivery = "natural"
    stores: str = _STORES["quick"]


@dataclass(frozen=True, slots=True)
class StudioVoice:
    """A finished studio session, ready to become a profile."""

    name: str
    reference: Path  # the chosen take, kept as the profile's playable reference recording
    voice: Path  # the built voice file
    takes: Path  # the session's takes folder, moved under the profile
    quality: QualityReport
    speech_s: float
    delivery: Delivery


class ReferenceQualityError(AppError):
    status_code = 422
    code = "reference_quality"


def _decode(path: Path, max_seconds: float) -> tuple[np.ndarray, int]:
    try:
        info = sf.info(str(path))
    except (sf.LibsndfileError, RuntimeError) as exc:
        raise UnsupportedDocumentError(
            "That audio file couldn't be read. Use WAV, FLAC or OGG (the app converts other formats for you).",
            code="unsupported_audio",
        ) from exc
    if info.format not in _FORMATS or info.channels > 2 or not 16_000 <= info.samplerate <= 48_000:
        raise UnsupportedDocumentError("Use a mono or stereo WAV/FLAC/OGG at 16–48 kHz.", code="unsupported_audio")
    if info.frames / info.samplerate > max_seconds:
        raise ReferenceQualityError(
            f"The recording is longer than {max_seconds:.0f} seconds. Trim it to under a minute.",
            code="too_long",
        )
    return read_audio(path)


def decode_recording(path: Path, max_seconds: float) -> tuple[np.ndarray, int]:
    """Read an uploaded recording after checking its container, channels, rate and length."""
    return _decode(path, max_seconds)


class VoiceProfileService:
    def __init__(self, settings: Settings, db: Database, purge_audio: Callable[[str], int]):
        self._settings = settings
        self._db = db
        self._purge_audio = purge_audio

    @property
    def root(self) -> Path:
        return self._settings.path("voices")

    def reference_path(self, profile_id: str) -> Path:
        return self.root / profile_id / "reference.wav"

    def analyze_file(self, path: Path) -> RecordingCheck:
        samples, rate = _decode(path, self._settings.max_voice_reference_s)
        report = analyze(trim_silence(samples, rate), rate)
        # The untrimmed recording: its pauses show the background the cleanup is suggested for.
        return RecordingCheck(report=report, suggested=suggest_cleanup(report, samples, rate))

    def cleanup_preview(self, path: Path, cleanup: Cleanup) -> bytes:
        """A recording with ``cleanup`` applied, as WAV, to compare with the original."""
        samples, rate = _decode(path, self._settings.max_voice_reference_s)
        return encode_wav(apply_cleanup(samples, rate, cleanup), rate)

    def _check_can_create(self, consent: bool) -> None:
        if not consent:
            raise ConflictError(
                "Confirm you have permission to use this voice before creating a profile.",
                code="consent_required",
            )
        with self._db.connect() as conn:
            if conn.execute("SELECT COUNT(*) FROM voice_profiles").fetchone()[0] >= self._settings.max_voice_profiles:
                raise ConflictError("You've reached the maximum number of custom voices.", code="voice_limit")

    def _insert(self, row: dict[str, object]) -> None:
        now = utc_now()
        values: dict[str, object] = {"engine_id": CLONING_ENGINE, "consent_statement": CONSENT_STATEMENT}
        values |= {"consented_at": now}
        values |= {"created_at": now, **row}
        with self._db.connect() as conn:
            conn.execute(_INSERT, [values.get(column) for column in _COLUMNS])

    def _new_folder(self, speech: np.ndarray, rate: int) -> tuple[str, Path, np.ndarray]:
        """A new profile id and folder holding its playable reference recording (normalised, at most 30 s)."""
        clip = normalize_peak(speech[: int(MAX_STORED_S * rate)], -1.0)
        profile_id = new_id()
        folder = self.root / profile_id
        folder.mkdir(parents=True)
        sf.write(str(folder / "reference.wav"), clip, rate, subtype="PCM_16")
        return profile_id, folder, clip

    def create(
        self, path: Path, name: str, consent: bool, source: str, cleanup: Cleanup | None = None
    ) -> VoiceProfileOut:
        self._check_can_create(consent)
        samples, rate = _decode(path, self._settings.max_voice_reference_s)
        trimmed = trim_silence(samples, rate)
        report = analyze(trimmed, rate)
        if not report.ok:
            raise ReferenceQualityError(
                "The recording didn't pass the quality checks.",
                details={"report": report.model_dump(by_alias=True)},
            )
        if cleanup is not None and cleanup.active:
            # Cleaned before trimming, so noise reduction learns the background from the pauses.
            trimmed = trim_silence(apply_cleanup(samples, rate, cleanup), rate)
        profile_id, _, clip = self._new_folder(trimmed, rate)
        self._insert(
            {
                "id": profile_id,
                "name": name,
                "duration_s": round(len(clip) / rate, 2),
                "sample_rate": rate,
                "quality_json": report.model_dump_json(by_alias=True),
                "source": source,
                "kind": "quick",
                "delivery": "natural",
            }
        )
        log.info("voice profile created", extra={"profile_id": profile_id, "source": source})
        return self.get(profile_id)

    def create_studio(self, voice: StudioVoice, consent: bool) -> VoiceProfileOut:
        """Turn a finished session into a profile; the session's files move under the profile's folder."""
        self._check_can_create(consent)
        samples, rate = read_audio(voice.reference)
        profile_id, folder, _ = self._new_folder(trim_silence(samples, rate), rate)
        voice_file = f"voice-{new_id()[:12]}.safetensors"
        shutil.move(voice.voice, folder / voice_file)
        shutil.move(voice.takes, folder / "takes")
        self._insert(
            {
                "id": profile_id,
                "name": voice.name,
                "duration_s": round(voice.speech_s, 1),
                "sample_rate": rate,
                "quality_json": voice.quality.model_dump_json(by_alias=True),
                "source": "studio",
                "kind": "studio",
                "delivery": voice.delivery,
                "voice_file": voice_file,
            }
        )
        log.info("voice profile created", extra={"profile_id": profile_id, "source": "studio"})
        return self.get(profile_id)

    def _row(self, r: sqlite3.Row) -> VoiceProfileOut:
        return VoiceProfileOut(
            id=r["id"],
            voice_id=f"custom:{r['id']}",
            name=r["name"],
            engine_id=r["engine_id"],
            duration_s=r["duration_s"],
            sample_rate=r["sample_rate"],
            quality=QualityReport.model_validate(json.loads(r["quality_json"])),
            consented_at=r["consented_at"],
            source=r["source"],
            created_at=r["created_at"],
            kind=r["kind"],
            delivery=r["delivery"],
            stores=_STORES[r["kind"]],
        )

    def list_all(self) -> list[VoiceProfileOut]:
        with self._db.connect() as conn:
            rows = conn.execute("SELECT * FROM voice_profiles ORDER BY created_at DESC").fetchall()
        return [self._row(row) for row in rows]

    def get(self, profile_id: str) -> VoiceProfileOut:
        with self._db.connect() as conn:
            row = conn.execute("SELECT * FROM voice_profiles WHERE id = ?", (profile_id,)).fetchone()
        if row is None:
            raise NotFoundError("That voice profile no longer exists.", code="voice_not_found")
        return self._row(row)

    def update(self, profile_id: str, *, name: str | None = None, delivery: Delivery | None = None) -> VoiceProfileOut:
        current = self.get(profile_id)
        with self._db.connect() as conn:
            conn.execute(
                "UPDATE voice_profiles SET name = ?, delivery = ? WHERE id = ?",
                (name or current.name, delivery or current.delivery, profile_id),
            )
        if delivery and delivery != current.delivery:
            # Audio made with the old delivery can never be served again (it's in the cache revision).
            self._purge_audio(current.voice_id)
        return self.get(profile_id)

    def delete(self, profile_id: str) -> None:
        self.get(profile_id)
        shutil.rmtree(self.root / profile_id, ignore_errors=True)
        with self._db.connect() as conn:
            conn.execute("DELETE FROM voice_profiles WHERE id = ?", (profile_id,))
            conn.execute("UPDATE progress SET voice_id = NULL WHERE voice_id = ?", (f"custom:{profile_id}",))
        purged = self._purge_audio(f"custom:{profile_id}")
        log.info("voice profile deleted", extra={"profile_id": profile_id, "purged_audio": purged})

    # -- registry hooks ----------------------------------------------------
    def resolve(self, profile_id: str) -> tuple[str, VoiceSpec, str]:
        profile = self.get(profile_id)
        path = self.reference_path(profile_id)
        if not path.is_file():
            raise NotFoundError("This voice's reference recording is missing.", code="voice_not_found")
        with self._db.connect() as conn:
            voice_file = conn.execute("SELECT voice_file FROM voice_profiles WHERE id = ?", (profile_id,)).fetchone()[0]
        conditioning = self.root / profile_id / voice_file if voice_file else None
        if conditioning is not None and not conditioning.is_file():
            raise NotFoundError("This voice's built voice file is missing.", code="voice_not_found")
        # A quick voice with the default delivery keeps its original revision, so its cached audio stays valid.
        parts = [profile.created_at, voice_file or "", "" if profile.delivery == "natural" else profile.delivery]
        spec = VoiceSpec(
            key=f"profile:{profile_id}", reference_path=path, conditioning_path=conditioning, delivery=profile.delivery
        )
        return profile.engine_id, spec, "|".join(part for part in parts if part)

    def as_voices(self, engine_ready: Callable[[], bool]) -> list[VoiceInfo]:
        ready = engine_ready()
        return [
            VoiceInfo(
                id=p.voice_id,
                engine_id=p.engine_id,
                name=p.name,
                language="English",
                language_code="en",
                gender="unspecified",
                category="custom",
                description=_describe(p),
                available=ready,
            )
            for p in self.list_all()
        ]


def _describe(profile: VoiceProfileOut) -> str:
    if profile.kind == "studio":
        return f"Studio voice built from {max(profile.duration_s / 60, 1):.0f} min of recordings."
    return f"Custom voice from a {profile.duration_s:.0f}s {profile.source}."
