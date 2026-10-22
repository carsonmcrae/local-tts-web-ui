# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: What an export is asked for, and how its progress is reported.

Scope: The export request (format, layout, chapter range, subtitles and audiobook details), the
status of one export, including how many sentences are already saved so a paused, failed or
interrupted export can show what a resume will reuse, a waiting export's place in the queue and
whether a stopped one has been left alone for a long time, and how busy the export queue is.
Does NOT belong: Running exports (``service.py``) or writing files (``assemble.py``, ``m4b.py``, ``epub.py``).
"""

from __future__ import annotations

from typing import Literal

from ltts.common import ApiModel
from ltts.jobs import JobOut

ExportFormat = Literal["wav", "mp3", "m4b", "epub"]


class ExportRequest(ApiModel):
    document_id: str
    voice_id: str
    pace: float = 1.0
    format: ExportFormat = "mp3"
    layout: Literal["single", "chapters"] = "single"  # M4B and EPUB are always one file with chapters
    first_section: int | None = None
    last_section: int | None = None
    captions: bool = False  # sentence-timed SRT subtitles next to each audio file
    use_cover: bool = True  # the document's cover, when it has one (M4B and EPUB)


class ExportOut(ApiModel):
    """An export job with what its working folder already holds."""

    job: JobOut
    title: str
    format: ExportFormat
    sentences: int
    saved_sentences: int  # finished sentences kept for a resume
    working_bytes: int
    queue_position: int | None = None  # a waiting export's place in the queue (1: it starts next)
    stale: bool = False  # stopped and untouched for weeks: kept, but its saved sentences still use space


class ExportQueueOut(ApiModel):
    """How busy exporting is, and why a new export (or a resume) can't start now."""

    running: int
    waiting: int
    max_running: int
    max_waiting: int
    free_bytes: int
    reserve_bytes: int  # the space the app always keeps free
    voice_job_running: bool  # a studio voice is being built or fine-tuned on the same engine
    blocked: Literal["queue_full", "low_disk"] | None
