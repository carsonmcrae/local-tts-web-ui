"""Purpose: Draft studio recording sessions: their takes, imported recordings and a microphone check.

Scope: A session is a folder ``data/voices/sessions/<id>/takes/NNN.flac`` (24-bit FLAC at the
recording's own sample rate) plus rows in ``voice_sessions`` and ``voice_takes``. Saving a take
checks it with the take rules; importing a long recording splits it into takes at pauses; any change
to the takes clears built candidates, and no change is allowed while a build is running. Also checks
a short microphone test clip (with the cleanup it suggests: noise reduction, rumble filter, tone) and
keeps the session's chosen cleanup, applied to cleaned-up copies of the takes for building while the
originals stay untouched. Sessions stay local drafts until finished (``studio.py``) or deleted.
Does NOT belong: Building or auditioning voices (``studio.py``) or HTTP parsing (``sessions_router.py``).
"""

from __future__ import annotations

import json
import logging
import shutil
import sqlite3
from pathlib import Path
from typing import Literal

import soundfile as sf

from ltts.audio import Float32Array, read_audio, split_at_pauses, trim_silence
from ltts.common import MB, ApiModel, ensure_free_space, new_id, utc_now
from ltts.config import Settings
from ltts.db import Database
from ltts.errors import ConflictError, NotFoundError
from ltts.jobs import JobManager
from ltts.voices.cleanup import Cleanup, RecordingCheck, apply_cleanup, suggest_cleanup
from ltts.voices.profiles import decode_recording
from ltts.voices.quality import CHECK_RULES, TAKE_RULES, QualityReport, analyze

log = logging.getLogger("ltts.voices.sessions")
BUILD_JOB = "voice-build"
MAX_TAKE_S = 60.0
MAX_CHECK_S = 30.0
TAKE_SPACE_BYTES = 50 * MB
IMPORT_FIRST = 101  # takes 1-100 belong to the recorded passages, so an import never replaces one
TakeSource = Literal["recording", "import"]
_UPSERT_TAKE = (
    "INSERT OR REPLACE INTO voice_takes (session_id, number, prompt_id, source, duration_s, quality_json, created_at)"
    " VALUES (?, ?, ?, ?, ?, ?, ?)"
)


class TakeOut(ApiModel):
    number: int
    prompt_id: str | None
    source: TakeSource
    duration_s: float
    quality: QualityReport
    created_at: str


class CandidateOut(ApiModel):
    """A voice built from one take, with how closely its test samples matched the session's speaker."""

    index: int
    take_number: int
    prompt_id: str | None
    similarity: float
    samples: int


class VoiceSessionOut(ApiModel):
    id: str
    takes: list[TakeOut]
    usable_speech_s: float
    required_speech_s: float
    candidates: list[CandidateOut]
    build_job_id: str | None  # the running voice-build job, if any
    cleanup: Cleanup | None  # applied to copies of the takes when building
    created_at: str
    updated_at: str


