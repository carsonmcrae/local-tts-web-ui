"""Purpose: Create, list, rename and permanently delete local custom voice profiles.

Scope: Validates an uploaded reference recording (container, channels, sample rate, duration),
runs the quality checks, requires explicit consent, trims and normalises the clip, and stores only
that reference WAV plus metadata under ``data/voices/<id>/``. No model is trained and nothing leaves
the machine. Deleting a profile removes the recording, its metadata and all audio generated with it.
Does NOT belong: Cloning inference (engine) or HTTP parsing (``router.py``).
"""

from __future__ import annotations

import json
import logging
import shutil
import sqlite3
from collections.abc import Callable
from pathlib import Path

import numpy as np
import soundfile as sf

from ltts.audio import normalize_peak, read_audio, trim_silence
from ltts.common import ApiModel, new_id, utc_now
from ltts.config import Settings
from ltts.db import Database
from ltts.engines.base import VoiceInfo, VoiceSpec
from ltts.errors import AppError, ConflictError, NotFoundError, UnsupportedDocumentError
from ltts.voices.quality import QualityReport, analyze

log = logging.getLogger("ltts.voices")
CLONING_ENGINE = "chatterbox"
MAX_STORED_S = 30.0
CONSENT_STATEMENT = (
    "I am the person speaking in this recording, or I have the speaker's explicit permission to create and "
    "use a synthetic version of their voice. I will not use it to impersonate, deceive or harm anyone."
)
_FORMATS = {"WAV", "FLAC", "OGG"}


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
    stores: str = "A trimmed copy of your reference recording (WAV). No model is trained or uploaded."


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

    def analyze_file(self, path: Path) -> QualityReport:
        samples, rate = _decode(path, self._settings.max_voice_reference_s)
        return analyze(trim_silence(samples, rate), rate)

    def create(self, path: Path, name: str, consent: bool, source: str) -> VoiceProfileOut:
        if not consent:
            raise ConflictError(
                "Confirm you have permission to use this voice before creating a profile.",
                code="consent_required",
            )
        with self._db.connect() as conn:
            if conn.execute("SELECT COUNT(*) FROM voice_profiles").fetchone()[0] >= self._settings.max_voice_profiles:
                raise ConflictError("You've reached the maximum number of custom voices.", code="voice_limit")
        samples, rate = _decode(path, self._settings.max_voice_reference_s)
        trimmed = trim_silence(samples, rate)
        report = analyze(trimmed, rate)
        if not report.ok:
            raise ReferenceQualityError(
                "The recording didn't pass the quality checks.",
                details={"report": report.model_dump(by_alias=True)},
            )
        clip = normalize_peak(trimmed[: int(MAX_STORED_S * rate)], -1.0)
        profile_id = new_id()
        folder = self.root / profile_id
        folder.mkdir(parents=True)
        sf.write(str(folder / "reference.wav"), clip, rate, subtype="PCM_16")
        now = utc_now()
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO voice_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    profile_id,
                    name,
                    CLONING_ENGINE,
                    round(len(clip) / rate, 2),
                    rate,
                    report.model_dump_json(by_alias=True),
                    CONSENT_STATEMENT,
                    now,
                    source,
                    now,
                ),
            )
        log.info("voice profile created", extra={"profile_id": profile_id, "source": source})
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

    def rename(self, profile_id: str, name: str) -> VoiceProfileOut:
        with self._db.connect() as conn:
            if conn.execute("UPDATE voice_profiles SET name = ? WHERE id = ?", (name, profile_id)).rowcount == 0:
                raise NotFoundError("That voice profile no longer exists.", code="voice_not_found")
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
        return (
            profile.engine_id,
            VoiceSpec(key=f"profile:{profile_id}", reference_path=path),
            profile.created_at,
        )

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
                description=f"Custom voice from a {p.duration_s:.0f}s {p.source}.",
                available=ready,
            )
            for p in self.list_all()
        ]
