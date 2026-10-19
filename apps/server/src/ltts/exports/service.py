"""Purpose: Build downloadable audiobooks from a document as a cancellable background job.

Scope: Synthesises every segment in the chosen chapter range at export priority (so live playback
stays responsive), streams audio into WAV or MP3 via libsndfile, optionally writes one file per
chapter into a ZIP with an M3U playlist, and reports progress. Because each segment is cached, a
canceled or interrupted export resumes quickly instead of starting over.
Does NOT belong: HTTP (``router.py``) or synthesis internals.
"""

from __future__ import annotations

import logging
import re
import shutil
import zipfile
from pathlib import Path
from typing import Any, Literal

import soundfile as sf

from ltts.audio import read_audio
from ltts.common import ApiModel
from ltts.config import Settings
from ltts.documents.repository import DocumentRepository
from ltts.errors import ConflictError, NotFoundError
from ltts.jobs import JobContext, JobManager, JobOut, JobStatus
from ltts.synthesis.scheduler import PRIORITY_EXPORT
from ltts.synthesis.service import SynthesisService

log = logging.getLogger("ltts.exports")
_SUBTYPES = {"wav": ("WAV", "PCM_16"), "mp3": ("MP3", "MPEG_LAYER_III")}


class ExportRequest(ApiModel):
    document_id: str
    voice_id: str
    pace: float = 1.0
    format: Literal["wav", "mp3"] = "mp3"
    layout: Literal["single", "chapters"] = "single"
    first_section: int | None = None
    last_section: int | None = None


def safe_filename(title: str, fallback: str = "audio") -> str:
    cleaned = re.sub(r"[^\w\- ]+", "", title, flags=re.UNICODE).strip()
    return re.sub(r"\s+", " ", cleaned)[:80] or fallback


class ExportService:
    def __init__(
        self, settings: Settings, jobs: JobManager, documents: DocumentRepository, synthesis: SynthesisService
    ):
        self._settings = settings
        self._jobs = jobs
        self._documents = documents
        self._synthesis = synthesis

    def folder(self, job_id: str) -> Path:
        return self._settings.path("exports", job_id)

    def start(self, request: ExportRequest) -> JobOut:
        detail = self._documents.get(request.document_id)
        self._synthesis.cached_or_none(request.voice_id, ".", "sentence", request.pace)  # validates voice early
        payload = request.model_dump(by_alias=True)
        payload["title"] = detail.title
        return self._jobs.submit("export", payload, lambda ctx: self._run(ctx, request, detail.title))

    def resume(self, job_id: str) -> JobOut:
        job = self._jobs.get(job_id)
        if job.kind != "export" or job.status not in (
            JobStatus.CANCELED,
            JobStatus.INTERRUPTED,
            JobStatus.FAILED,
        ):
            raise ConflictError("Only stopped exports can be resumed.", code="not_resumable")
        return self.start(ExportRequest.model_validate(job.payload))

    def output(self, job_id: str) -> tuple[Path, str]:
        job = self._jobs.get(job_id)
        if job.kind != "export" or job.status != JobStatus.SUCCEEDED or not job.result:
            raise NotFoundError("This export isn't ready.", code="export_not_ready")
        path = self.folder(job_id) / str(job.result["filename"])
        if not path.is_file():
            raise NotFoundError("The exported file was removed.", code="export_missing")
        return path, str(job.result["filename"])

    def delete(self, job_id: str) -> None:
        shutil.rmtree(self._settings.resolved_data_dir / "exports" / job_id, ignore_errors=True)

    def _run(self, ctx: JobContext, req: ExportRequest, title: str) -> dict[str, Any]:
        rows = [
            r for r in self._documents.all_segments(req.document_id)
            if (req.first_section is None or r[1] >= req.first_section)
            and (req.last_section is None or r[1] <= req.last_section)
        ]  # fmt: skip
        if not rows:
            raise ConflictError("There's nothing to export in that range.", code="empty_export")
        detail = self._documents.get(req.document_id)
        titles = {s.index: s.title for s in detail.sections}
        folder = self.folder(ctx.job_id)
        fmt, subtype = _SUBTYPES[req.format]
        base = safe_filename(title)
        writers: dict[int, tuple[sf.SoundFile, Path]] = {}
        duration = 0.0
        try:
            for done, (index, section, text, boundary) in enumerate(rows):
                ctx.check()
                audio = self._synthesis.render_blocking(
                    req.voice_id, text, boundary, req.pace, PRIORITY_EXPORT, lambda: ctx.canceled
                )
                samples, rate = read_audio(audio.path)
                key = section if req.layout == "chapters" else -1
                if key not in writers:
                    name = (
                        f"{section + 1:02d} - {safe_filename(titles.get(section, ''), 'Chapter')}" if key >= 0 else base
                    )
                    path = folder / f"{name}.{req.format}"
                    writers[key] = (sf.SoundFile(str(path), "w", rate, 1, subtype, format=fmt), path)
                writers[key][0].write(samples)
                duration += audio.duration_s
                ctx.update((done + 1) / len(rows), f"Generated {done + 1} of {len(rows)} passages")
                log.debug("export progress", extra={"job_id": ctx.job_id, "segment": index})
        finally:
            for handle, _ in writers.values():
                handle.close()
        return self._finish(folder, base, req, [p for _, p in writers.values()], duration)

    def _finish(
        self, folder: Path, base: str, req: ExportRequest, files: list[Path], duration: float
    ) -> dict[str, Any]:
        if req.layout == "single":
            target = files[0]
        else:
            target = folder / f"{base} ({req.format.upper()} chapters).zip"
            playlist = "#EXTM3U\n" + "".join(f"{p.name}\n" for p in files)
            with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_STORED) as archive:
                for path in files:
                    archive.write(path, arcname=path.name)
                    path.unlink()
                archive.writestr(f"{base}.m3u", playlist)
        return {"filename": target.name, "sizeBytes": target.stat().st_size, "durationS": round(duration, 1)}
