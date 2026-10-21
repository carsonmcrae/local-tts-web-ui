# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Background jobs (model installs, exports, voice builds) with progress, limits, cancellation and recovery.

Scope: Runs each job on its own daemon thread, de-duplicates identical active jobs, throttles
progress writes to SQLite, maps failures to stable error codes, and marks jobs that were running
when the server stopped as ``interrupted`` so the UI can offer a resume. Kinds of job that share a
limited resource share a ``Lane``: a few run at once, a few more wait their turn in order (as
``queued``, saying how many are ahead) and any beyond that are refused, whoever asks. A job can be
paused (it stops at its next check, like a cancel, but is recorded as ``paused``) and a stopped job
can be restarted under the same id, so its progress and history carry on.
Does NOT belong: What a job does — callers pass the work function (and any cleanup for a cancel).
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from ltts.common import ApiModel, new_id, utc_now
from ltts.db import Database
from ltts.errors import AppError, BusyError, ConflictError, NotFoundError

log = logging.getLogger("ltts.jobs")
_WRITE_INTERVAL_S = 0.5
_TURN_CHECK_S = 1.0  # a waiting job looks again at least this often (it is also woken at once)


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"
    INTERRUPTED = "interrupted"
    PAUSED = "paused"


ACTIVE = {JobStatus.QUEUED, JobStatus.RUNNING}
STOPPED = {JobStatus.FAILED, JobStatus.CANCELED, JobStatus.INTERRUPTED, JobStatus.PAUSED}


@dataclass(frozen=True, slots=True)
class Lane:
    """Kinds of job that share one limited resource: ``running`` of them run at once and ``waiting``
    more wait their turn in order; one beyond both is refused with ``code`` and ``message`` (429)."""

    name: str
    kinds: frozenset[str]
    running: int
    waiting: int
    noun: str  # one job of the lane, as the waiting message says it ("export")
    code: str
    message: str


# Building, restyling and fine-tuning a studio voice each keep the cloning engine (and the GPU, when
# there is one) busy for many minutes and hold its working memory: one runs at a time and none waits.
VOICE_LANE = Lane(
    name="voice",
    kinds=frozenset({"voice-build", "voice-styles", "voice-tune"}),
    running=1,
    waiting=0,
    noun="voice job",
    code="voice_job_running",
    message="Another studio voice is being built or fine-tuned. Try again when it has finished.",
)


class JobOut(ApiModel):
    id: str
    kind: str
    status: JobStatus
    progress: float
    message: str
    payload: dict[str, Any]
    result: dict[str, Any] | None
    error_code: str | None
    created_at: str
    updated_at: str


class JobCanceledError(Exception):
    """Raised inside job code when cancellation was requested."""


class JobContext:
    def __init__(self, manager: JobManager, job_id: str, cancel: threading.Event):
        self.job_id = job_id
        self._manager = manager
        self._cancel = cancel
        self._last_write = 0.0

    @property
    def canceled(self) -> bool:
        return self._cancel.is_set()

    def check(self) -> None:
        if self._cancel.is_set():
            raise JobCanceledError

    def update(self, progress: float, message: str, *, force: bool = False) -> None:
        now = time.monotonic()
        if force or now - self._last_write >= _WRITE_INTERVAL_S:
            self._last_write = now
            self._manager._write(self.job_id, progress=max(0.0, min(progress, 1.0)), message=message)


JobFn = Callable[[JobContext], dict[str, Any] | None]


