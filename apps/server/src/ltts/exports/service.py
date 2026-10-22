# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Build audiobooks from a document as a background job that survives pauses, crashes and failures.

Scope: Synthesises every sentence in the chosen chapter range at export priority (so live playback
stays responsive), leaving out skipped ones as playback does, and saves each one as it finishes
(``workspace.py``). A stopped export (paused, failed, canceled, or interrupted by a crash) resumes
under the same job, generating only the sentences whose saved audio no longer matches. Exports share
the export queue and need disk space to start, resume and carry on (``capacity.py``). The saved parts
then become WAV or MP3 (one file or one per chapter, optional SRT), an M4B audiobook (``m4b.py``) or a
read-along EPUB (``epub.py``). A pause or failure tidies half-built files and keeps the parts; a cancel
removes everything once the export has stopped; startup tidies what a crash left.
Does NOT belong: HTTP (``router.py``), synthesis internals or the output formats themselves.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any

from ltts.audio import Float32Array
from ltts.common import MB
from ltts.config import Settings
from ltts.documents.details import DocumentDetailsStore
from ltts.documents.repository import DocumentRepository
from ltts.documents.styling import SegmentPlan
from ltts.errors import AppError, ConflictError, NotFoundError
from ltts.exports import capacity
from ltts.exports.assemble import Assembled, Layout, Row, assemble, package, safe_filename
from ltts.exports.audiobookshelf import Audiobookshelf
from ltts.exports.capacity import EXPORT_LANE, KIND, UPLOAD_KIND, UPLOAD_LANE
from ltts.exports.epub import EpubChapter, Sentence, write_epub
from ltts.exports.m4b import Book, write_m4b
from ltts.exports.models import ExportOut, ExportQueueOut, ExportRequest
from ltts.exports.workspace import ExportWorkspace
from ltts.jobs import ACTIVE, STOPPED, JobCanceledError, JobContext, JobManager, JobOut, JobStatus
from ltts.synthesis.cache import CachedAudio
from ltts.synthesis.scheduler import PRIORITY_EXPORT
from ltts.synthesis.service import SynthesisService

log = logging.getLogger("ltts.exports")
_LABELS = {"mp3": "MP3", "wav": "WAV"}