class VoiceSessionService:
    def __init__(self, settings: Settings, db: Database, jobs: JobManager):
        self._settings = settings
        self._db = db
        self._jobs = jobs

    @property
    def root(self) -> Path:
        return self._settings.path("voices", "sessions")

    def folder(self, session_id: str) -> Path:
        return self.root / session_id

    def take_path(self, session_id: str, number: int) -> Path:
        return self.folder(session_id) / "takes" / f"{number:03d}.flac"

    def candidate_dir(self, session_id: str, index: int) -> Path:
        return self.folder(session_id) / "candidates" / str(index)

    def corrected_path(self, session_id: str, number: int) -> Path:
        return self.folder(session_id) / "corrected" / f"{number:03d}.flac"

    # -- sessions -----------------------------------------------------------
    def create(self, cleanup: Cleanup | None = None) -> VoiceSessionOut:
        session_id = new_id()
        (self.folder(session_id) / "takes").mkdir(parents=True)
        now = utc_now()
        cleanup_json = cleanup.model_dump_json(by_alias=True) if cleanup and cleanup.active else None
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO voice_sessions (id, cleanup_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (session_id, cleanup_json, now, now),
            )
        log.info("voice session created", extra={"session_id": session_id})
        return self.get(session_id)

    def list_all(self) -> list[VoiceSessionOut]:
        with self._db.connect() as conn:
            ids = [r["id"] for r in conn.execute("SELECT id FROM voice_sessions ORDER BY updated_at DESC")]
        return [self.get(session_id) for session_id in ids]

    def get(self, session_id: str) -> VoiceSessionOut:
        with self._db.connect() as conn:
            row = conn.execute("SELECT * FROM voice_sessions WHERE id = ?", (session_id,)).fetchone()
            if row is None:
                raise NotFoundError("That recording session no longer exists.", code="session_not_found")
            rows = conn.execute("SELECT * FROM voice_takes WHERE session_id = ? ORDER BY number", (session_id,))
            takes = [_take(r) for r in rows]
        candidates = [CandidateOut.model_validate(c) for c in json.loads(row["candidates_json"] or "[]")]
        building = self._jobs.find_active(BUILD_JOB, session_id)
        return VoiceSessionOut(
            id=session_id,
            takes=takes,
            usable_speech_s=round(sum(t.quality.speech_s for t in takes if t.quality.ok), 1),
            required_speech_s=self._settings.min_studio_speech_s,
            candidates=candidates,
            build_job_id=building.id if building else None,
            cleanup=Cleanup.model_validate_json(row["cleanup_json"]) if row["cleanup_json"] else None,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def delete(self, session_id: str) -> None:
        self.get(session_id)
        self._ensure_idle(session_id)
        shutil.rmtree(self.folder(session_id), ignore_errors=True)
        with self._db.connect() as conn:
            conn.execute("DELETE FROM voice_sessions WHERE id = ?", (session_id,))
        log.info("voice session deleted", extra={"session_id": session_id})

    def set_candidates(self, session_id: str, candidates: list[CandidateOut]) -> None:
        payload = json.dumps([c.model_dump(by_alias=True) for c in candidates])
        with self._db.connect() as conn:
            conn.execute(
                "UPDATE voice_sessions SET candidates_json = ?, updated_at = ? WHERE id = ?",
                (payload, utc_now(), session_id),
            )

    def usable_takes(self, session_id: str) -> list[tuple[TakeOut, Path]]:
        """The takes that passed, with the audio to build from: a cleaned-up copy when there is a cleanup."""
        session = self.get(session_id)
        usable = [take for take in session.takes if take.quality.ok]
        if session.cleanup is None:
            return [(take, self.take_path(session_id, take.number)) for take in usable]
        return [(take, self._corrected(session_id, take.number, session.cleanup)) for take in usable]

    def build_audio(self, session_id: str, number: int) -> Path:
        """The audio a voice was built from: the corrected copy if there is one, otherwise the take."""
        corrected = self.corrected_path(session_id, number)
        return corrected if corrected.is_file() else self.take_path(session_id, number)

    # -- takes --------------------------------------------------------------
    def put_take(self, session_id: str, number: int, upload: Path, prompt_id: str | None) -> TakeOut:
        session = self.get(session_id)
        self._ensure_idle(session_id)
        if number not in {t.number for t in session.takes} and len(session.takes) >= self._settings.max_session_takes:
            raise ConflictError("This session has reached its maximum number of takes.", code="take_limit")
        samples, rate = decode_recording(upload, MAX_TAKE_S)
        take = self._store(session_id, number, samples, rate, prompt_id, "recording")
        self._changed(session_id)
        return take

    def delete_take(self, session_id: str, number: int) -> None:
        self.get(session_id)
        self._ensure_idle(session_id)
        with self._db.connect() as conn:
            deleted = conn.execute("DELETE FROM voice_takes WHERE session_id = ? AND number = ?", (session_id, number))
            if deleted.rowcount == 0:
                raise NotFoundError("That take no longer exists.", code="take_not_found")
        self.take_path(session_id, number).unlink(missing_ok=True)
        self._changed(session_id)

    def import_recording(self, session_id: str, upload: Path) -> VoiceSessionOut:
        """Split a long recording into takes at its pauses, numbered from 101 after any earlier imports."""
        session = self.get(session_id)
        self._ensure_idle(session_id)
        samples, rate = decode_recording(upload, self._settings.max_voice_import_s)
        pieces = split_at_pauses(samples, rate)
        if len(session.takes) + len(pieces) > self._settings.max_session_takes:
            raise ConflictError("This recording would exceed the session's maximum number of takes.", code="take_limit")
        first = max([IMPORT_FIRST - 1, *(t.number for t in session.takes)]) + 1
        for offset, piece in enumerate(pieces):
            self._store(session_id, first + offset, piece, rate, None, "import")
        self._changed(session_id)
        log.info("recording imported", extra={"session_id": session_id, "takes": len(pieces)})
        return self.get(session_id)

    def check_microphone(self, upload: Path) -> RecordingCheck:
        samples, rate = decode_recording(upload, MAX_CHECK_S)
        report = analyze(samples, rate, CHECK_RULES)
        return RecordingCheck(report=report, suggested=suggest_cleanup(report, samples, rate))

    # -- internals ----------------------------------------------------------
    def _ensure_idle(self, session_id: str) -> None:
        if self._jobs.find_active(BUILD_JOB, session_id) is not None:
            raise ConflictError("This session's voice is being built. Wait for it to finish.", code="session_busy")

    def _store(
        self, session_id: str, number: int, samples: Float32Array, rate: int, prompt_id: str | None, source: TakeSource
    ) -> TakeOut:
        trimmed = trim_silence(samples, rate)
        clip = trimmed if trimmed.size else samples
        report = analyze(clip, rate, TAKE_RULES)
        path = self.take_path(session_id, number)
        ensure_free_space(path.parent, TAKE_SPACE_BYTES, self._settings.min_free_disk_mb)
        sf.write(str(path), clip, rate, format="FLAC", subtype="PCM_24")
        quality = report.model_dump_json(by_alias=True)
        with self._db.connect() as conn:
            conn.execute(
                _UPSERT_TAKE, (session_id, number, prompt_id, source, round(len(clip) / rate, 2), quality, utc_now())
            )
            row = conn.execute(
                "SELECT * FROM voice_takes WHERE session_id = ? AND number = ?", (session_id, number)
            ).fetchone()
        return _take(row)

    def _corrected(self, session_id: str, number: int, cleanup: Cleanup) -> Path:
        path = self.corrected_path(session_id, number)
        if not path.is_file():
            samples, rate = read_audio(self.take_path(session_id, number))
            path.parent.mkdir(parents=True, exist_ok=True)
            sf.write(str(path), apply_cleanup(samples, rate, cleanup), rate, subtype="PCM_24")
        return path

    def _changed(self, session_id: str) -> None:
        """Takes changed: candidates (and corrected copies) made from the old takes no longer apply."""
        shutil.rmtree(self.folder(session_id) / "candidates", ignore_errors=True)
        shutil.rmtree(self.folder(session_id) / "corrected", ignore_errors=True)
        with self._db.connect() as conn:
            conn.execute(
                "UPDATE voice_sessions SET candidates_json = NULL, updated_at = ? WHERE id = ?", (utc_now(), session_id)
            )


def _take(row: sqlite3.Row) -> TakeOut:
    return TakeOut(
        number=row["number"],
        prompt_id=row["prompt_id"],
        source=row["source"],
        duration_s=row["duration_s"],
        quality=QualityReport.model_validate(json.loads(row["quality_json"])),
        created_at=row["created_at"],
    )