def _row_to_job(row: Any) -> JobOut:
    return JobOut(
        id=row["id"],
        kind=row["kind"],
        status=JobStatus(row["status"]),
        progress=row["progress"],
        message=row["message"],
        payload=json.loads(row["payload_json"]),
        result=json.loads(row["result_json"]) if row["result_json"] else None,
        error_code=row["error_code"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _waiting(lane: Lane, ahead: int) -> str:
    return f"Waiting its turn ({ahead} {lane.noun if ahead == 1 else lane.noun + 's'} ahead)…"


_UPDATE_SQL = """
UPDATE jobs SET
    status = COALESCE(:status, status),
    progress = COALESCE(:progress, progress),
    message = COALESCE(:message, message),
    result_json = COALESCE(:result_json, result_json),
    error_code = COALESCE(:error_code, error_code),
    updated_at = :updated_at
WHERE id = :id
"""


class JobManager:
    def __init__(self, db: Database, lanes: Iterable[Lane] = (VOICE_LANE,)):
        self._db = db
        self._lock = threading.Lock()
        self._turns = threading.Condition(self._lock)  # woken whenever a lane's place frees or a job stops
        self._cancel: dict[str, threading.Event] = {}
        self._pausing: set[str] = set()
        self._lanes: dict[str, Lane] = {}  # kind -> its lane
        self._lines: dict[str, list[str]] = {}  # lane name -> its jobs in the order they were let in
        self._on_cancel: dict[str, Callable[[str], None]] = {}
        for lane in lanes:
            self.limit(lane)

    def limit(self, lane: Lane) -> None:
        """Make ``lane``'s kinds of job share its places (set up once, before such jobs start)."""
        with self._lock:
            for kind in lane.kinds:
                self._lanes[kind] = lane
            self._lines.setdefault(lane.name, [])

    def when_canceled(self, kind: str, cleanup: Callable[[str], None]) -> None:
        """Run ``cleanup(job_id)`` when a job of ``kind`` ends canceled, before its status says so,
        even when it was canceled while waiting its turn (so its work never ran)."""
        self._on_cancel[kind] = cleanup

    def recover(self) -> int:
        with self._db.connect() as conn:
            return conn.execute(
                "UPDATE jobs SET status = ?, message = ?, updated_at = ? WHERE status IN (?, ?)",
                (JobStatus.INTERRUPTED, "Stopped when the app shut down.", utc_now(), *ACTIVE),
            ).rowcount

    def _write(
        self,
        job_id: str,
        *,
        status: JobStatus | None = None,
        progress: float | None = None,
        message: str | None = None,
        result: dict[str, Any] | None = None,
        error_code: str | None = None,
    ) -> None:
        """Updates the given columns; the others keep their value (no column is ever cleared)."""
        params = {
            "status": status,
            "progress": progress,
            "message": message,
            "result_json": None if result is None else json.dumps(result),
            "error_code": error_code,
            "updated_at": utc_now(),
            "id": job_id,
        }
        with self._db.connect() as conn:
            conn.execute(_UPDATE_SQL, params)

    def find_active(self, kind: str, key: str) -> JobOut | None:
        for job in self.list_recent(kind=kind):
            if job.status in ACTIVE and job.payload.get("key") == key:
                return job
        return None

    # -- lanes (called holding the lock) ---------------------------------------
    def _admit(self, kind: str, job_id: str) -> None:
        """Take a place in the job's lane, or refuse the job when every place is taken."""
        lane = self._lanes.get(kind)
        if lane is None:
            return
        line = self._lines[lane.name]
        if job_id in line:
            return
        if len(line) >= lane.running + lane.waiting:
            raise BusyError(lane.message, code=lane.code, details={"running": lane.running, "waiting": lane.waiting})
        line.append(job_id)

    def _leave(self, kind: str, job_id: str) -> None:
        lane = self._lanes.get(kind)
        if lane is not None and job_id in self._lines[lane.name]:
            self._lines[lane.name].remove(job_id)
        self._turns.notify_all()

    def _wait_turn(self, kind: str, job_id: str, cancel: threading.Event) -> None:
        """Wait, as ``queued``, until the job is among the first ``running`` of its lane."""
        lane = self._lanes.get(kind)
        if lane is None:
            return
        shown = -1
        with self._turns:
            while True:
                if cancel.is_set():
                    raise JobCanceledError
                ahead = self._lines[lane.name].index(job_id)
                if ahead < lane.running:
                    return
                if ahead != shown:
                    shown = ahead
                    self._write(job_id, message=_waiting(lane, ahead))
                self._turns.wait(_TURN_CHECK_S)

    def occupancy(self, lane: Lane) -> tuple[int, int]:
        """How many of the lane's jobs run (or are about to) and how many wait their turn."""
        with self._lock:
            taken = len(self._lines.get(lane.name, []))
        return min(taken, lane.running), max(0, taken - lane.running)

    def queue_position(self, job_id: str, lane: Lane) -> int | None:
        """A waiting job's place in its lane's queue (1: it starts next), or None when it isn't waiting."""
        with self._lock:
            line = self._lines.get(lane.name, [])
            place = line.index(job_id) - lane.running + 1 if job_id in line else 0
        return place if place >= 1 else None

    # -- running ----------------------------------------------------------------
    def submit(self, kind: str, payload: dict[str, Any], work: JobFn, *, key: str | None = None) -> JobOut:
        with self._lock:
            if key is not None and (existing := self.find_active(kind, key)):
                return existing
            job_id = new_id()
            self._admit(kind, job_id)
            now = utc_now()
            row = (job_id, kind, JobStatus.QUEUED, "Waiting to start…", json.dumps({**payload, "key": key}), now, now)
            try:
                with self._db.connect() as conn:
                    conn.execute("INSERT INTO jobs VALUES (?, ?, ?, 0, ?, ?, NULL, NULL, ?, ?)", row)
            except BaseException:
                self._leave(kind, job_id)
                raise
            cancel = threading.Event()
            self._cancel[job_id] = cancel
        self._start(job_id, kind, work, cancel)
        return self.get(job_id)

    def restart(self, job_id: str, work: JobFn) -> JobOut:
        """Run a stopped job again under the same id (its payload and progress are kept)."""
        with self._lock:
            job = self.get(job_id)
            if job.status not in STOPPED:
                return job
            self._admit(job.kind, job_id)
            self._write(job_id, status=JobStatus.QUEUED, message="Waiting to start…")
            cancel = threading.Event()
            self._cancel[job_id] = cancel
        self._start(job_id, job.kind, work, cancel)
        return self.get(job_id)

    def _start(self, job_id: str, kind: str, work: JobFn, cancel: threading.Event) -> None:
        thread = threading.Thread(target=self._run, args=(job_id, kind, work, cancel), name=f"job-{kind}", daemon=True)
        thread.start()

    def _run(self, job_id: str, kind: str, work: JobFn, cancel: threading.Event) -> None:
        outcome: dict[str, Any] = {"status": JobStatus.FAILED, "message": "The job stopped unexpectedly."}
        try:
            self._wait_turn(kind, job_id, cancel)
            self._write(job_id, status=JobStatus.RUNNING, message="Starting…")
            result = work(JobContext(self, job_id, cancel))
            outcome = {"status": JobStatus.SUCCEEDED, "progress": 1.0, "message": "Done", "result": result or {}}
        # Every failure becomes the job's status (``_outcome`` logs unexpected ones). SystemExit and
        # KeyboardInterrupt are not caught, so shutdown signals are never swallowed.
        except Exception as exc:  # noqa: BLE001
            outcome = self._outcome(job_id, exc, stopping=cancel.is_set())
        finally:
            if outcome["status"] == JobStatus.CANCELED:
                self._cleanup(kind, job_id)
            with self._lock:
                self._write(job_id, **outcome)
                if self._cancel.get(job_id) is cancel:
                    del self._cancel[job_id]
                self._pausing.discard(job_id)
                self._leave(kind, job_id)

    def _outcome(self, job_id: str, exc: Exception, *, stopping: bool) -> dict[str, Any]:
        """How a job that raised ends. One that was asked to stop is paused or canceled whatever it
        raised (stopping can surface as another error, such as a killed tool or an abandoned wait)."""
        if stopping or isinstance(exc, JobCanceledError):
            if job_id in self._pausing:
                return {"status": JobStatus.PAUSED, "message": "Paused"}
            return {"status": JobStatus.CANCELED, "message": "Canceled"}
        if isinstance(exc, AppError):
            return {"status": JobStatus.FAILED, "message": exc.message, "error_code": exc.code}
        log.exception("job failed", extra={"job_id": job_id})
        return {"status": JobStatus.FAILED, "message": "The job failed unexpectedly.", "error_code": "internal_error"}

    def _cleanup(self, kind: str, job_id: str) -> None:
        cleanup = self._on_cancel.get(kind)
        try:
            if cleanup is not None:
                cleanup(job_id)
        # A cleanup that fails must not leave the job looking active; startup housekeeping tidies again.
        except Exception:  # noqa: BLE001
            log.warning("cleanup after a cancel failed", extra={"job_id": job_id})

    def get(self, job_id: str) -> JobOut:
        with self._db.connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            raise NotFoundError("That job does not exist.", code="job_not_found")
        return _row_to_job(row)

    def list_recent(self, *, kind: str | None = None, limit: int = 50) -> list[JobOut]:
        with self._db.connect() as conn:
            if kind:
                rows = conn.execute(
                    "SELECT * FROM jobs WHERE kind = ? ORDER BY created_at DESC LIMIT ?", (kind, limit)
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [_row_to_job(row) for row in rows]

    def list_active(self, kind: str) -> list[JobOut]:
        """Every queued or running job of ``kind``, oldest first (however long ago it was created)."""
        with self._db.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM jobs WHERE kind = ? AND status IN (?, ?) ORDER BY created_at", (kind, *ACTIVE)
            ).fetchall()
        return [_row_to_job(row) for row in rows]

    def _stop(self, job_id: str, *, pause: bool) -> JobOut:
        with self._lock:
            event = self._cancel.get(job_id)
            if event is not None:
                if pause:
                    self._pausing.add(job_id)
                else:
                    self._pausing.discard(job_id)  # a cancel after a pause request wins
                event.set()
                self._turns.notify_all()  # a job waiting its turn stops at once
        return self.get(job_id)

    def cancel(self, job_id: str) -> JobOut:
        return self._stop(job_id, pause=False)

    def pause(self, job_id: str) -> JobOut:
        """Stop a running job at its next check and record it as paused, ready to be restarted."""
        return self._stop(job_id, pause=True)

    def pausing(self, job_id: str) -> bool:
        """Whether a stop requested for this job is a pause (its work is kept) rather than a cancel."""
        return job_id in self._pausing

    def forget(self, job_id: str) -> None:
        """Remove a stopped job from the history (a running job can't be forgotten)."""
        if self.get(job_id).status in (JobStatus.QUEUED, JobStatus.RUNNING):
            raise ConflictError("That job is still running.", code="job_running")
        with self._db.connect() as conn:
            conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))

    def mark(self, job_id: str, status: JobStatus, message: str) -> None:
        """Record a stopped job's status, such as a paused job that is then canceled."""
        self._write(job_id, status=status, message=message)
