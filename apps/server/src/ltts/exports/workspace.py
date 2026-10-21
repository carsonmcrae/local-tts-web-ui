# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The durable working folder of one export, so a long export survives a crash or a pause.

Scope: Each finished sentence is saved as its own small FLAC part, named by its position and the
cache key of its audio (``000123-<key>.flac``), written to a temporary name and renamed into place,
so a part is either complete or absent. On resume a part is reused only when the sentence would
still produce exactly that audio (same text, voice, styling, pace and engine), so nothing stale is
ever exported. Also reports how much is done and how much space it uses, reads parts back for
assembly, removes parts once the final file exists, and tidies what a stop leaves behind: half-built
files and temporary files go, saved sentences stay for a resume.
Does NOT belong: Synthesis, assembling the output formats (``assemble.py``) or the job itself.
"""

from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

from ltts.audio import Float32Array, read_audio
from ltts.common import new_id

_PART = re.compile("^([0-9]{6})-([0-9a-f]{16})[.]flac$")
KEY_CHARS = 16  # enough of the SHA-256 cache key to tell versions of a sentence apart
# Left by a stop part-way through writing: a part being saved, an M4B being encoded, its chapter list.
TEMPORARY = (".*.tmp", "*.partial.*", "*.ffmeta")


@dataclass(frozen=True, slots=True)
class Part:
    index: int
    path: Path
    seconds: float


class ExportWorkspace:
    def __init__(self, folder: Path):
        self.folder = folder
        self.parts_dir = folder / "parts"

    def _name(self, index: int, key: str) -> str:
        return f"{index:06d}-{key[:KEY_CHARS]}.flac"

    def existing(self) -> dict[int, str]:
        """The parts already saved: position -> the start of the audio key it was made with."""
        if not self.parts_dir.is_dir():
            return {}
        found: dict[int, str] = {}
        for path in self.parts_dir.iterdir():
            match = _PART.match(path.name)
            if match:
                found[int(match.group(1))] = match.group(2)
        return found

    def has(self, index: int, key: str) -> bool:
        return (self.parts_dir / self._name(index, key)).is_file()

    def save(self, index: int, key: str, samples: Float32Array, rate: int) -> None:
        """Save one sentence's audio; any older version of the same sentence is replaced."""
        self.parts_dir.mkdir(parents=True, exist_ok=True)
        for old in self.parts_dir.glob(f"{index:06d}-*.flac"):
            old.unlink(missing_ok=True)
        target = self.parts_dir / self._name(index, key)
        temporary = self.parts_dir / f".{new_id()}.tmp"
        sf.write(str(temporary), np.clip(samples, -1.0, 1.0), rate, format="FLAC", subtype="PCM_16")
        temporary.replace(target)

    def part(self, index: int, key: str) -> Part:
        path = self.parts_dir / self._name(index, key)
        info = sf.info(str(path))
        return Part(index, path, info.frames / info.samplerate)

    def read(self, part: Part) -> tuple[Float32Array, int]:
        return read_audio(part.path)

    def bytes_used(self) -> int:
        if not self.folder.is_dir():
            return 0
        total = 0
        for path in self.folder.rglob("*"):
            try:
                total += path.stat().st_size if path.is_file() else 0
            except FileNotFoundError:  # a running export renamed or removed it meanwhile
                continue
        return total

    def clear_temporary(self) -> None:
        """Remove temporary files, here and among the parts (an unfinished save or encoding)."""
        for folder in (self.folder, self.parts_dir):
            if folder.is_dir():
                for pattern in TEMPORARY:
                    for leftover in folder.glob(pattern):
                        leftover.unlink(missing_ok=True)

    def clear_unfinished(self) -> None:
        """Remove everything a stopped export can't reuse: half-built output files and temporary
        files. Its saved sentences stay, so a resume only builds the files again."""
        self.clear_temporary()
        if self.folder.is_dir():
            for path in self.folder.iterdir():
                if path.is_file():
                    path.unlink(missing_ok=True)

    def clear_parts(self) -> None:
        shutil.rmtree(self.parts_dir, ignore_errors=True)
        self.clear_temporary()

    def remove(self) -> None:
        shutil.rmtree(self.folder, ignore_errors=True)
