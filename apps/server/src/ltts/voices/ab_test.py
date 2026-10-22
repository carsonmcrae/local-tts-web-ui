# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: A repeatable, blind A/B comparison of two voices reading the same sentences.

Scope: ``compare`` reads a fixed set of test sentences (narration, questions, an exclamation,
dialogue, numbers and names, a long sentence and a calm aside, or the user's own) with two voices,
and writes each pair as X and Y in an order shuffled by a seed so the listener can't tell which is
which; the key; plain measurements per clip (length, pace, loudness, pauses, clipping and, when the
cloning engine can measure it, how close the speaker sounds to a reference recording); and a local
listening page that records which of each pair sounds more like the speaker. ``score`` unblinds the
answers against the key. Nothing leaves the computer; nothing is trained.
Does NOT belong: Building voices (``studio.py``) or synthesis itself (the caller passes it in).
"""

from __future__ import annotations

import csv
import html
import json
import random
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

from ltts.audio import Float32Array, trim_silence
from ltts.engines.base import VoiceBuilder
from ltts.engines.cloned_speech import count_syllables
from ltts.voices.quality import measure

Synthesise = Callable[[str, str], tuple[Float32Array, int]]  # (voice id, text) -> audio
# None of these is in the studio recording script: a studio or fine-tuned voice has never read them.
DEFAULT_SENTENCES = (
    "The museum opens at ten, although the café downstairs is busy long before that.",
    "Do you think the weather will hold until the weekend?",
    "Wait, you mean the whole town knew about it before we did?",
    "That's wonderful news! I can't believe it finally happened!",
    '"Mind the step," he said, grinning, "or you\'ll end up in the pond again."',
    "Flight 2417 to Edinburgh leaves from gate 36 at 7:45 on Thursday the 12th.",
    "Dr. Okonkwo and Ms. Fitzgerald met Kael, Siobhan and Joaquín at the station in Worcester.",
    "When the storm finally passed, the fields were quiet again, the river had settled back into its banks, "
    "and the farmers walked out slowly to see what the night had left behind.",
    "(Nobody noticed, of course.) She folded the letter, and put it away.",
    "These days, whenever the kettle boils, I stop for a moment and look outside.",
)
FIELDS = ("pair", "label", "voice", "duration_s", "syllables_per_s", "rms_dbfs", "pause_ratio", "clipping_ratio",
          "similarity")  # fmt: skip


_CHOICES = (("X", "X sounds more like them"), ("Y", "Y sounds more like them"), ("same", "No difference"))


@dataclass(frozen=True, slots=True)
class Clip:
    pair: int
    label: str  # X or Y, as the listener hears it
    voice: str
    path: Path
    text: str


def _measure(clip: Clip) -> dict[str, float | str | None]:
    samples, rate = sf.read(clip.path, dtype="float32")
    values = measure(trim_silence(samples, rate) if samples.size else samples, rate)
    speech = values["speech_s"] or 0.0
    return {
        "pair": clip.pair,
        "label": clip.label,
        "voice": clip.voice,
        "duration_s": values["duration_s"],
        "syllables_per_s": round(count_syllables(clip.text) / speech, 2) if speech else None,
        "rms_dbfs": values["rms_dbfs"],
        "pause_ratio": values["pause_ratio"],
        "clipping_ratio": values["clipping_ratio"],
        "similarity": None,
    }


def similarity_to(builder: VoiceBuilder, reference: Path, clips: Sequence[Path]) -> list[float]:
    """How close each clip's speaker sounds to ``reference``: the cosine of both speaker embeddings, averaged."""
    features = builder.measure_takes([reference, *clips])

    def unit(vector: Sequence[float]) -> np.ndarray:
        array = np.asarray(vector, dtype=np.float64)
        return array / max(float(np.linalg.norm(array)), 1e-12)

    target = [unit(features[0].speaker_emb), unit(features[0].xvector)]
    return [round(float((unit(f.speaker_emb) @ target[0] + unit(f.xvector) @ target[1]) / 2), 3) for f in features[1:]]


def _page(clips: Sequence[Clip], title: str) -> str:
    rows = []
    for pair in sorted({clip.pair for clip in clips}):
        x, y = (next(c for c in clips if c.pair == pair and c.label == label) for label in ("X", "Y"))
        choices = "".join(
            f'<label><input type="radio" name="p{pair}" value="{value}"> {words}</label>' for value, words in _CHOICES
        )
        rows.append(
            f'<section><p class="text">{pair}. {html.escape(x.text)}</p>'
            f'<p>X <audio controls preload="none" src="{x.path.name}"></audio></p>'
            f'<p>Y <audio controls preload="none" src="{y.path.name}"></audio></p>'
            f"<fieldset><legend>Which sounds more like the speaker?</legend>{choices}</fieldset></section>"
        )
    script = (
        "const pairs=[...document.querySelectorAll('fieldset')].length;"
        "function answers(){const out={};for(let i=1;i<=pairs;i++){const c=document.querySelector("
        "`input[name=p${i}]:checked`);if(c)out[i]=c.value;}return out;}"
        "document.getElementById('save').onclick=()=>{const blob=new Blob([JSON.stringify({answers:answers()},null,2)],"
        "{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);"
        "a.download='answers.json';a.click();};"
    )
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" '
        'content="width=device-width, initial-scale=1"><title>Voice comparison</title><style>'
        "body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem}"
        "section{border-top:1px solid #ccc;padding:1rem 0}.text{font-family:Georgia,serif}"
        "fieldset{border:0;padding:0}label{display:block;padding:.4rem 0;min-height:44px}"
        "button{font:inherit;padding:.6rem 1rem;min-height:44px}</style></head><body>"
        f"<h1>{html.escape(title)}</h1><p>Listen to each pair (with headphones, if you can) and choose the one "
        "that sounds more like the speaker. X and Y are shuffled for every sentence. Then save your answers and "
        "score them with <code>ltts voice-ab score</code>.</p>"
        + "".join(rows)
        + f'<p><button id="save" type="button">Save my answers</button></p><script>{script}</script></body></html>'
    )


