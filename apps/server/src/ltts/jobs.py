# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Background jobs (model installs, exports) with progress, cancellation and recovery.

Scope: Runs each job on its own daemon thread, de-duplicates identical active jobs, throttles
progress writes to SQLite, maps failures to stable error codes, and marks jobs that were running
when the server stopped as ``interrupted`` so the UI can offer a resume. A job can be paused (it
stops at its next check, like a cancel, but is recorded as ``paused``) and a stopped job can be
restarted under the same id, so its progress and history carry on.
Does NOT belong: What a job does — callers pass the work function.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable
from enum import StrEnum
from typing import Any

from ltts.common import ApiModel, new_id, utc_now
from ltts.db import Database
from ltts.errors import AppError, ConflictError, NotFoundError

log = logging.getLogger("ltts.jobs")
_WRITE_INTERVAL_S = 0.5


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
    def __init__(self, db: Database):
        self._db = db
        self._lock = threading.Lock()
        self._cancel: dict[str, threading.Event] = {}
        self._pausing: set[str] = set()

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

    def submit(self, kind: str, payload: dict[str, Any], work: JobFn, *, key: str | None = None) -> JobOut:
        with self._lock:
            if key is not None and (existing := self.find_active(kind, key)):
                return existing
            job_id = new_id()
            now = utc_now()
            with self._db.connect() as conn:
                conn.execute(
                    "INSERT INTO jobs VALUES (?, ?, ?, 0, ?, ?, NULL, NULL, ?, ?)",
                    (
                        job_id,
                        kind,
                        JobStatus.QUEUED,
                        "Waiting to start…",
                        json.dumps({**payload, "key": key}),
                        now,
                        now,
                    ),
                )
            cancel = threading.Event()
            self._cancel[job_id] = cancel
        thread = threading.Thread(target=self._run, args=(job_id, work, cancel), name=f"job-{kind}", daemon=True)
        thread.start()
        return self.get(job_id)

    def restart(self, job_id: str, work: JobFn) -> JobOut:
        """Run a stopped job again under the same id (its payload and progress are kept)."""
        with self._lock:
            job = self.get(job_id)
            if job.status not in STOPPED:
                return job
            self._write(job_id, status=JobStatus.QUEUED, message="Waiting to start…")
            cancel = threading.Event()
            self._cancel[job_id] = cancel
        thread = threading.Thread(target=self._run, args=(job_id, work, cancel), name=f"job-{job.kind}", daemon=True)
        thread.start()
        return self.get(job_id)

    def _run(self, job_id: str, work: JobFn, cancel: threading.Event) -> None:
        context = JobContext(self, job_id, cancel)
        self._write(job_id, status=JobStatus.RUNNING, message="Starting…")
        try:
            result = work(context)
            self._write(job_id, status=JobStatus.SUCCEEDED, progress=1.0, message="Done", result=result or {})
        except JobCanceledError:
            if job_id in self._pausing:
                self._write(job_id, status=JobStatus.PAUSED, message="Paused")
            else:
                self._write(job_id, status=JobStatus.CANCELED, message="Canceled")
        except AppError as exc:
            self._write(job_id, status=JobStatus.FAILED, message=exc.message, error_code=exc.code)
        except Exception:
            log.exception("job failed", extra={"job_id": job_id})
            self._write(
                job_id,
                status=JobStatus.FAILED,
                message="The job failed unexpectedly.",
                error_code="internal_error",
            )
        finally:
            self._cancel.pop(job_id, None)
            self._pausing.discard(job_id)

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

    def cancel(self, job_id: str) -> JobOut:
        event = self._cancel.get(job_id)
        if event is not None:
            event.set()
        return self.get(job_id)

    def pause(self, job_id: str) -> JobOut:
        """Stop a running job at its next check and record it as paused, ready to be restarted."""
        event = self._cancel.get(job_id)
        if event is not None:
            self._pausing.add(job_id)
            event.set()
        return self.get(job_id)

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
