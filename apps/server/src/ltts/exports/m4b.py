# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Write an M4B audiobook (AAC in MP4, with chapters, tags and a cover) using ffmpeg.

Scope: Finds an ffmpeg the user installed (``LTTS_FFMPEG`` or the PATH; TTSNative never bundles or
downloads one), writes the chapters and tags into an FFMETADATA file with every special character
escaped, and runs ffmpeg with a fixed argument list (no shell, only paths inside the export's own
folder). The cover image is copied into the file without being decoded. The run can be canceled,
and fails with a clear message when ffmpeg is missing or reports an error.
Does NOT belong: Synthesis or the other formats (``assemble.py``, ``epub.py``).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from ltts.errors import AppError
from ltts.exports.assemble import Chapter

BACKSLASH = chr(92)
NEWLINE = chr(10)
_SPECIAL = ("=", ";", "#", NEWLINE)
BITRATE = "64k"  # speech in mono: clear, and about 30 MB per hour
SAMPLE_RATE = "44100"  # the rate every audiobook player supports


class FfmpegMissingError(AppError):
    status_code = 409
    code = "ffmpeg_missing"


class FfmpegFailedError(AppError):
    status_code = 500
    code = "ffmpeg_failed"


def find_ffmpeg() -> Path | None:
    """The user's ffmpeg: ``LTTS_FFMPEG`` when set, otherwise the first one on the PATH."""
    configured = os.environ.get("LTTS_FFMPEG")
    found = configured or shutil.which("ffmpeg")
    if not found:
        return None
    path = Path(found)
    return path if path.is_file() and path.stem.lower() == "ffmpeg" else None


def escape(value: str) -> str:
    """An FFMETADATA value with ``=``, ``;``, ``#``, backslashes and line breaks escaped."""
    escaped = value.replace(BACKSLASH, BACKSLASH * 2)
    for char in _SPECIAL:
        escaped = escaped.replace(char, BACKSLASH + char)
    return escaped


def metadata(tags: dict[str, str], chapters: Sequence[Chapter]) -> str:
    lines = [";FFMETADATA1"]
    lines += [f"{name}={escape(value)}" for name, value in tags.items() if value]
    for chapter in chapters:
        lines += [
            "[CHAPTER]",
            "TIMEBASE=1/1000",
            f"START={round(chapter.start * 1000)}",
            f"END={max(round(chapter.end * 1000), round(chapter.start * 1000) + 1)}",
            f"title={escape(chapter.title)}",
        ]
    return NEWLINE.join(lines) + NEWLINE


def command(ffmpeg: Path, audio: Path, meta: Path, cover: Path | None, output: Path) -> list[str]:
    args = [str(ffmpeg), "-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-i", str(audio), "-i", str(meta)]
    if cover is not None:
        args += ["-i", str(cover)]
    args += ["-map", "0:a", "-map_metadata", "1", "-map_chapters", "1"]
    if cover is not None:
        args += ["-map", "2:v", "-c:v", "copy", "-disposition:v:0", "attached_pic"]
    args += ["-c:a", "aac", "-b:a", BITRATE, "-ac", "1", "-ar", SAMPLE_RATE, "-movflags", "+faststart"]
    return [*args, "-f", "ipod", str(output)]


@dataclass(frozen=True, slots=True)
class Book:
    """What goes into the M4B besides the audio."""

    tags: dict[str, str]
    chapters: Sequence[Chapter]
    cover: Path | None = None


def write_m4b(audio: Path, output: Path, book: Book, canceled: Callable[[], bool], timeout_s: float) -> Path:
    """Encode ``audio`` (WAV) into ``output`` (.m4b) with the book's chapters, tags and cover."""
    tags, chapters, cover = book.tags, book.chapters, book.cover
    ffmpeg = find_ffmpeg()
    if ffmpeg is None:
        raise FfmpegMissingError(
            "M4B export needs ffmpeg, which isn't installed. Install it (for example with "
            "`winget install Gyan.FFmpeg`), restart TTSNative and try again, or export MP3 instead."
        )
    meta = output.with_suffix(".ffmeta")
    meta.write_text(metadata(tags, chapters), encoding="utf-8")
    partial = output.with_name(f"{output.stem}.partial.m4b")
    process = subprocess.Popen(  # noqa: S603 - fixed arguments; every path is inside the export folder
        command(ffmpeg, audio, meta, cover, partial),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    started = time.monotonic()
    try:
        while process.poll() is None:
            if canceled() or time.monotonic() - started > timeout_s:
                process.kill()
                process.wait()
                raise FfmpegFailedError("Making the M4B file was stopped.")
            time.sleep(0.2)
        error = (process.stderr.read() if process.stderr else b"").decode("utf-8", "replace").strip()
        if process.returncode != 0 or not partial.is_file():
            raise FfmpegFailedError(f"ffmpeg couldn't make the M4B file: {error[-300:] or 'unknown error'}")
    finally:
        if process.stderr:
            process.stderr.close()
        meta.unlink(missing_ok=True)
    partial.replace(output)
    return output
