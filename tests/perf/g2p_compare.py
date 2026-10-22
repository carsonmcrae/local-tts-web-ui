# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: A blind comparison of Kokoro reading English from espeak-ng phonemes (today) and from misaki phonemes
(what Kokoro v1.0 was trained on), judged against a decision rule fixed before anyone listens.

Scope: ``prepare`` (app environment) applies the app's speech rewrite and English reading rules to
``g2p_corpus.json``, gives each sentence a US or UK voice and times espeak-ng; ``misaki`` (an isolated environment
with misaki and spaCy, run with ``python -I``) writes misaki's phonemes, time and memory; ``render`` (app
environment) reads every sentence both ways with the same voice, levels loudness and writes a blind page with
catch trials; ``score`` unblinds one listener's answers and applies ``RULE``.
Does NOT belong: The app's phonemiser (kokoro-onnx, ``engines/kokoro.py``) or installing anything.

Run, in order (WORK and PACK are folders outside the repository or under .tools/):
  app env:    python ../../tests/perf/g2p_compare.py prepare WORK
  misaki env: python -I tests/perf/g2p_compare.py misaki WORK
  app env:    python ../../tests/perf/g2p_compare.py render WORK PACK --models DIR [--seed N]
  any:        python ../../tests/perf/g2p_compare.py score WORK PACK answers.json
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import random
import shutil
import statistics
import sys
import time
from importlib import metadata
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ARMS = ("espeak", "misaki")
CATCH_TRIALS = 4
LEVEL_DBFS = -23.0
# Fixed before listening. misaki is adopted only if every condition holds; see docs/research/voice-library.md.
RULE = {
    "error_reduction": 0.25,  # at least 25 % fewer wrongly pronounced words in total
    "accent_tolerance": 1,  # and no more than one extra wrong word in either accent
    "naturalness_gain": 0.3,  # a mean naturalness gain (1-5 scale) whose 95 % interval is above zero, or
    "preference_lower_bound": 0.5,  # a preference rate whose 95 % interval is above one half
    "category_margin": 2,  # no kind of sentence where misaki loses by two items or more
    "catch_consistent": 3,  # of the catch trials (identical clips) heard as "no preference"
    "g2p_median_ms": 50.0,
    "g2p_p95_ms": 150.0,
    "added_memory_mb": 300.0,
    "load_s": 10.0,  # loading must also be done in the background, never before the first sentence
}


def _load(path: Path) -> Any:
    return json.loads(path.read_text("utf-8"))


def _save(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), "utf-8")


def _percentile(values: list[float], share: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(share * (len(ordered) - 1)))]


def prepare(work: Path, corpus: Path) -> None:
    sys.path.insert(0, str(ROOT / "apps" / "server" / "src"))
    from kokoro_onnx.tokenizer import Tokenizer

    from ltts.documents.normalize import speech_text
    from ltts.synthesis.english import english_speech

    data = _load(corpus)
    voices = [("us", v) for v in data["voices"]["us"]] + [("uk", v) for v in data["voices"]["uk"]]
    tokenizer = Tokenizer()
    tokenizer.phonemize("Warm up.", "en-us")
    seen: dict[str, int] = {}
    items = []
    for number, item in enumerate(data["items"], start=1):
        turn = seen[item["category"]] = seen.get(item["category"], -1) + 1
        accent, voice = voices[turn % len(voices)]  # both accents and both voices of each in every kind
        spoken = english_speech(speech_text(item["text"]))
        lang = "en-gb" if accent == "uk" else "en-us"
        started = time.perf_counter()
        phonemes = tokenizer.phonemize(spoken, lang)
        items.append({"n": number, **item, "spoken": spoken, "accent": accent, "voice": voice, "lang": lang,
                      "espeak": phonemes, "espeak_s": time.perf_counter() - started})  # fmt: skip
    work.mkdir(parents=True, exist_ok=True)
    _save(work / "items.json", {"corpus_sha256": hashlib.sha256(corpus.read_bytes()).hexdigest(), "items": items})
    print(f"{len(items)} sentences prepared in {work}")


def _stand_in_heavy_imports(folder: Path) -> None:
    """misaki 0.9.4 imports torch and transformers at load time for a neural fallback this comparison never builds
    (an espeak fallback is passed instead); empty stand-ins keep both out of the environment."""
    for name, body in (("torch", ""), ("transformers", "BartForConditionalGeneration = None\n")):
        (folder / name).mkdir(parents=True, exist_ok=True)
        (folder / name / "__init__.py").write_text(body, "utf-8")
    sys.path.insert(0, str(folder))


