# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Read held-out narration passages with several voices through the real synthesis path, measure each
reading, and build a blind listening pack.

Scope: Each passage in ``narration_corpus.json`` becomes a pasted document and is read sentence by sentence by the
synthesis service (planner, pronunciations, English reading rules, pauses). Per voice: cold start, warm first
sentence, median and cached sentence, real-time factor, memory, GPU memory, loudness, pauses, pace, clipping and
repeatability; the run's environment (``bench_support``); a blind panel, a long-form folder and a README.
Does NOT belong: Pass/fail tests, or judging quality: listening does that (docs/research/voice-library.md).

Run: ``node scripts/uv-run.mjs --cwd apps/server run --frozen python ../../tests/perf/narration_benchmark.py
--out .tools/bench --voice kokoro:af_heart --voice chatterbox:default [--local NAME=PROFILE_DIR] [--seed N]``.
The output folder must be outside the repository or ignored by Git: benchmark audio can be a real person's voice.
"""

from __future__ import annotations

import argparse
import csv
import gc
import json
import os
import random
import shutil
import statistics
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import psutil
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "server" / "src"))

from bench_support import check_output, environment, write_readme  # noqa: E402
from ltts.config import Settings  # noqa: E402
from ltts.container import Services, build_services  # noqa: E402
from ltts.engines.base import VoiceInfo, VoiceSpec  # noqa: E402
from ltts.engines.cloned_speech import count_syllables  # noqa: E402
from ltts.synthesis.scheduler import PRIORITY_PLAYBACK  # noqa: E402
from ltts.voices import listening_panel  # noqa: E402
from ltts.voices.quality import measure  # noqa: E402

CLIP_FIELDS = ("voice", "item", "sentences", "duration_s", "speech_s", "wall_s", "rtf", "first_sentence_s",
               "syllables_per_s", "rms_dbfs", "peak_dbfs", "pause_ratio", "clipping_ratio")  # fmt: skip
PROBES = ("The kettle had gone cold by the time she remembered it.",
          "Outside, the first snow was settling on the garden wall.")  # fmt: skip


@dataclass
class VoiceResult:
    voice: str
    engine: str
    device: str | None = None
    cold_start_s: float | None = None  # engines unloaded, files verified, first sentence
    warm_first_s: float | None = None  # model loaded, a sentence not in the cache
    median_sentence_s: float | None = None
    cached_sentence_s: float | None = None
    audio_s: float = 0.0
    wall_s: float = 0.0
    rtf: float | None = None
    rss_before_mb: int = 0  # this process and its workers, before the model loads
    rss_loaded_mb: int = 0
    peak_rss_mb: int = 0
    gpu_before_mb: int | None = None  # the whole card, other programs included
    gpu_loaded_mb: int | None = None
    peak_gpu_mb: int | None = None
    repeat_same_length: bool | None = None  # the same text twice: the same number of samples?
    repeat_max_diff: float | None = None  # and the largest sample difference (1.0 is full scale)
    errors: int = 0


def gpu_used_mb() -> int | None:
    smi = shutil.which("nvidia-smi")
    if not smi:
        return None
    import subprocess

    try:
        out = subprocess.run(  # noqa: S603 - fixed arguments to the binary found on PATH
            [smi, "--query-gpu=memory.used", "--format=csv,noheader,nounits"], capture_output=True, text=True,
            timeout=5, check=True).stdout  # fmt: skip
        return int(out.strip().splitlines()[0])
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return None


def rss_mb() -> int:
    process = psutil.Process()
    total = process.memory_info().rss
    for child in process.children(recursive=True):
        try:
            total += child.memory_info().rss
        except psutil.Error:
            pass
    return int(total / 1024**2)


def local_profile(name: str, folder: Path) -> VoiceSpec:
    """A studio voice straight from its profile folder (no database): built voice, reference and styles."""
    conditioning = next(iter(sorted(folder.glob("voice-*.safetensors"))), None)
    styles = tuple((p.stem, p) for p in sorted((folder / "styles").glob("*.safetensors")))
    return VoiceSpec(key=name, reference_path=folder / "reference.wav", conditioning_path=conditioning, styles=styles)


def attach_local(services: Services, specs: dict[str, VoiceSpec]) -> None:
    def resolve(key: str) -> tuple[str, VoiceSpec, str]:
        return "chatterbox", specs[key], f"local-{key}"

    def lister() -> list[VoiceInfo]:
        return [VoiceInfo(id=f"local:{k}", engine_id="chatterbox", name=k, language="English", language_code="en",
                          gender="unspecified", category="custom") for k in specs]  # fmt: skip

    services.engines.attach_voices("local", resolve, lister)


def ingest(services: Services, items: list[dict[str, Any]]) -> dict[str, list[tuple[int, str, str]]]:
    """Each passage as a document: ``item id -> [(index, text, boundary)]``."""
    documents = {}
    for item in items:
        detail = services.document_service.ingest_text(item["text"], item["kind"])
        documents[item["id"]] = [(i, text, boundary) for i, _, text, boundary in
                                 services.document_repo.all_segments(detail.id)]  # fmt: skip
        item["document_id"] = detail.id
    return documents


def render_item(services: Services, voice: str, item: dict[str, Any], segments: list[tuple[int, str, str]],
                pace: float) -> tuple[np.ndarray, int, list[float]]:  # fmt: skip
    """One passage read by one voice, sentence by sentence as the player and exports do; per-sentence seconds."""
    parts, rate, latencies = [], 24_000, []
    for index, text, boundary in segments:
        plan = services.synthesis.plan_segment(item["document_id"], index, text, voice)
        started = time.perf_counter()
        audio = services.synthesis.render_blocking(plan, text, boundary, pace, PRIORITY_PLAYBACK, lambda: False)
        latencies.append(time.perf_counter() - started)
        samples, rate = services.synthesis.read(audio)
        parts.append(samples)
    return np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32), rate, latencies


def clip_row(voice: str, item: dict[str, Any], samples: np.ndarray, rate: int, latencies: list[float]) -> dict:
    values = measure(samples, rate)
    speech = values["speech_s"] or 0.0
    wall = sum(latencies)
    return {
        "voice": voice, "item": item["id"], "sentences": len(latencies),
        "duration_s": values["duration_s"], "speech_s": values["speech_s"], "wall_s": round(wall, 2),
        "rtf": round(wall / values["duration_s"], 3) if values["duration_s"] else None,
        "first_sentence_s": round(latencies[0], 3) if latencies else None,
        "syllables_per_s": round(count_syllables(item["text"]) / speech, 2) if speech else None,
        "rms_dbfs": values["rms_dbfs"], "peak_dbfs": values["peak_dbfs"],
        "pause_ratio": values["pause_ratio"], "clipping_ratio": values["clipping_ratio"],
    }  # fmt: skip


def measure_start(services: Services, voice: str) -> VoiceResult:
    """Cold start (every engine unloaded and its files verified again, as after the app starts), then warm."""
    resolved = services.engines.resolve(voice)
    for engine in services.engines.all():
        engine.close()
    services.model_store._hashes.clear()  # noqa: SLF001 - a new app process hashes every model file again
    gc.collect()
    result = VoiceResult(voice, resolved.engine.id, rss_before_mb=rss_mb(), gpu_before_mb=gpu_used_mb())
    started = time.perf_counter()
    resolved.engine.synthesize(PROBES[0], resolved.spec, 1.0)  # the engine itself: the audio cache can't help
    result.cold_start_s = round(time.perf_counter() - started, 3)
    started = time.perf_counter()
    resolved.engine.synthesize(PROBES[1], resolved.spec, 1.0)
    result.warm_first_s = round(time.perf_counter() - started, 3)
    result.device = resolved.engine.info().device
    result.rss_loaded_mb = result.peak_rss_mb = rss_mb()
    result.gpu_loaded_mb = result.peak_gpu_mb = gpu_used_mb()
    return result


def run_voice(services: Services, voice: str, items: list[dict[str, Any]], documents: dict, args: argparse.Namespace,
              clips_dir: Path) -> tuple[VoiceResult, list[dict]]:  # fmt: skip
    services.synthesis.purge_voice(voice)  # every sentence is synthesised, even when run again in this folder
    result, rows, all_latencies = measure_start(services, voice), [], []
    folder = clips_dir / voice.replace(":", "-")
    folder.mkdir(parents=True, exist_ok=True)
    for item in items:
        try:
            samples, rate, latencies = render_item(services, voice, item, documents[item["id"]], args.pace)
        except Exception as exc:  # noqa: BLE001 - one failed passage must not end the whole run
            print(f"  {voice} / {item['id']}: failed ({type(exc).__name__}: {exc})", file=sys.stderr)
            result.errors += 1
            continue
        sf.write(folder / f"{item['id']}.wav", samples, rate, subtype="PCM_16")
        rows.append(clip_row(voice, item, samples, rate, latencies))
        all_latencies += latencies
        result.audio_s += len(samples) / rate
        result.wall_s += sum(latencies)
        result.peak_rss_mb = max(result.peak_rss_mb, rss_mb())
        if (gpu := gpu_used_mb()) is not None:
            result.peak_gpu_mb = max(result.peak_gpu_mb or 0, gpu)
        print(f"  {voice} / {item['id']}: {rows[-1]['duration_s']} s of audio in {rows[-1]['wall_s']} s")
    if all_latencies:
        result.median_sentence_s = round(statistics.median(all_latencies), 3)
        result.audio_s = round(result.audio_s, 1)
        result.rtf = round(result.wall_s / result.audio_s, 3) if result.audio_s else None
        result.wall_s = round(result.wall_s, 1)
        first = items[0]
        index, text, boundary = documents[first["id"]][0]
        plan = services.synthesis.plan_segment(first["document_id"], index, text, voice)
        started = time.perf_counter()
        services.synthesis.render_blocking(plan, text, boundary, args.pace, PRIORITY_PLAYBACK, lambda: False)
        result.cached_sentence_s = round(time.perf_counter() - started, 4)
    if args.repeat_check:
        result.repeat_same_length, result.repeat_max_diff = repeat_check(services, voice, items, documents, args.pace)
    return result, rows


def repeat_check(services: Services, voice: str, items: list[dict], documents: dict, pace: float) -> tuple:
    """Read the questions passage again with an empty cache: does the same text give the same audio?"""
    item = next((i for i in items if i["id"] == "questions"), items[0])
    first, _, _ = render_item(services, voice, item, documents[item["id"]], pace)
    services.synthesis.purge_voice(voice)
    second, _, _ = render_item(services, voice, item, documents[item["id"]], pace)
    if first.shape != second.shape or not first.size:
        return False, None
    return True, round(float(np.max(np.abs(first - second))), 4)


def write_pack(out: Path, items: list[dict], voices: list[str], panel_voices: list[str], seed: int) -> None:
    """The rated blind panel of the shorter passages, and anonymised long-form clips for fatigue listening."""
    clips_dir = out / "clips"
    panel_items = [listening_panel.Item(i["kind"], i["text"]) for i in items if i.get("panel")]
    clips = {v: [clips_dir / v.replace(":", "-") / f"{i['id']}.wav" for i in items if i.get("panel")]
             for v in panel_voices}  # fmt: skip
    usable = {v: paths for v, paths in clips.items() if all(p.is_file() for p in paths)}
    if len(usable) >= 2 and panel_items:
        shutil.rmtree(out / "panel", ignore_errors=True)
        listening_panel.make(out / "panel", panel_items, usable, seed)
    if not any(i["id"] == "longform" for i in items):
        return
    folder = out / "longform"
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True)
    order = [v for v in voices if (clips_dir / v.replace(":", "-") / "longform.wav").is_file()]
    random.Random(seed).shuffle(order)  # noqa: S311 - only hides which voice is which, for listening
    key = {}
    rows = []
    for number, voice in enumerate(order, start=1):
        shutil.copyfile(clips_dir / voice.replace(":", "-") / "longform.wav", folder / f"voice-{number}.wav")
        key[str(number)] = voice
        rows.append(f'<section><h2>Voice {number}</h2><audio controls preload="none" src="voice-{number}.wav"></audio>'
                    f"<p>Notes:</p><textarea name=\"v{number}\" rows=\"3\" style=\"width:100%\"></textarea></section>")  # fmt: skip
    (folder / "key.json").write_text(json.dumps(key, indent=2), "utf-8")
    (folder / "listen.html").write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" '
        'content="width=device-width, initial-scale=1"><title>Long-form listening</title><style>'
        "body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem}"
        "section{border-top:1px solid #ccc;padding:1rem 0}audio{width:100%}</style></head><body>"
        "<h1>Long-form listening</h1><p>Each voice reads the same chapter (about six minutes). Listen to as much "
        "as you can of each, in any order, and note where your attention drifted, any mispronounced or garbled "
        "words, and whether you could listen to a whole book like this. The voices are numbered in a random "
        "order; key.json says which is which, so don't open it until you've finished.</p>"
        + "".join(rows) + "</body></html>", "utf-8")  # fmt: skip


def _mb(value: int | None) -> str:
    return "—" if value is None else f"{value:,} MB"


def summary_table(results: list[VoiceResult]) -> str:
    head = ("| Voice | Device | Cold start | Warm first | Median sentence | Cached | Audio | RTF | Memory before / "
            "loaded / peak | GPU card before / loaded / peak | Same length twice | Max repeat diff | Failed |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    lines = [head]
    for r in results:
        lines.append(f"| {r.voice} | {r.device or '—'} | {r.cold_start_s} s | {r.warm_first_s} s | "
                     f"{r.median_sentence_s} s | {r.cached_sentence_s} s | {r.audio_s / 60:.1f} min | {r.rtf} | "
                     f"{_mb(r.rss_before_mb)} / {_mb(r.rss_loaded_mb)} / {_mb(r.peak_rss_mb)} | "
                     f"{_mb(r.gpu_before_mb)} / {_mb(r.gpu_loaded_mb)} / {_mb(r.peak_gpu_mb)} | "
                     f"{r.repeat_same_length} | {r.repeat_max_diff} | {r.errors} |")  # fmt: skip
    return "\n".join(lines)


def summary(results: list[VoiceResult], env: dict[str, Any]) -> str:
    machine = env["machine"]
    gpus = ", ".join(f"{g['name']} ({g['memory_mb']} MB, driver {g['driver']})" for g in machine["gpus"]) or "none"
    return (
        "# Automated measurements\n\nSpeed, memory and signal statistics only. They don't measure how natural a voice"
        " sounds: the blind pages in `panel/` and `longform/` are for that (see README.md).\n\n"
        f"- Measured {env['measured_at']} on commit {env['commit']}"
        f"{' (with uncommitted changes)' if env['uncommitted_changes'] else ''}; corpus {env['corpus_sha256'][:12]}.\n"
        f"- {machine['os']}; {machine['cpu']}, {machine['cores_physical']} cores / {machine['cores_logical']} threads;"
        f" {machine['ram_gb']} GB RAM; GPU {gpus}; CPU {machine['cpu_busy_percent_at_start']} % busy at the start.\n"
        f"- Settings: {json.dumps(env['settings'])}.\n\n" + summary_table(results) + "\n"
    )


def merge_metrics(out: Path, results: list[VoiceResult], rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """Add this run's voices to an earlier run's metrics in the same folder (a voice run again replaces itself)."""
    previous: dict[str, Any] = {"voices": [], "clips": []}
    if (out / "metrics.json").is_file():
        previous = json.loads((out / "metrics.json").read_text("utf-8"))
    fresh = {r.voice for r in results}
    known = set(VoiceResult.__dataclass_fields__)
    voices = [{k: v for k, v in old.items() if k in known} for old in previous["voices"] if old["voice"] not in fresh]
    clips = [c for c in previous["clips"] if c["voice"] not in fresh] + rows
    return voices + [asdict(r) for r in results], clips


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--corpus", default=str(Path(__file__).with_name("narration_corpus.json")))
    parser.add_argument("--out", required=True)
    parser.add_argument("--voice", action="append", default=[], help="a voice id, once per voice")
    parser.add_argument("--local", action="append", default=[], help="NAME=PROFILE_DIR: a studio voice folder")
    parser.add_argument("--models-dir", default=os.environ.get("LTTS_MODELS_DIR", str(ROOT / "data" / "models")))
    parser.add_argument("--engines-dir", default=os.environ.get("LTTS_ENGINES_DIR", str(ROOT / "data" / "engines")))
    parser.add_argument("--pace", type=float, default=1.0)
    parser.add_argument("--items", default="", help="comma-separated passage ids (default: all)")
    parser.add_argument("--panel-voice", action="append", default=[], help="voices in the rated panel (default: all)")
    parser.add_argument("--repeat-check", action="store_true")
    parser.add_argument("--seed", type=int, default=0, help="the order of voices on the blind pages")
    parser.add_argument("--pack-only", action="store_true", help="only build the listening pack from earlier clips")
    args = parser.parse_args()
    out = Path(args.out).resolve()
    check_output(out)
    corpus = Path(args.corpus)
    items = json.loads(corpus.read_text("utf-8"))["items"]
    if args.items:
        wanted = set(args.items.split(","))
        items = [i for i in items if i["id"] in wanted]
    voices = [*args.voice, *(f"local:{s.partition('=')[0]}" for s in args.local)]
    if args.pack_only:
        write_pack(out, items, voices, args.panel_voice or voices, args.seed)
        return
    out.mkdir(parents=True, exist_ok=True)
    write_readme(out)
    settings = Settings(env="test", data_dir=out / "data", models_dir=Path(args.models_dir),
                        engines_dir=Path(args.engines_dir), warm_up_engines=False)  # fmt: skip
    services = build_services(settings)
    locals_ = {name: local_profile(name, Path(folder)) for name, _, folder in (s.partition("=") for s in args.local)}
    attach_local(services, locals_)
    documents = ingest(services, items)
    print(f"{len(items)} passages, {sum(len(s) for s in documents.values())} sentences, {len(voices)} voices")
    results, rows = [], []
    for voice in voices:
        result, voice_rows = run_voice(services, voice, items, documents, args, out / "clips")
        results.append(result)
        rows += voice_rows
    run_settings = {"voices": voices, "items": [i["id"] for i in items], "pace": args.pace, "seed": args.seed,
                    "repeat_check": args.repeat_check, "panel_voices": args.panel_voice or voices}  # fmt: skip
    env = environment(services, corpus, run_settings, {r.engine for r in results})
    for engine in services.engines.all():
        engine.close()
    all_voices, all_clips = merge_metrics(out, results, rows)
    metrics = {"environment": env, "voices": all_voices, "clips": all_clips}
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2), "utf-8")
    with (out / "metrics.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, CLIP_FIELDS)
        writer.writeheader()
        writer.writerows(all_clips)
    (out / "summary.md").write_text(summary([VoiceResult(**v) for v in all_voices], env), "utf-8")
    print(summary_table(results))
    write_pack(out, items, voices, args.panel_voice or voices, args.seed)


if __name__ == "__main__":
    main()