def compare(
    synthesise: Synthesise,
    voices: tuple[str, str],
    folder: Path,
    sentences: Sequence[str] = DEFAULT_SENTENCES,
    seed: int = 0,
    similarity: Callable[[Sequence[Path]], list[float]] | None = None,
) -> list[dict[str, float | str | None]]:
    """Write a blind comparison of ``voices`` (A, B) into ``folder``; returns each clip's measurements."""
    folder.mkdir(parents=True, exist_ok=True)
    shuffle = random.Random(seed)  # noqa: S311 - only hides which voice is X from the listener
    clips: list[Clip] = []
    key: dict[str, dict[str, str]] = {}
    for pair, text in enumerate(sentences, start=1):
        order = list(voices)
        shuffle.shuffle(order)
        key[str(pair)] = {"X": "A" if order[0] == voices[0] else "B", "Y": "A" if order[1] == voices[0] else "B"}
        for label, voice in zip(("X", "Y"), order, strict=True):
            samples, rate = synthesise(voice, text)
            path = folder / f"pair-{pair:02d}-{label}.wav"
            sf.write(path, samples, rate, subtype="PCM_16")
            clips.append(Clip(pair, label, voice, path, text))
    rows = [_measure(clip) for clip in clips]
    if similarity is not None:
        for row, score in zip(rows, similarity([clip.path for clip in clips]), strict=True):
            row["similarity"] = score
    with (folder / "metrics.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    (folder / "key.json").write_text(json.dumps({"A": voices[0], "B": voices[1], "pairs": key}, indent=2), "utf-8")
    (folder / "listen.html").write_text(_page(clips, "Which voice sounds more like the speaker?"), "utf-8")
    return rows


@dataclass(frozen=True, slots=True)
class Score:
    a: int
    b: int
    same: int
    unanswered: int
    voices: dict[str, str]
    similarity: dict[str, float | None]  # the mean similarity per voice (A, B), when it was measured

    def summary(self) -> str:
        lines = [
            f"A ({self.voices['A']}): preferred {self.a} times",
            f"B ({self.voices['B']}): preferred {self.b} times",
            f"No difference: {self.same}; unanswered: {self.unanswered}",
        ]
        for side in ("A", "B"):
            if self.similarity[side] is not None:
                lines.append(f"Mean speaker similarity {side}: {self.similarity[side]:.3f}")
        return "\n".join(lines)


def score(folder: Path, answers_file: Path) -> Score:
    """Unblind a listener's answers (from the listening page) against the comparison's key."""
    key = json.loads((folder / "key.json").read_text("utf-8"))
    raw = json.loads(answers_file.read_text("utf-8"))
    answers = raw.get("answers", {}) if isinstance(raw, dict) else {}
    counts = {"A": 0, "B": 0, "same": 0, "unanswered": 0}
    for pair, sides in key["pairs"].items():
        choice = answers.get(pair) if isinstance(answers, dict) else None
        if choice in ("X", "Y"):
            counts[sides[choice]] += 1
        else:
            counts["same" if choice == "same" else "unanswered"] += 1
    means: dict[str, float | None] = {}
    with (folder / "metrics.csv").open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    for side in ("A", "B"):
        values = [float(row["similarity"]) for row in rows if row["voice"] == key[side] and row["similarity"]]
        means[side] = round(sum(values) / len(values), 3) if values else None
    return Score(counts["A"], counts["B"], counts["same"], counts["unanswered"], {"A": key["A"], "B": key["B"]}, means)
