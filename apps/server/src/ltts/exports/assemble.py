# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Turn an export's saved sentences into audio files, subtitles and chapter timings.

Scope: Streams saved parts (``workspace.py``) into WAV or MP3 tracks via libsndfile with title,
album and track tags (one file, or one per chapter), records each sentence's cue (its position in
its track, before the pause that follows it) for SRT subtitles and read-along books, records
chapter start and end times, and packages several files into a ZIP with an M3U playlist.
Does NOT belong: Synthesis, resuming (``service.py``) or M4B/EPUB containers (``m4b.py``, ``epub.py``).
"""

from __future__ import annotations

import re
import zipfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import soundfile as sf

from ltts.audio import ENCODINGS, PAUSE_SECONDS, Float32Array


@dataclass(frozen=True, slots=True)
class Row:
    """One sentence to export."""

    index: int
    section: int
    text: str
    boundary: str


@dataclass(frozen=True, slots=True)
class Cue:
    index: int  # the sentence's position in the document
    start: float
    end: float
    text: str


@dataclass(frozen=True, slots=True)
class Chapter:
    section: int
    title: str
    start: float
    end: float


# Windows treats these as devices whatever the extension (CON.mp3 is the console), so they get a suffix.
_RESERVED_NAMES = frozenset(
    {"CON", "PRN", "AUX", "NUL", *(f"COM{n}" for n in range(1, 10)), *(f"LPT{n}" for n in range(1, 10))}
)


def safe_filename(title: str, fallback: str = "audio") -> str:
    cleaned = re.sub(r"[^\w\- ]+", "", title, flags=re.UNICODE).strip()
    name = re.sub(r"\s+", " ", cleaned)[:80] or fallback
    return f"{name}_" if name.upper() in _RESERVED_NAMES else name


def srt_time(seconds: float) -> str:
    """``HH:MM:SS,mmm`` as SubRip subtitles write it."""
    millis = round(seconds * 1000)
    hours, rest = divmod(millis, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    return f"{hours:02d}:{minutes:02d}:{rest // 1000:02d},{rest % 1000:03d}"


@dataclass
class Track:
    """One output audio file, its running length and the subtitle cue for each sentence in it."""

    path: Path
    handle: sf.SoundFile
    section: int
    seconds: float = 0.0
    cues: list[Cue] = field(default_factory=list)

    def add(self, samples: Float32Array, rate: int, row: Row) -> None:
        self.handle.write(samples)
        length = len(samples) / rate
        # The cue ends where the sentence does, before the pause that follows it.
        spoken = max(length - PAUSE_SECONDS.get(row.boundary, 0.3), 0.1)
        self.cues.append(Cue(row.index, self.seconds, self.seconds + spoken, " ".join(row.text.split())))
        self.seconds += length

    def write_captions(self) -> Path:
        path = self.path.with_suffix(".srt")
        blocks = [
            f"{n}\n{srt_time(cue.start)} --> {srt_time(cue.end)}\n{cue.text}\n" for n, cue in enumerate(self.cues, 1)
        ]
        path.write_text("\n".join(blocks), encoding="utf-8", newline="\r\n")  # SubRip's usual line ends
        return path


def _naming(chapters: bool, title: str, chapter: str, section: int) -> tuple[str, dict[str, str]]:
    """A track's file name (without extension) and tags: the whole book, or one chapter of it."""
    if not chapters:
        return safe_filename(title), {"title": title, "album": title}
    name = f"{section + 1:02d} - {safe_filename(chapter, 'Chapter')}"
    return name, {"title": chapter or title, "album": title, "tracknumber": str(section + 1)}


def _open(path: Path, rate: int, audio_format: str, tags: dict[str, str], section: int) -> Track:
    fmt, subtype = ENCODINGS[audio_format]
    handle = sf.SoundFile(str(path), "w", rate, 1, subtype, format=fmt)
    # Tags describe the user's document only; set before any audio, as WAV writes them into its header.
    for name, value in tags.items():
        setattr(handle, name, value)
    return Track(path, handle, section)


@dataclass(frozen=True, slots=True)
class Layout:
    """How the parts become files: the book's title, chapter titles, the format and one file per chapter."""

    title: str
    titles: dict[int, str]
    audio_format: str
    per_chapter: bool


@dataclass
class Assembled:
    tracks: list[Track]
    chapters: list[Chapter]
    duration: float


def assemble(
    rows: Sequence[Row],
    audio: Callable[[Row], tuple[Float32Array, int]],
    folder: Path,
    layout: Layout,
    check: Callable[[], None] = lambda: None,
) -> Assembled:
    """Write ``rows`` (their audio from ``audio``) into one track, or one per chapter."""
    title, titles, audio_format, per_chapter = layout.title, layout.titles, layout.audio_format, layout.per_chapter
    tracks: dict[int, Track] = {}
    chapters: dict[int, Chapter] = {}
    elapsed = 0.0
    try:
        for row in rows:
            check()
            samples, rate = audio(row)
            key = row.section if per_chapter else -1
            if key not in tracks:
                name, tags = _naming(per_chapter, title, titles.get(row.section, ""), row.section)
                tracks[key] = _open(folder / f"{name}.{audio_format}", rate, audio_format, tags, row.section)
            tracks[key].add(samples, rate, row)
            length = len(samples) / rate
            current = chapters.get(row.section)
            start = current.start if current else elapsed
            chapters[row.section] = Chapter(row.section, titles.get(row.section, "") or title, start, elapsed + length)
            elapsed += length
    finally:
        for track in tracks.values():
            track.handle.close()
    return Assembled(list(tracks.values()), sorted(chapters.values(), key=lambda c: c.start), elapsed)


def package(folder: Path, base: str, label: str, files: list[Path], *, playlist: bool) -> Path:
    """One file as it is, or several files (audio, subtitles) in a ZIP, with an M3U for chapter files."""
    if len(files) == 1:
        return files[0]
    target = folder / f"{base} ({label}).zip"
    audio = [path for path in files if path.suffix != ".srt"]
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_STORED) as archive:
        for path in files:
            archive.write(path, arcname=path.name)
            path.unlink()
        if playlist:
            archive.writestr(f"{base}.m3u", "#EXTM3U\n" + "".join(f"{p.name}\n" for p in audio))
    return target