class ExportService:
    def __init__(
        self,
        settings: Settings,
        jobs: JobManager,
        documents: DocumentRepository,
        synthesis: SynthesisService,
        details: DocumentDetailsStore,
    ):
        self._settings = settings
        self._jobs = jobs
        self._documents = documents
        self._synthesis = synthesis
        self._details = details
        jobs.limit(EXPORT_LANE)  # one export synthesises at a time; a few more wait their turn
        jobs.limit(UPLOAD_LANE)
        jobs.when_canceled(KIND, lambda job_id: self._workspace(job_id).remove())

    def folder(self, job_id: str) -> Path:
        """An export's working folder (it exists once the export saved its first sentence)."""
        return self._settings.resolved_data_dir / "exports" / job_id

    def _workspace(self, job_id: str) -> ExportWorkspace:
        return ExportWorkspace(self.folder(job_id))

    def _root(self) -> Path:
        return self._settings.path("exports")

    def _reserve(self) -> int:
        return self._settings.min_free_disk_mb * MB

    def _ensure_room(self, needed: int, job_id: str | None) -> None:
        """Refuse an export the disk can't hold alongside what the exports already queued still need."""
        queued = sum(
            max(0, int(job.payload.get("estimatedBytes") or 0) - self._workspace(job.id).bytes_used())
            for job in self._jobs.list_active(KIND)
            if job.id != job_id
        )
        capacity.ensure_room(self._root(), needed, self._reserve(), queued=queued)

    # -- lifecycle -------------------------------------------------------------
    def start(self, request: ExportRequest) -> JobOut:
        detail = self._documents.get(request.document_id)
        self._synthesis.cached_or_none(request.voice_id, ".", "sentence", request.pace)  # validates voice early
        size = capacity.footprint(self._rows(request), request)
        self._ensure_room(size, None)
        payload = request.model_dump(by_alias=True)
        payload["title"] = detail.title
        payload["estimatedBytes"] = size  # what its folder grows to, counted when later exports start
        return self._jobs.submit(KIND, payload, lambda ctx: self._run(ctx, request, detail.title))

    def _stopped(self, job_id: str) -> JobOut:
        job = self._jobs.get(job_id)
        if job.kind != KIND:
            raise NotFoundError("That export doesn't exist.", code="export_not_found")
        return job

    def resume(self, job_id: str) -> JobOut:
        """Carry on a paused, failed, canceled or interrupted export; saved sentences are reused."""
        job = self._stopped(job_id)
        if job.status not in STOPPED:
            raise ConflictError("Only stopped exports can be resumed.", code="not_resumable")
        request = ExportRequest.model_validate(job.payload)
        title = str(job.payload.get("title") or "audio")
        size = capacity.footprint(self._rows(request), request)
        self._ensure_room(max(0, size - self._workspace(job_id).bytes_used()), job_id)
        return self._jobs.restart(job_id, lambda ctx: self._run(ctx, request, title))

    def pause(self, job_id: str) -> JobOut:
        self._stopped(job_id)
        return self._jobs.pause(job_id)

    def cancel(self, job_id: str) -> JobOut:
        """Stop the export and discard everything it made (a stopped export is canceled at once; a
        running one once it has stopped, so nothing it was writing is left behind)."""
        job = self._stopped(job_id)
        if job.status == JobStatus.SUCCEEDED:
            return job  # nothing to cancel: Delete removes the file
        if job.status in STOPPED:
            self._jobs.mark(job_id, JobStatus.CANCELED, "Canceled")
            self._workspace(job_id).remove()
        else:
            self._jobs.cancel(job_id)  # the folder goes when it stops (``when_canceled``)
        return self._jobs.get(job_id)

    def recent(self) -> list[ExportOut]:
        """Recent exports with what each one has saved, newest first, and every export still active."""
        jobs = self._jobs.list_recent(kind=KIND, limit=20)
        shown = {job.id for job in jobs}
        jobs += [job for job in self._jobs.list_active(KIND) if job.id not in shown]
        return [self._describe(job) for job in jobs]

    def describe(self, job_id: str) -> ExportOut:
        return self._describe(self._stopped(job_id))

    def _describe(self, job: JobOut) -> ExportOut:
        workspace = self._workspace(job.id)
        request = ExportRequest.model_validate(job.payload)
        saved = set(workspace.existing())
        try:
            rows = {row.index for row in self._rows(request)}
            saved &= rows  # a sentence skipped since it was saved no longer counts
        except NotFoundError:
            rows = set()
        return ExportOut(
            job=job,
            title=str(job.payload.get("title") or ""),
            format=request.format,
            sentences=len(rows),
            saved_sentences=len(saved),
            working_bytes=workspace.bytes_used(),
            queue_position=self._jobs.queue_position(job.id, EXPORT_LANE) if job.status == JobStatus.QUEUED else None,
            stale=capacity.is_stale(job),
        )

    def queue(self) -> ExportQueueOut:
        """How many exports run and wait, the free space, and why a new one can't start now."""
        return capacity.queue_status(self._jobs, self._root(), self._reserve())

    def output(self, job_id: str) -> tuple[Path, str]:
        job = self._jobs.get(job_id)
        if job.kind != KIND or job.status != JobStatus.SUCCEEDED or not job.result:
            raise NotFoundError("This export isn't ready.", code="export_not_ready")
        path = self.folder(job_id) / str(job.result["filename"])
        if not path.is_file():
            raise NotFoundError("The exported file was removed.", code="export_missing")
        return path, str(job.result["filename"])

    def send_to_audiobookshelf(self, job_id: str, shelf: Audiobookshelf) -> JobOut:
        """Upload a finished single-file export (and the document's cover) as a background job."""
        path, _ = self.output(job_id)
        shelf.ready()
        if path.suffix.lower() not in (".m4b", ".mp3", ".wav"):
            raise ConflictError(
                "Export one M4B or MP3 file to send it to Audiobookshelf.", code="audiobookshelf_format"
            )
        job = self._jobs.get(job_id)
        request = ExportRequest.model_validate(job.payload)
        title = str(job.payload.get("title") or path.stem)
        author = self._details.get(request.document_id).author
        cover = self._details.cover(request.document_id)

        def work(ctx: JobContext) -> dict[str, Any]:
            ctx.update(0.1, "Sending to Audiobookshelf…", force=True)
            files = [path]
            staging = self._settings.path("tmp", f"cover-{ctx.job_id}")  # the app empties tmp at every start
            try:
                if cover is not None:
                    staged = staging / f"cover{cover.path.suffix}"
                    shutil.copyfile(cover.path, staged)
                    files.append(staged)
                shelf.upload(files, title, author)
            finally:
                shutil.rmtree(staging, ignore_errors=True)
            return {"sent": path.name}

        return self._jobs.submit(UPLOAD_KIND, {"exportId": job_id, "title": title}, work, key=job_id)

    def delete(self, job_id: str) -> None:
        if self._jobs.get(job_id).status in ACTIVE:
            raise ConflictError("Pause or cancel the export before deleting it.", code="export_running")
        self._workspace(job_id).remove()
        self._jobs.forget(job_id)  # gone from the list too

    def clean_orphans(self) -> int:
        """Startup housekeeping (safe while the app runs, too). Removes the folders of exports that are
        gone or canceled, and folders that aren't an export's; tidies stopped exports (half-built and
        temporary files go, saved sentences stay for Resume) and finished ones (leftover parts); and
        logs stopped exports nobody has resumed for weeks, which are kept: they are the user's work."""
        root = self._settings.resolved_data_dir / "exports"
        if not root.is_dir():
            return 0
        removed, stale, stale_bytes = 0, 0, 0
        for folder in root.iterdir():
            if not folder.is_dir():
                continue
            try:
                job: JobOut | None = self._jobs.get(folder.name)
            except NotFoundError:
                job = None
            workspace = ExportWorkspace(folder)
            if job is not None and job.status in ACTIVE:
                continue  # in use
            if job is None or job.kind != KIND or job.status == JobStatus.CANCELED:
                workspace.remove()
                removed += 1
            elif job.status == JobStatus.SUCCEEDED:
                workspace.clear_parts()
            else:
                workspace.clear_unfinished()
                if capacity.is_stale(job):
                    stale, stale_bytes = stale + 1, stale_bytes + workspace.bytes_used()
        if stale:
            log.warning("stopped exports kept for a resume", extra={"exports": stale, "bytes": stale_bytes})
        return removed

    # -- the job ---------------------------------------------------------------
    def _rows(self, req: ExportRequest) -> list[Row]:
        """The sentences to export: those in the chosen sections that aren't skipped."""
        skipped = self._synthesis.skipped(req.document_id)
        return [
            Row(index, section, text, boundary)
            for index, section, text, boundary in self._documents.all_segments(req.document_id)
            if (req.first_section is None or section >= req.first_section)
            and (req.last_section is None or section <= req.last_section)
            and index not in skipped
        ]

    def _run(self, ctx: JobContext, req: ExportRequest, title: str) -> dict[str, Any]:
        workspace = self._workspace(ctx.job_id)
        try:
            return self._export(ctx, req, title, workspace)
        except Exception as exc:
            if not ctx.canceled or self._jobs.pausing(ctx.job_id):
                workspace.clear_unfinished()  # paused or failed: the saved sentences stay for a resume
            if not ctx.canceled and not isinstance(exc, AppError | JobCanceledError):
                self._space_left()  # a write that failed because the disk filled up says so
            raise

    def _space_left(self) -> None:
        capacity.ensure_room(self._root(), 0, self._reserve(), resumable=True)

    def _export(self, ctx: JobContext, req: ExportRequest, title: str, workspace: ExportWorkspace) -> dict[str, Any]:
        rows = self._rows(req)
        if not rows:
            raise ConflictError("There's nothing to export in that range.", code="empty_export")
        # It may have waited a long time for its turn: check the space again before generating.
        needed = max(0, capacity.footprint(rows, req) - workspace.bytes_used())
        capacity.ensure_room(self._root(), needed, self._reserve(), resumable=True)
        keys = self._synthesise(ctx, req, rows, workspace)
        ctx.update(0.97, "Putting the audiobook together…", force=True)
        result = self._build(ctx, req, title, rows, keys, workspace)
        workspace.clear_parts()
        return result

    def _synthesise(
        self, ctx: JobContext, req: ExportRequest, rows: list[Row], workspace: ExportWorkspace
    ) -> dict[int, str]:
        """Make sure every sentence is saved with its current audio; returns each sentence's key."""
        keys: dict[int, str] = {}
        reused = made = 0
        for done, row in enumerate(rows):
            ctx.check()
            plan = self._synthesis.plan_segment(req.document_id, row.index, row.text, req.voice_id)
            key = self._synthesis.key_for(plan, row.text, row.boundary, req.pace)
            keys[row.index] = key
            if workspace.has(row.index, key):
                reused += 1
            else:
                if made and made % capacity.CHECK_EVERY == 0:
                    self._space_left()
                samples, rate = self._synthesis.read(self._render(ctx, req, plan, row))
                workspace.save(row.index, key, samples, rate)
                made += 1
            ctx.update(0.96 * (done + 1) / len(rows), _progress(done + 1, len(rows), reused))
        return keys

    def _render(self, ctx: JobContext, req: ExportRequest, plan: SegmentPlan, row: Row) -> CachedAudio:
        """One sentence's audio; a pause or cancel stops the wait and drops the queued request."""
        try:
            return self._synthesis.render_blocking(
                plan, row.text, row.boundary, req.pace, PRIORITY_EXPORT, lambda: ctx.canceled
            )
        except TimeoutError:
            ctx.check()  # it stopped waiting because the export was paused or canceled
            raise

    def _build(
        self,
        ctx: JobContext,
        req: ExportRequest,
        title: str,
        rows: list[Row],
        keys: dict[int, str],
        workspace: ExportWorkspace,
    ) -> dict[str, Any]:
        folder = self.folder(ctx.job_id)
        workspace.clear_unfinished()  # a previous, unfinished assembly
        base = safe_filename(title)
        titles = {s.index: s.title for s in self._documents.get(req.document_id).sections}

        def audio(row: Row) -> tuple[Float32Array, int]:
            return workspace.read(workspace.part(row.index, keys[row.index]))

        audio_format = {"m4b": "wav", "epub": "mp3"}.get(req.format, req.format)
        per_chapter = req.layout == "chapters" or req.format == "epub"
        built = assemble(rows, audio, folder, Layout(title, titles, audio_format, per_chapter), ctx.check)
        if req.format == "m4b":
            target = self._m4b(ctx, req, title, base, built)
        elif req.format == "epub":
            target = self._epub(req, title, base, rows, built)
        else:
            captions = [track.write_captions() for track in built.tracks] if req.captions else []
            label = f"{_LABELS[req.format]} {'chapters' if per_chapter else 'with subtitles'}"
            files = [track.path for track in built.tracks] + captions
            target = package(folder, base, label, files, playlist=per_chapter)
        return {"filename": target.name, "sizeBytes": target.stat().st_size, "durationS": round(built.duration, 1)}

    def _m4b(self, ctx: JobContext, req: ExportRequest, title: str, base: str, built: Assembled) -> Path:
        details = self._details.get(req.document_id)
        cover = self._details.cover(req.document_id) if req.use_cover else None
        tags = {
            "title": title, "album": title, "artist": details.author or "", "album_artist": details.author or "",
            "composer": details.narrator or "", "genre": "Audiobook", "description": details.description or "",
            "synopsis": details.description or "", "media_type": "2",  # 2 marks the file as an audiobook
        }  # fmt: skip
        wav = built.tracks[0].path
        output = self.folder(ctx.job_id) / f"{base}.m4b"
        timeout = max(600.0, built.duration)  # encoding is far faster than real time
        book = Book(tags, built.chapters, cover.path if cover else None)
        write_m4b(wav, output, book, lambda: ctx.canceled, timeout)
        wav.unlink(missing_ok=True)
        if req.captions:
            captions = built.tracks[0].write_captions()
            return package(self.folder(ctx.job_id), base, "M4B with subtitles", [output, captions], playlist=False)
        return output

    def _epub(self, req: ExportRequest, title: str, base: str, rows: list[Row], built: Assembled) -> Path:
        segments = {s.index: s for s in self._documents.segments_detail(req.document_id)}
        chapters = []
        for track in built.tracks:
            sentences = [
                Sentence(
                    row.index, segments[row.index].paragraph_index, segments[row.index].kind == "heading", row.text
                )
                for row in rows
                if row.section == track.section
            ]
            chapter_title = next((c.title for c in built.chapters if c.section == track.section), title)
            chapters.append(EpubChapter(chapter_title, sentences, track.path, track.cues, track.seconds))
        details = self._details.get(req.document_id)
        cover = self._details.cover(req.document_id) if req.use_cover else None
        output = built.tracks[0].path.parent / f"{base} (read-along).epub"
        write_epub(
            output,
            chapters,
            title=title,
            author=details.author,
            language=self._synthesis.language_of(req.voice_id),
            cover=(cover.path.read_bytes(), cover.media_type) if cover else None,
        )
        for track in built.tracks:
            track.path.unlink(missing_ok=True)
        return output


def _progress(done: int, total: int, reused: int) -> str:
    kept = f" ({reused} kept from before)" if reused else ""
    return f"Generated {done} of {total} sentences{kept}"