def _working_set_mb() -> float | None:
    if sys.platform != "win32":
        import resource

        return float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) / 1024
    import ctypes
    from ctypes import wintypes

    class Counters(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("faults", wintypes.DWORD), ("peak", ctypes.c_size_t),  # noqa: RUF012
                    ("current", ctypes.c_size_t), *[(f"f{i}", ctypes.c_size_t) for i in range(6)]]  # fmt: skip

    counters = Counters(cb=ctypes.sizeof(Counters))
    kernel32, psapi = ctypes.windll.kernel32, ctypes.windll.psapi  # type: ignore[attr-defined]
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
    if not psapi.GetProcessMemoryInfo(kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        return None
    return float(counters.current) / 1024**2


def misaki_phase(work: Path) -> None:
    _stand_in_heavy_imports(work / "stand-ins")
    data = _load(work / "items.json")
    before = _working_set_mb()
    started = time.perf_counter()
    from misaki import en, espeak

    g2p = {accent: en.G2P(trf=False, british=accent == "uk", fallback=espeak.EspeakFallback(british=accent == "uk"))
           for accent in ("us", "uk")}  # fmt: skip
    load_s = time.perf_counter() - started
    for accent in g2p:
        g2p[accent]("Warm up.")
    loaded = _working_set_mb()
    times = []
    for item in data["items"]:
        started = time.perf_counter()
        item["misaki"] = g2p[item["accent"]](item["spoken"])[0]
        times.append(time.perf_counter() - started)
    versions = {}
    for name in ("misaki", "spacy", "en_core_web_sm", "num2words", "phonemizer-fork", "espeakng-loader"):
        try:
            versions[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            versions[name] = None
    _save(work / "misaki.json", {
        "phonemes": {str(item["n"]): item["misaki"] for item in data["items"]},
        "load_s": round(load_s, 2), "median_ms": round(statistics.median(times) * 1000, 1),
        "p95_ms": round(_percentile(times, 0.95) * 1000, 1),
        "working_set_mb": {"before": before, "loaded": loaded, "after": _working_set_mb()},
        "versions": versions,
    })  # fmt: skip
    print(f"misaki: loaded in {load_s:.1f} s, median {statistics.median(times) * 1000:.0f} ms per sentence")


def _level(samples: Any) -> Any:
    import numpy as np

    frames = samples[: len(samples) // 480 * 480].reshape(-1, 480)
    loud = frames[np.sqrt((frames**2).mean(axis=1)) > 10 ** (-45 / 20)]
    rms = float(np.sqrt((loud**2).mean())) if loud.size else 0.0
    gain = 10 ** (LEVEL_DBFS / 20) / rms if rms else 1.0
    return np.clip(samples * gain, -0.99, 0.99)


def render(work: Path, pack: Path, models: Path, seed: int) -> None:
    sys.path.insert(0, str(ROOT / "apps" / "server" / "src"))
    import soundfile as sf

    from ltts.onnx import onnxruntime  # the app's own onnxruntime setup (telemetry off, CPU provider)

    rt = onnxruntime()
    from kokoro_onnx import Kokoro

    session = rt.InferenceSession(str(models / "kokoro-v1.0.onnx"), providers=["CPUExecutionProvider"])
    model = Kokoro.from_session(session, str(models / "voices-v1.0.bin"))
    items = _load(work / "items.json")["items"]
    phonemes = _load(work / "misaki.json")["phonemes"]
    clips = work / "clips"
    clips.mkdir(parents=True, exist_ok=True)
    seconds: dict[str, list[float]] = {arm: [] for arm in ARMS}
    for item in items:
        misaki = phonemes[str(item["n"])]
        item["misaki_dropped"] = sorted({c for c in misaki if c not in model.tokenizer.vocab and not c.isspace()})
        for arm in ARMS:
            started = time.perf_counter()
            if arm == "espeak":  # what the app does today
                audio, rate = model.create(item["spoken"], voice=item["voice"], speed=1.0, lang=item["lang"])
            else:
                audio, rate = model.create(model.tokenizer.known(misaki), voice=item["voice"], is_phonemes=True)
            seconds[arm].append(time.perf_counter() - started)
            sf.write(clips / f"{item['n']:02d}-{arm}.wav", _level(audio), rate, subtype="PCM_16")
    _save(work / "render.json", {"synthesis_median_s": {a: round(statistics.median(s), 3) for a, s in seconds.items()},
                                 "items": items})  # fmt: skip
    _write_pack(work, pack, items, seed)


def _write_pack(work: Path, pack: Path, items: list[dict[str, Any]], seed: int) -> None:
    rng = random.Random(seed)  # noqa: S311 - only hides which clip is which, for listening
    pairs = [{"item": item["n"], "clips": rng.sample(list(ARMS), 2), "catch": False} for item in items]
    for index, item in enumerate(rng.sample(items, CATCH_TRIALS)):
        arm = ARMS[index % 2]
        pairs.append({"item": item["n"], "clips": [arm, arm], "catch": True})
    rng.shuffle(pairs)
    shutil.rmtree(pack, ignore_errors=True)
    pack.mkdir(parents=True)
    by_number = {item["n"]: item for item in items}
    sections = []
    for number, pair in enumerate(pairs, start=1):
        item = by_number[pair["item"]]
        for label, arm in enumerate(pair["clips"], start=1):
            shutil.copyfile(work / "clips" / f"{item['n']:02d}-{arm}.wav", pack / f"pair-{number:02d}-{label}.wav")
        sections.append(_section(number, item))
    _save(pack / "key.json", {"seed": seed, "pairs": {str(n): p for n, p in enumerate(pairs, start=1)}})
    (pack / "listen.html").write_text(_page(sections), "utf-8")
    print(f"{len(pairs)} pairs ({CATCH_TRIALS} catch trials) written to {pack}")


def _radios(name: str, values: tuple[str, ...], labels: tuple[str, ...]) -> str:
    return "".join(f'<label><input type="radio" name="{name}" value="{v}"> {w}</label>' for v, w in zip(values, labels, strict=True))


def _section(number: int, item: dict[str, Any]) -> str:
    note = f'<p class="note">Intended: {html.escape(item["note"])}</p>' if item.get("note") else ""
    clips = "".join(
        f'<div class="clip"><p><strong>Clip {c}</strong> <audio controls preload="none" src="pair-{number:02d}-{c}.wav">'
        f"</audio></p><fieldset><legend>Words pronounced wrongly</legend>"
        f"{_radios(f'p{number}-{c}-wrong', ('0', '1', '2', '3', '4'), ('none', '1', '2', '3', '4 or more'))}</fieldset>"
        f'<label><input type="checkbox" name="p{number}-{c}-garbled"> A word was skipped, added or garbled</label>'
        f"<fieldset><legend>Natural rhythm, stress and intonation (1 poor, 5 excellent)</legend>"
        f"{_radios(f'p{number}-{c}-natural', ('1', '2', '3', '4', '5'), ('1', '2', '3', '4', '5'))}</fieldset></div>"
        for c in (1, 2)
    )
    prefer = _radios(f"p{number}-best", ("1", "2", "same"), ("Clip 1", "Clip 2", "No preference"))
    return (f'<section><h2>Pair {number}</h2><p class="text">{html.escape(item["text"])}</p>{note}{clips}'
            f"<fieldset><legend>Which would you rather hear in a book?</legend>{prefer}</fieldset></section>")  # fmt: skip


def _page(sections: list[str]) -> str:
    script = (
        "const KEY='ltts-g2p-'+location.pathname;const form=document.forms[0];"
        "function read(){const out={};for(const el of form.elements){if(!el.name)continue;"
        "if(el.type==='radio'&&el.checked)out[el.name]=el.value;if(el.type==='checkbox')out[el.name]=el.checked;}"
        "return out;}"
        "try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');for(const el of form.elements){"
        "if(!(el.name in saved))continue;if(el.type==='radio')el.checked=el.value===saved[el.name];"
        "if(el.type==='checkbox')el.checked=saved[el.name]===true;}}catch(e){}"
        "form.addEventListener('change',()=>{try{localStorage.setItem(KEY,JSON.stringify(read()));}catch(e){}});"
        "document.getElementById('save').onclick=()=>{const blob=new Blob([JSON.stringify({answers:read()},null,2)],"
        "{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);"
        "a.download='answers.json';a.click();};"
    )
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" '
        'content="width=device-width, initial-scale=1"><title>Pronunciation comparison</title><style>'
        "body{font:16px/1.5 system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem}"
        "section{border-top:1px solid #ccc;padding:1rem 0}.text{font-family:Georgia,serif;font-size:1.1rem}"
        ".note{color:#555;font-size:.9rem}.clip{border-left:3px solid #ddd;padding-left:.75rem;margin:1rem 0}"
        "fieldset{border:0;padding:0;margin:.25rem 0}legend{font-size:.9rem}"
        "label{display:inline-flex;align-items:center;gap:.25rem;min-height:44px;margin-right:.9rem}"
        "audio{vertical-align:middle;max-width:100%}button{font:inherit;padding:.6rem 1rem;min-height:44px}"
        "</style></head><body><form><h1>Pronunciation comparison</h1>"
        "<p>Each sentence is read twice by the same voice, in a random order. Listen with headphones if you can. "
        "For each clip, count the words said wrongly (the note gives the intended reading where the text alone "
        "doesn't), tick any word skipped, added or garbled, and rate how natural the rhythm, stress and intonation "
        "are. Then say which you would rather hear in a book. Some pairs may sound the same; if so, say so. Your "
        "answers stay in this browser until you save them.</p>"
        + "".join(sections)
        + '<p><button id="save" type="button">Save my answers</button></p></form>'
        + f"<script>{script}</script></body></html>"
    )


def _sign_p(wins: int, losses: int) -> float:
    n, k = wins + losses, min(wins, losses)
    return 1.0 if n == 0 else min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2**n)


def _wilson(wins: int, n: int) -> tuple[float, float]:
    if n == 0:
        return 0.0, 1.0
    p, z = wins / n, 1.96
    centre, half = (p + z * z / (2 * n)) / (1 + z * z / n), z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return round(centre - half, 3), round(centre + half, 3)


def _bootstrap(differences: list[int]) -> tuple[float, float, float]:
    if not differences:
        return 0.0, 0.0, 0.0
    rng = random.Random(0)  # noqa: S311 - a fixed resampling seed makes the interval repeatable
    means = sorted(statistics.fmean(rng.choices(differences, k=len(differences))) for _ in range(10_000))
    return round(statistics.fmean(differences), 2), round(means[249], 2), round(means[9_749], 2)


def _ratings(answers: dict[str, Any], pair: str, spec: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out = {}
    for label, arm in enumerate(spec["clips"], start=1):
        wrong, natural = answers.get(f"p{pair}-{label}-wrong"), answers.get(f"p{pair}-{label}-natural")
        out[f"{arm}{label if spec['catch'] else ''}"] = {
            "wrong": int(wrong) if isinstance(wrong, str) and wrong.isdigit() else None,
            "natural": int(natural) if isinstance(natural, str) and natural.isdigit() else None,
            "garbled": answers.get(f"p{pair}-{label}-garbled") is True,
            "label": str(label),
        }
    return out


def score(work: Path, pack: Path, answers_file: Path) -> str:
    key = _load(pack / "key.json")
    raw = _load(answers_file)
    answers = raw.get("answers", {}) if isinstance(raw, dict) else {}
    items = {item["n"]: item for item in _load(work / "render.json")["items"]}
    rows, catch_same = [], 0
    for pair, spec in key["pairs"].items():
        ratings, best = _ratings(answers, pair, spec), answers.get(f"p{pair}-best")
        if spec["catch"]:
            catch_same += best == "same"
            continue
        preferred = next((arm for arm, r in ratings.items() if r["label"] == best), None)
        rows.append({"item": items[spec["item"]], "ratings": ratings, "preferred": preferred})
    totals = {arm: sum(r["ratings"][arm]["wrong"] or 0 for r in rows) for arm in ARMS}
    garbled = {arm: sum(r["ratings"][arm]["garbled"] for r in rows) for arm in ARMS}
    by_accent = {accent: {arm: sum(r["ratings"][arm]["wrong"] or 0 for r in rows if r["item"]["accent"] == accent)
                          for arm in ARMS} for accent in ("us", "uk")}  # fmt: skip
    fewer = sum((r["ratings"]["misaki"]["wrong"] or 0) < (r["ratings"]["espeak"]["wrong"] or 0) for r in rows)
    more = sum((r["ratings"]["misaki"]["wrong"] or 0) > (r["ratings"]["espeak"]["wrong"] or 0) for r in rows)
    differences = [r["ratings"]["misaki"]["natural"] - r["ratings"]["espeak"]["natural"] for r in rows
                   if r["ratings"]["misaki"]["natural"] and r["ratings"]["espeak"]["natural"]]  # fmt: skip
    gain, gain_low, gain_high = _bootstrap(differences)
    wins, losses = sum(r["preferred"] == "misaki" for r in rows), sum(r["preferred"] == "espeak" for r in rows)
    low, high = _wilson(wins, wins + losses)
    categories = {}
    for category in sorted({r["item"]["category"] for r in rows}):
        group = [r for r in rows if r["item"]["category"] == category]
        lost = sum(r["preferred"] == "espeak" or (r["ratings"]["misaki"]["wrong"] or 0) > (r["ratings"]["espeak"]["wrong"] or 0) for r in group)
        won = sum(r["preferred"] == "misaki" or (r["ratings"]["misaki"]["wrong"] or 0) < (r["ratings"]["espeak"]["wrong"] or 0) for r in group)
        categories[category] = (won, lost)
    cost = _load(work / "misaki.json")
    memory = cost["working_set_mb"]
    added = (memory["loaded"] or 0) - (memory["before"] or 0)

    reliable = catch_same >= RULE["catch_consistent"]
    pronunciation = totals["misaki"] <= (1 - RULE["error_reduction"]) * totals["espeak"] if totals["espeak"] else totals["misaki"] == 0
    pronunciation = pronunciation and garbled["misaki"] <= garbled["espeak"] and all(
        a["misaki"] - a["espeak"] <= RULE["accent_tolerance"] for a in by_accent.values())
    preferred = (gain >= RULE["naturalness_gain"] and gain_low > 0) or low > RULE["preference_lower_bound"]
    against = gain_high < 0 or high < RULE["preference_lower_bound"] or totals["misaki"] > totals["espeak"]
    category_loss = [c for c, (won, lost) in categories.items() if lost - won >= RULE["category_margin"]]
    affordable = (cost["median_ms"] <= RULE["g2p_median_ms"] and cost["p95_ms"] <= RULE["g2p_p95_ms"]
                  and added <= RULE["added_memory_mb"] and cost["load_s"] <= RULE["load_s"])  # fmt: skip
    if not reliable:
        verdict = "UNRELIABLE: the catch trials were not heard as the same; listen again in another sitting."
    elif against:
        verdict = "REJECT: espeak-ng is as good or better here; keep it."
    elif pronunciation and preferred and not category_loss and affordable:
        verdict = "ADOPT (provisional): prepare the integration proposal; confirm with a second listener first."
    else:
        verdict = "INCONCLUSIVE: no clear gain; keep espeak-ng."
    lines = [
        "# Pronunciation comparison: espeak-ng against misaki", "", f"**Verdict:** {verdict}", "",
        f"- Pairs scored: {len(rows)}; catch trials heard as the same: {catch_same} of {CATCH_TRIALS}.",
        f"- Wrong words: espeak {totals['espeak']}, misaki {totals['misaki']}; sentences where misaki had fewer: "
        f"{fewer}, more: {more} (sign test p = {_sign_p(fewer, more):.3f}).",
        f"- By accent (espeak / misaki): US {by_accent['us']['espeak']} / {by_accent['us']['misaki']}, "
        f"UK {by_accent['uk']['espeak']} / {by_accent['uk']['misaki']}. Skipped, added or garbled: "
        f"espeak {garbled['espeak']}, misaki {garbled['misaki']}.",
        f"- Naturalness, misaki minus espeak (1-5 scale): {gain:+.2f}, 95 % interval {gain_low:+.2f} to "
        f"{gain_high:+.2f} over {len(differences)} sentences.",
        f"- Preferred: misaki {wins}, espeak {losses}, no preference {len(rows) - wins - losses}; misaki's share of "
        f"preferences {wins / max(wins + losses, 1):.2f}, 95 % interval {low:.2f} to {high:.2f} "
        f"(sign test p = {_sign_p(wins, losses):.3f}).",
        "- By kind (misaki better / worse): " + ", ".join(f"{c} {w}/{l}" for c, (w, l) in categories.items()) + ".",
        f"- Cost: misaki loads in {cost['load_s']} s, {cost['median_ms']} ms median and {cost['p95_ms']} ms p95 per "
        f"sentence, about {added:.0f} MB more memory.", "",
        "One listener can only show a large difference: an ADOPT is provisional until a second listener agrees, and "
        "espeak-ng stays the fallback either way.",
    ]  # fmt: skip
    report = "\n".join(lines) + "\n"
    (pack / "score.md").write_text(report, "utf-8")
    return report


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("step", choices=["prepare", "misaki", "render", "score"])
    parser.add_argument("work")
    parser.add_argument("pack", nargs="?")
    parser.add_argument("answers", nargs="?")
    parser.add_argument("--corpus", default=str(HERE / "g2p_corpus.json"))
    parser.add_argument("--models", default=str(ROOT / "data" / "models" / "kokoro-v1.0"))
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    work = Path(args.work).resolve()
    if args.step in ("prepare", "render"):  # the app environment: keep generated audio out of version control
        from bench_support import check_output

        check_output(work)
        if args.pack:
            check_output(Path(args.pack).resolve())
    if args.step == "prepare":
        prepare(work, Path(args.corpus))
    elif args.step == "misaki":
        misaki_phase(work)
    elif args.step == "render":
        render(work, Path(args.pack).resolve(), Path(args.models), args.seed)
    else:
        print(score(work, Path(args.pack).resolve(), Path(args.answers)))


if __name__ == "__main__":
    main()
