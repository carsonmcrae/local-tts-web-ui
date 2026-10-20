# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Measure real performance numbers for docs/guides/performance.md.

Scope: Server cold start (process spawn to healthy), Kokoro model load, first/next sentence latency,
cached HTTP latency, long-document throughput (real-time factor), process CPU and peak memory,
sandboxed extraction of a 300-page PDF, and — when installed — Chatterbox load time and RTF.
Run: ``node scripts/uv-run.mjs --cwd apps/server run --frozen python ../../tests/perf/benchmark.py``
Does NOT belong: Pass/fail tests; this only reports measurements.
"""

from __future__ import annotations

import os
import platform
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
import psutil

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "server" / "tests"))

from builders import make_pdf  # noqa: E402
from ltts.config import Settings  # noqa: E402
from ltts.container import build_services  # noqa: E402
from ltts.documents.sandbox import extract_isolated  # noqa: E402
from ltts.documents.structures import DocumentType, ExtractionLimits  # noqa: E402
from ltts.engines.base import VoiceSpec  # noqa: E402

SENTENCES = [
    "The lighthouse keeper climbed the spiral stairs and counted every step.",
    "Far below, the waves folded over the rocks with a patient, steady rhythm.",
    "He paused at the window, wiped the glass, and searched the dark horizon.",
    "Somewhere out there, a small boat was trying to find its way home.",
]


def row(label: str, value: str) -> None:
    print(f"| {label} | {value} |")


def cold_start(data_dir: Path) -> None:
    env = {**os.environ, "LTTS_DATA_DIR": str(data_dir), "LTTS_MODELS_DIR": str(ROOT / "data" / "models"),
           "LTTS_ENGINES_DIR": str(ROOT / "data" / "engines")}  # fmt: skip
    started = time.perf_counter()
    proc = subprocess.Popen([sys.executable, "-m", "ltts.cli", "serve", "--port", "8797"], env=env)  # noqa: S603
    try:
        while time.perf_counter() - started < 60:
            try:
                if httpx.get("http://127.0.0.1:8797/api/health", timeout=1).status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.05)
        row("Server cold start (spawn → healthy)", f"{time.perf_counter() - started:.2f} s")
    finally:
        proc.terminate()
        proc.wait(10)


def kokoro(services) -> None:  # type: ignore[no-untyped-def]
    engine = services.engines.get("kokoro")
    process = psutil.Process()
    started = time.perf_counter()
    engine.warm_up()
    row("Kokoro model load", f"{time.perf_counter() - started:.2f} s")
    voice = VoiceSpec("af_heart", language_code="en-us")
    latencies, audio_seconds = [], 0.0
    for sentence in SENTENCES:
        t = time.perf_counter()
        clip = engine.synthesize(sentence, voice, 1.0)
        latencies.append(time.perf_counter() - t)
        audio_seconds += len(clip.samples) / clip.sample_rate
    row("First sentence after load (~70 chars)", f"{latencies[0]:.2f} s")
    row("Median sentence latency (~70 chars)", f"{statistics.median(latencies[1:]):.2f} s")

    long_text = [f"{SENTENCES[i % 4]} Paragraph {i}." for i in range(100)]
    process.cpu_percent()
    rss_peak = process.memory_info().rss
    t, audio = time.perf_counter(), 0.0
    for sentence in long_text:
        clip = engine.synthesize(sentence, voice, 1.0)
        audio += len(clip.samples) / clip.sample_rate
        rss_peak = max(rss_peak, process.memory_info().rss)
    elapsed = time.perf_counter() - t
    cpu = process.cpu_percent() / psutil.cpu_count()
    row("Long document: 100 sentences", f"{audio / 60:.1f} min of audio in {elapsed:.1f} s (RTF {elapsed / audio:.2f})")
    row("CPU during long synthesis (share of all cores)", f"{cpu:.0f} %")
    row("Peak process memory (RSS) during synthesis", f"{rss_peak / 1024**2:.0f} MB")


def cached_http(services, settings) -> None:  # type: ignore[no-untyped-def]
    from fastapi.testclient import TestClient

    from ltts.app import create_app

    with TestClient(create_app(settings, services=services), headers={"X-LTTS-Client": "web"}) as client:
        doc = client.post("/api/documents/text", json={"text": " ".join(SENTENCES)}).json()
        url = f"/api/documents/{doc['id']}/segments/0/audio"
        client.get(url, params={"voice": "kokoro:af_heart"})
        samples = []
        for _ in range(20):
            t = time.perf_counter()
            client.get(url, params={"voice": "kokoro:af_heart"})
            samples.append(time.perf_counter() - t)
        row("Cached sentence over HTTP (median of 20)", f"{statistics.median(samples) * 1000:.0f} ms")


def extraction(tmp: Path) -> None:
    pages = [
        [f"Page {n} line {i} of a long report with enough words to look realistic." for i in range(35)]
        for n in range(300)
    ]
    path = tmp / "long.pdf"
    path.write_bytes(make_pdf(pages, outline=[(f"Chapter {c}", c * 30) for c in range(10)]))
    limits = ExtractionLimits(5_000_000, 2_000, 5_000, 300 * 1024**2, 200)
    t = time.perf_counter()
    result = extract_isolated(path, DocumentType.PDF, "long", limits, timeout_s=120, memory_mb=1536)
    blocks = sum(len(s.blocks) for s in result.sections)
    row(
        "Extract 300-page text PDF (sandboxed)",
        f"{time.perf_counter() - t:.2f} s ({len(result.sections)} chapters, {blocks} paragraphs)",
    )


def chatterbox(services) -> None:  # type: ignore[no-untyped-def]
    engine = services.engines.get("chatterbox")
    if not engine.is_ready():
        row("Chatterbox", "not installed — skipped")
        return
    t = time.perf_counter()
    engine.synthesize("Warming up.", VoiceSpec("default"), 1.0)
    row("Chatterbox load + first clip (GPU)", f"{time.perf_counter() - t:.1f} s")
    t, audio = time.perf_counter(), 0.0
    for sentence in SENTENCES:
        clip = engine.synthesize(sentence, VoiceSpec("default"), 1.0)
        audio += len(clip.samples) / clip.sample_rate
    elapsed = time.perf_counter() - t
    row("Chatterbox 4 sentences", f"{audio:.1f} s of audio in {elapsed:.1f} s (RTF {elapsed / audio:.2f})")
    engine.close()


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="ltts-bench-"))
    settings = Settings(env="test", data_dir=tmp / "data", models_dir=ROOT / "data" / "models",
                        engines_dir=ROOT / "data" / "engines", warm_up_engines=False, extra_allowed_hosts=["testserver"])  # fmt: skip
    cpu = platform.processor() or platform.machine()
    print(f"Measured on {platform.system()} {platform.release()}, {cpu}, {psutil.cpu_count()} logical CPUs, "
          f"{psutil.virtual_memory().total / 1024**3:.0f} GB RAM, Python {platform.python_version()}\n")  # fmt: skip
    print("| Measurement | Result |\n| --- | --- |")
    cold_start(tmp / "cold")
    services = build_services(settings)
    kokoro(services)
    cached_http(services, settings)
    extraction(tmp)
    chatterbox(services)


if __name__ == "__main__":
    main()
