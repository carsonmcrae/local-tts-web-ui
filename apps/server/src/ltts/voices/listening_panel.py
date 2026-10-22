# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: A blind listening panel: several voices reading the same items, rated without knowing which is which.

Scope: ``make`` copies one clip per voice and item into a folder under shuffled numbers (a new order
for every item, from a seed), writes the key, and a local page that asks, for each clip, how much it
sounds like the speaker and how natural it is (1–5), whether a word was garbled, and which clip of
the item was best. ``score`` unblinds the answers: each voice's mean ratings with a 95 % interval, how
often it was best and garbled, and, for chosen pairs, a paired sign test over the items. Nothing
leaves the computer.
Does NOT belong: Making the clips (the caller synthesises them) or the two-voice A/B (``ab_test``).
"""

from __future__ import annotations

import html
import json
import math
import random
import shutil
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SCALE = (1, 2, 3, 4, 5)
QUESTIONS = (("like", "Sounds like the speaker"), ("natural", "Natural (rhythm, pauses, expression)"))


@dataclass(frozen=True, slots=True)
class Item:
    kind: str  # narration, dialogue, a question, a long passage…
    text: str


def make(folder: Path, items: Sequence[Item], clips: Mapping[str, Sequence[Path]], seed: int = 0) -> dict[str, Any]:
    """Write the panel for ``clips`` (each voice's clip for every item, in item order); returns the key."""
    voices = list(clips)
    if len(voices) < 2 or any(len(clips[v]) != len(items) for v in voices):
        raise ValueError("Every voice needs one clip per item, and the panel needs at least two voices.")
    folder.mkdir(parents=True, exist_ok=True)
    shuffle = random.Random(seed)  # noqa: S311 - only hides which voice is which, for listening
    key: dict[str, Any] = {"voices": voices, "items": {}}
    for number, _item in enumerate(items, start=1):
        order = voices[:]
        shuffle.shuffle(order)
        key["items"][str(number)] = {str(label): voice for label, voice in enumerate(order, start=1)}
        for label, voice in enumerate(order, start=1):
            shutil.copyfile(clips[voice][number - 1], folder / _clip_name(number, label))
    (folder / "key.json").write_text(json.dumps(key, indent=2), "utf-8")
    (folder / "listen.html").write_text(_page(items, len(voices)), "utf-8")
    return key


def _clip_name(item: int, label: int) -> str:
    return f"item-{item:02d}-{label}.wav"


def _radios(name: str) -> str:
    return "".join(f'<label><input type="radio" name="{name}" value="{n}"> {n}</label>' for n in SCALE)


def _page(items: Sequence[Item], voices: int) -> str:
    sections = []
    for number, item in enumerate(items, start=1):
        rows = []
        for label in range(1, voices + 1):
            ratings = "".join(
                f"<fieldset><legend>{words}</legend>{_radios(f'i{number}-{label}-{question}')}</fieldset>"
                for question, words in QUESTIONS
            )
            rows.append(
                f'<div class="clip"><p><strong>Voice {label}</strong> <audio controls preload="none" '
                f'src="{_clip_name(number, label)}"></audio></p>{ratings}'
                f'<label><input type="checkbox" name="i{number}-{label}-garbled"> A word was garbled, '
                "skipped or mispronounced</label></div>"
            )
        best = "".join(
            f'<label><input type="radio" name="i{number}-best" value="{label}"> Voice {label}</label>'
            for label in range(1, voices + 1)
        )
        sections.append(
            f"<section><h2>{number}. {html.escape(item.kind)}</h2>"
            f'<p class="text">{html.escape(item.text)}</p>{"".join(rows)}'
            f"<fieldset><legend>Best of these</legend>{best}</fieldset></section>"
        )
    script = (
        "const KEY='ltts-panel-'+location.pathname;const form=document.forms[0];"
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
        'content="width=device-width, initial-scale=1"><title>Listening panel</title><style>'
        "body{font:16px/1.5 system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem}"
        "section{border-top:1px solid #ccc;padding:1rem 0}.text{font-family:Georgia,serif}"
        ".clip{border-left:3px solid #ddd;padding-left:.75rem;margin:1rem 0}"
        "fieldset{border:0;padding:0;margin:.25rem 0}legend{font-size:.9rem}"
        "label{display:inline-flex;align-items:center;gap:.25rem;min-height:44px;margin-right:.9rem}"
        "audio{vertical-align:middle;max-width:100%}button{font:inherit;padding:.6rem 1rem;min-height:44px}"
        "</style></head><body><form>"
        "<h1>Listening panel</h1><p>Each item is read by several voices, numbered in a new random order every "
        "time. Listen with headphones if you can, rate each clip, tick any garbled words, and pick the best. "
        "Your answers stay in this browser until you save them; then score them with "
        "<code>ltts voice-panel score</code>.</p>"
        + "".join(sections)
        + '<p><button id="save" type="button">Save my answers</button></p></form>'
        + f"<script>{script}</script></body></html>"
    )


@dataclass(frozen=True, slots=True)
class VoiceScore:
    voice: str
    like: float | None
    like_ci: float | None  # half-width of the 95 % interval
    natural: float | None
    natural_ci: float | None
    best: int
    garbled: int
    rated: int


@dataclass(frozen=True, slots=True)
class PairTest:
    a: str
    b: str
    wins: int  # items where a's ratings (likeness + naturalness) beat b's
    losses: int
    ties: int
    p_value: float  # two-sided sign test over the items that weren't tied


def _mean_ci(values: Sequence[int]) -> tuple[float | None, float | None]:
    if not values:
        return None, None
    mean = sum(values) / len(values)
    if len(values) < 2:
        return round(mean, 2), None
    sd = math.sqrt(sum((v - mean) ** 2 for v in values) / (len(values) - 1))
    return round(mean, 2), round(1.96 * sd / math.sqrt(len(values)), 2)


def sign_test(wins: int, losses: int) -> float:
    """Two-sided exact binomial test that wins and losses are equally likely."""
    n, k = wins + losses, min(wins, losses)
    if n == 0:
        return 1.0
    tail: float = sum(math.comb(n, i) for i in range(k + 1)) / 2**n
    return round(min(1.0, 2 * tail), 4)


def _rating(answers: Mapping[str, object], name: str) -> int | None:
    value = answers.get(name)
    return int(value) if isinstance(value, str) and value.isdigit() and int(value) in SCALE else None


def score(
    folder: Path, answers_file: Path, pairs: Sequence[tuple[str, str]] = ()
) -> tuple[list[VoiceScore], list[PairTest]]:
    """Unblind a listener's answers against the panel's key."""
    key = json.loads((folder / "key.json").read_text("utf-8"))
    raw = json.loads(answers_file.read_text("utf-8"))
    answers = raw.get("answers", {}) if isinstance(raw, dict) else {}
    answers = answers if isinstance(answers, dict) else {}
    ratings: dict[str, dict[str, list[int]]] = {v: {"like": [], "natural": []} for v in key["voices"]}
    best = dict.fromkeys(key["voices"], 0)
    garbled = dict.fromkeys(key["voices"], 0)
    per_item: dict[str, dict[str, int]] = {}  # item -> voice -> likeness + naturalness
    for item, labels in key["items"].items():
        per_item[item] = {}
        for label, voice in labels.items():
            prefix = f"i{item}-{label}"
            like, natural = _rating(answers, f"{prefix}-like"), _rating(answers, f"{prefix}-natural")
            for question, value in (("like", like), ("natural", natural)):
                if value is not None:
                    ratings[voice][question].append(value)
            if like is not None and natural is not None:
                per_item[item][voice] = like + natural
            garbled[voice] += answers.get(f"{prefix}-garbled") is True
        chosen = answers.get(f"i{item}-best")
        if isinstance(chosen, str) and chosen in labels:
            best[labels[chosen]] += 1
    scores = []
    for voice in key["voices"]:
        like_mean, like_ci = _mean_ci(ratings[voice]["like"])
        natural_mean, natural_ci = _mean_ci(ratings[voice]["natural"])
        rated = len(ratings[voice]["like"])
        scores.append(
            VoiceScore(voice, like_mean, like_ci, natural_mean, natural_ci, best[voice], garbled[voice], rated)
        )
    tests = []
    for a, b in pairs:
        both = [(s[a], s[b]) for s in per_item.values() if a in s and b in s]
        wins, losses = sum(x > y for x, y in both), sum(x < y for x, y in both)
        tests.append(PairTest(a, b, wins, losses, len(both) - wins - losses, sign_test(wins, losses)))
    return scores, tests


def summary(scores: Sequence[VoiceScore], tests: Sequence[PairTest]) -> str:
    def show(mean: float | None, ci: float | None) -> str:
        return "—" if mean is None else f"{mean:.2f}" + (f" ± {ci:.2f}" if ci is not None else "")

    lines = ["voice  likeness      naturalness   best  garbled  rated"]
    for s in sorted(scores, key=lambda s: -(s.like or 0) - (s.natural or 0)):
        lines.append(f"{s.voice:<6} {show(s.like, s.like_ci):<13} {show(s.natural, s.natural_ci):<13} "
                     f"{s.best:<5} {s.garbled:<8} {s.rated}")  # fmt: skip
    for t in tests:
        lines.append(f"{t.a} vs {t.b}: better on {t.wins} items, worse on {t.losses}, tied {t.ties} (p = {t.p_value})")
    return "\n".join(lines)
