# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Build the bundled sound-effect library from recipes, reproducibly, with no recordings.

Scope: One recipe per sound (weather, water, fire, animals, doors, footsteps, household, impacts,
vehicles, atmosphere) synthesised with sfx_synth.py from fixed seeds, levelled so each sound's
loud moments sit near -20 dBFS with peaks under -6 dBFS, blended into seamless loops where they
loop, encoded as mono 48 kHz MP3 into apps/web/public/sfx, and recorded in the server's manifest
(apps/server/src/ltts/sfx/library.json: file, length, size, SHA-256, gain, events, licence) and in
the credits file beside the audio. Run from the repository root with
``node scripts/uv-run.mjs --cwd apps/server run --frozen python ../../scripts/media/sound-library.py``.
Does NOT belong: Synthesis primitives (sfx_synth.py) or playing sounds (the web app).
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sfx_recipes import SOUNDS  # noqa: E402
from sfx_synth import RATE, Signal, linear_fade, seconds  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "apps/web/public/sfx"
MANIFEST = ROOT / "apps/server/src/ltts/sfx/library.json"
LEVEL_DBFS, PEAK_DBFS = -20.0, -6.0
LICENCE = {"name": "MIT", "url": "https://github.com/carsonmcrae/ttsnative/blob/main/LICENSE"}
SOURCE = "Synthesised by scripts/media/sound-library.py in the TTSNative repository"


def level(signal: Signal) -> Signal:
    """Loud moments near LEVEL_DBFS (the 95th percentile of 30 ms frame RMS), peaks under PEAK_DBFS."""
    frame = seconds(0.03)
    frames = signal[: signal.size // frame * frame].reshape(-1, frame)
    loud = float(np.percentile(np.sqrt(np.mean(frames**2, axis=1)), 95))
    out = signal * (10 ** (LEVEL_DBFS / 20) / max(loud, 1e-9))
    peak = float(np.max(np.abs(out)))
    ceiling = 10 ** (PEAK_DBFS / 20)
    return out * (ceiling / peak) if peak > ceiling else out


def build() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = []
    for sound_id, recipe, name, category, description, keywords, events, loop, gain in SOUNDS:
        signal = level(recipe())
        if not loop:
            signal = linear_fade(signal, 0.003, 0.05)
        path = OUTPUT / f"{sound_id}.mp3"
        sf.write(path, signal.astype(np.float32), RATE, format="MP3", subtype="MPEG_LAYER_III",
                 bitrate_mode="VARIABLE", compression_level=0.6)  # fmt: skip
        data = path.read_bytes()
        info = sf.info(path)
        records.append({
            "id": sound_id, "name": name, "category": category, "description": description, "keywords": keywords,
            "file": path.name, "durationSeconds": round(info.frames / info.samplerate, 3), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "gain": gain, "loop": loop, "events": events,
            "licence": LICENCE, "attribution": None, "source": SOURCE,
        })  # fmt: skip
        print(f"{sound_id}: {records[-1]['durationSeconds']} s, {len(data) / 1000:.0f} kB")  # noqa: T201
    MANIFEST.write_bytes((json.dumps({"version": 1, "sounds": records}, indent=2) + "\n").encode("utf-8"))
    (OUTPUT / "CREDITS.md").write_bytes(credits(records).encode("utf-8"))
    print(f"Built {len(records)} sounds into {OUTPUT.relative_to(ROOT)}")  # noqa: T201


def credits(records: list[dict[str, object]]) -> str:
    lines = [
        "# Sound effects: credits and licences",
        "",
        "Every sound here was synthesised from a recipe in the TTSNative repository",
        "(`scripts/media/sound-library.py`), with no recordings and no third-party material, so they are",
        "covered by the project's MIT licence: free to copy, change, share and sell, in this app or",
        "elsewhere, with the licence notice. Anyone can rebuild the files, bit for bit, from the repository.",
        "",
        "| Sound | Category | Length | How it was made |",
        "| --- | --- | --- | --- |",
    ]
    for record in records:
        lines.append(
            f"| {record['name']} (`{record['file']}`) | {record['category']} | {record['durationSeconds']} s | "
            f"{record['description']} |"
        )
    lines += ["", "Each file's size and SHA-256 are recorded in `apps/server/src/ltts/sfx/library.json`.", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    build()
