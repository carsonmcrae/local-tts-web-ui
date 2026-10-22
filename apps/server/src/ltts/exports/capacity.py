# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: How much exporting this computer takes on at once, and whether the disk has room for it.

Scope: The export queue (one export synthesises at a time, a few more wait their turn, any more are
refused with ``export_queue_full``) and the Audiobookshelf upload queue, as ``jobs.Lane``s, so the
limits hold whoever asks (this computer's browser, a paired phone or a script). A rough estimate of
the disk space an export's folder grows to (its saved sentences plus the files built from them),
checked before an export starts or resumes and, while it runs, against the space the app always
keeps free. How busy the queue is and why a new export can't start; and when an export that stopped
has been left alone long enough to be worth a reminder.
Does NOT belong: Running exports (``service.py``) or the saved sentences themselves (``workspace.py``).
"""

from __future__ import annotations

import shutil
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal

from ltts.common import MB
from ltts.errors import InsufficientStorageError
from ltts.exports.assemble import Row
from ltts.exports.models import ExportQueueOut, ExportRequest
from ltts.jobs import VOICE_LANE, JobManager, JobOut, JobStatus, Lane

KIND = "export"
UPLOAD_KIND = "audiobookshelf"
# The engine is the bottleneck: a second export would only queue on the same engine and double the
# disk space in use. A short line covers a series of books; more is refused rather than piled up.
MAX_RUNNING = 1
MAX_WAITING = 4
EXPORT_LANE = Lane(
    name="export",
    kinds=frozenset({KIND}),
    running=MAX_RUNNING,
    waiting=MAX_WAITING,
    noun="export",
    code="export_queue_full",
    message=(
        f"The export queue is full: one export runs at a time and {MAX_WAITING} more can wait. Try again "
        "when one finishes, or pause or cancel one on the Exports page."
    ),
)
UPLOAD_LANE = Lane(
    name="audiobookshelf",
    kinds=frozenset({UPLOAD_KIND}),
    running=1,
    waiting=4,
    noun="upload",
    code="upload_queue_full",
    message="Several exports are already being sent to Audiobookshelf. Try again when they're done.",
)

GB = 1024 * MB
CHARS_PER_S = 12.0  # a slow reader's pace, so the estimate errs towards needing more room
PAUSE_S = 0.5  # the pause after each sentence, on average
PART_BYTES_PER_S = 32_000  # a saved sentence: 16-bit FLAC at 24 kHz (raw PCM is 48 kB/s)
# The files built at the end. M4B is first assembled as WAV; EPUB's MP3 tracks are copied into the book.
OUTPUT_BYTES_PER_S = {"wav": 48_000, "mp3": 16_000, "m4b": 64_000, "epub": 32_000}
MIN_ROOM = 200 * MB  # below this much space beyond the reserve, a new export is unlikely to fit
CHECK_EVERY = 25  # sentences between free-space checks while an export runs
STALE_AFTER = timedelta(days=14)
RESUMABLE = {JobStatus.PAUSED, JobStatus.FAILED, JobStatus.INTERRUPTED}


def free_space(folder: Path) -> int:
    return shutil.disk_usage(folder).free


def size_text(size: int) -> str:
    return f"{size / GB:.1f} GB" if size >= GB else f"{max(size // MB, 1):,} MB"


def footprint(rows: Sequence[Row], request: ExportRequest) -> int:
    """Roughly the most an export's folder holds: every saved sentence and the files built from them."""
    seconds = sum(len(row.text) for row in rows) / (CHARS_PER_S * request.pace) + PAUSE_S * len(rows)
    output = seconds * OUTPUT_BYTES_PER_S[request.format]
    zipped = request.captions or (request.layout == "chapters" and request.format in ("mp3", "wav"))
    if zipped and request.format != "epub":
        output *= 2  # the files and, for a moment, the ZIP they go into
    return int(seconds * PART_BYTES_PER_S + output)


def ensure_room(folder: Path, needed: int, reserve: int, *, queued: int = 0, resumable: bool = False) -> None:
    """Refuse to go on when ``needed`` more bytes (and ``queued`` for the exports already waiting)
    would leave less than ``reserve`` free. ``resumable``: the export is running and stops instead."""
    free = free_space(folder)
    if free - needed - queued >= reserve:
        return
    if resumable:
        message = (
            "The disk is nearly full, so the export stopped. Free up some space, then press Resume: it "
            "carries on from the sentences already saved."
        )
    else:
        others = f" (and the exports already queued about {size_text(queued)})" if queued else ""
        message = (
            f"Not enough free disk space for this export: it needs about {size_text(needed)}{others} and "
            f"{size_text(free)} is free, and TTSNative keeps {size_text(reserve)} free for the system. Free "
            "up space, or export fewer chapters or as MP3, then try again."
        )
    details = {"freeBytes": free, "neededBytes": needed + queued, "reserveBytes": reserve}
    raise InsufficientStorageError(message, details=details)


def queue_status(jobs: JobManager, folder: Path, reserve: int) -> ExportQueueOut:
    """How many exports run and wait, the free space, and why a new one can't start now."""
    running, waiting = jobs.occupancy(EXPORT_LANE)
    free = free_space(folder)
    blocked: Literal["queue_full", "low_disk"] | None = None
    if running + waiting >= MAX_RUNNING + MAX_WAITING:
        blocked = "queue_full"
    elif free - reserve < MIN_ROOM:
        blocked = "low_disk"
    return ExportQueueOut(
        running=running,
        waiting=waiting,
        max_running=MAX_RUNNING,
        max_waiting=MAX_WAITING,
        free_bytes=free,
        reserve_bytes=reserve,
        voice_job_running=jobs.occupancy(VOICE_LANE)[0] > 0,  # it shares the cloning engine
        blocked=blocked,
    )


def is_stale(job: JobOut, now: datetime | None = None) -> bool:
    """A stopped export nobody has touched for ``STALE_AFTER``: kept, but worth a reminder of its space."""
    if job.status not in RESUMABLE:
        return False
    updated = datetime.fromisoformat(job.updated_at)
    return (now or datetime.now(UTC)) - updated >= STALE_AFTER
