# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: What the narration benchmark records about the machine and run, and where it may write.

Scope: The environment a run was measured in (machine, CPU, memory, GPU and driver, package versions, engine
revisions and device, the pinned model checksums, the corpus checksum, the commit, the settings and seeds, and
how busy the CPU was), a refusal to write audio anywhere inside the repository that Git would track (benchmark
audio can be a real person's voice), and the README written beside the results that separates automated
measurements from listening judgements.
Does NOT belong: Rendering or measuring audio (``narration_benchmark.py``).
"""

from __future__ import annotations

import datetime
import hashlib
import platform
import shutil
import subprocess
import sys
from importlib import metadata
from pathlib import Path
from typing import Any

import psutil

ROOT = Path(__file__).resolve().parents[2]
PACKAGES = ("onnxruntime", "kokoro-onnx", "numpy", "soundfile", "espeakng-loader", "phonemizer")


def _run(*args: str) -> str | None:
    binary = shutil.which(args[0])
    if not binary:
        return None
    try:
        return subprocess.run(  # noqa: S603 - fixed arguments to a binary found on PATH
            [binary, *args[1:]], capture_output=True, text=True, timeout=10, check=True
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def check_output(out: Path) -> None:
    """Refuse an output folder inside the repository unless Git ignores it (benchmark audio stays local)."""
    try:
        out.resolve().relative_to(ROOT)
    except ValueError:
        return
    git = shutil.which("git")
    ignored = False
    if git:
        probe = out.resolve() / "probe.wav"
        result = subprocess.run([git, "-C", str(ROOT), "check-ignore", "-q", str(probe)], check=False)  # noqa: S603
        ignored = result.returncode == 0
    if not ignored:
        raise SystemExit(
            f"{out} is inside the repository and Git would track it. Benchmark audio can be a real person's "
            "voice: write it under .tools/ (ignored) or outside the repository."
        )


def _gpu() -> list[dict[str, str]]:
    out = _run("nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits")
    gpus = []
    for line in (out or "").splitlines():
        name, memory, driver = (part.strip() for part in [*line.split(","), "", ""][:3])
        gpus.append({"name": name, "memory_mb": memory, "driver": driver})
    return gpus


def _cpu_name() -> str:
    if sys.platform == "win32":
        out = _run("powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_Processor).Name")
        if out:
            return out.splitlines()[0].strip()
    return platform.processor() or platform.machine()


def _versions() -> dict[str, str | None]:
    found: dict[str, str | None] = {}
    for name in PACKAGES:
        try:
            found[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            found[name] = None
    return found


def environment(services: Any, corpus: Path, args: dict[str, Any], engine_ids: set[str]) -> dict[str, Any]:
    """Everything needed to tell whether two runs can be compared."""
    commit = _run("git", "-C", str(ROOT), "rev-parse", "HEAD")
    dirty = _run("git", "-C", str(ROOT), "status", "--porcelain", "--untracked-files=no")
    memory = psutil.virtual_memory()
    frequency = psutil.cpu_freq()
    engines = {}
    for engine in services.engines.all():
        if engine.id in engine_ids:
            loaded = getattr(getattr(engine, "_worker", None), "loaded", None) or {}  # the worker's own report
            engines[engine.id] = {"revision": engine.revision(), "device": engine.info().device,
                                  "torch": loaded.get("torch")}  # fmt: skip
    models = {
        artifact.id: {file.name: file.sha256 for file in artifact.files}
        for artifact in services.model_store.artifacts.values()
        if artifact.engine in engine_ids
    }
    return {
        "measured_at": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
        "commit": commit,
        "uncommitted_changes": bool(dirty),
        "corpus_sha256": hashlib.sha256(corpus.read_bytes()).hexdigest(),
        "settings": args,
        "machine": {
            "os": f"{platform.system()} {platform.release()} ({platform.version()})",
            "cpu": _cpu_name(),
            "cores_physical": psutil.cpu_count(logical=False),
            "cores_logical": psutil.cpu_count(),
            "cpu_max_mhz": round(frequency.max) if frequency else None,
            "ram_gb": round(memory.total / 1024**3, 1),
            "ram_available_gb_at_start": round(memory.available / 1024**3, 1),
            "cpu_busy_percent_at_start": psutil.cpu_percent(interval=1.0),
            "gpus": _gpu(),
        },
        "python": platform.python_version(),
        "packages": _versions(),
        "engines": engines,
        "model_sha256": models,
    }


README = """# Narration benchmark results

Written by `tests/perf/narration_benchmark.py`. Everything in this folder stays on this computer: it is
git-ignored, never uploaded by CI, and may contain audio of a real person's voice.

## Two kinds of result, never mixed

- **Automated measurements** (`metrics.json`, `metrics.csv`, `summary.md`): speed, memory, loudness,
  pauses, pace, clipping and repeatability. They describe the signal and the machine. They do not say
  whether a voice sounds natural, pronounces words correctly or is pleasant to listen to.
- **Listening judgements** (`panel/`, `longform/`): blind pages for a person to rate. They are only
  results once someone has listened and the answers are scored, for example
  `ltts voice-panel score panel answers.json --pair A,B > listening.md`. Keep each listener's answers
  and note who listened, on what headphones or speakers, and when.

## Reproducing

`metrics.json` has an `environment` block: the commit, the corpus checksum, the exact settings and seed,
the machine, CPU, memory, GPU and driver, package versions, each engine's revision and device, and the
pinned model checksums. Re-run with the same `settings` on the same commit to compare.

- **Cold start**: every engine unloaded and its model files verified again, then the first sentence: what
  the first sentence costs after the app starts (the operating system may still have the files cached).
- **Warm first sentence**: the model loaded, a sentence not in the cache.
- **Median sentence** and **real-time factor**: every sentence of every passage through the app's own
  synthesis path (planner, pronunciations, English reading, pauses), without the audio cache.
- **Cached sentence**: the same sentence asked again, served from the audio cache.
- **Repeatability**: Kokoro adds random noise in its vocoder, so the same sentence differs slightly from
  run to run (inaudibly); cloned voices are seeded from the text. The panel's order comes from `--seed`.
- GPU memory is what the whole card reports, including other programs; CPU load at the start is recorded
  because other programs slow a run down.
"""


def write_readme(out: Path) -> None:
    (out / "README.md").write_text(README, "utf-8")
