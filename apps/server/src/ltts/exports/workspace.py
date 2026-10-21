# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The durable working folder of one export, so a long export survives a crash or a pause.

Scope: Each finished sentence is saved as its own small FLAC part, named by its position and the
cache key of its audio (``000123-<key>.flac``), written to a temporary name and renamed into place,
so a part is either complete or absent. On resume a part is reused only when the sentence would
still produce exactly that audio (same text, voice, styling, pace and engine), so nothing stale is
ever exported. Also reports how much is done, reads parts back for assembly and removes parts once
the final file exists.
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
        return sum(path.stat().st_size for path in self.folder.rglob("*") if path.is_file())

    def clear_parts(self) -> None:
        shutil.rmtree(self.parts_dir, ignore_errors=True)
        for leftover in self.folder.glob(".*.tmp"):
            leftover.unlink(missing_ok=True)

    def remove(self) -> None:
        shutil.rmtree(self.folder, ignore_errors=True)
