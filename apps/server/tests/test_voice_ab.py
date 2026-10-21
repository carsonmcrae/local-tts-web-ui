# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the blind A/B voice comparison and its scoring.

Scope: Every sentence is read by both voices, shuffled into X and Y by the seed (repeatably), with a
key, measurements and similarity per clip; the listening page shows sentence text only as escaped
text and runs nothing but its own small script; scoring unblinds answers (including missing or
malformed ones) and averages similarity per voice, said in the summary; the command line reads the sentences with the
app's own engines (closing them afterwards) and scores a folder.
Does NOT belong: Measuring speaker similarity with the real cloning engine (needs the model).
"""

from __future__ import annotations

import csv
import json
import re
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import pytest

from conftest import FakeEngine, speech_like, wav_bytes
from ltts import container
from ltts.cli import main
from ltts.config import Settings
from ltts.voices.ab_test import DEFAULT_SENTENCES, compare, score

RATE = 24_000


def synthesise(voice: str, text: str) -> tuple[np.ndarray, int]:
    """A voice-like tone, higher for B, as long as the text needs."""
    t = np.arange(int(RATE * max(len(text) / 15, 0.5))) / RATE
    pitch = 150 if voice == "voice:a" else 210
    syllables = (np.sin(2 * np.pi * 4 * t) > -0.6).astype(np.float32)
    return (0.2 * np.sin(2 * np.pi * pitch * t) * syllables).astype(np.float32), RATE


SENTENCES = ["One sentence to read.", "Is this a question?", "<script>alert('x')</script> & more."]


def test_a_comparison_reads_every_sentence_with_both_voices_blind(tmp_path: Path) -> None:
    rows = compare(synthesise, ("voice:a", "voice:b"), tmp_path, SENTENCES, seed=3)
    assert len(rows) == 6 and {row["voice"] for row in rows} == {"voice:a", "voice:b"}
    key = json.loads((tmp_path / "key.json").read_text("utf-8"))
    assert (key["A"], key["B"]) == ("voice:a", "voice:b")
    for row in rows:  # the key says which voice each X and Y is
        side = key["pairs"][str(row["pair"])][row["label"]]
        assert key[side] == row["voice"]
        assert (tmp_path / f"pair-{row['pair']:02d}-{row['label']}.wav").is_file()
        assert row["duration_s"] and row["syllables_per_s"] and row["similarity"] is None
    again = tmp_path / "again"
    compare(synthesise, ("voice:a", "voice:b"), again, SENTENCES, seed=3)
    assert json.loads((again / "key.json").read_text("utf-8"))["pairs"] == key["pairs"]  # repeatable
    seeds = {json.dumps(json.loads(_key(tmp_path, seed))["pairs"]) for seed in range(6)}
    assert len(seeds) > 1  # different seeds shuffle differently


def _key(tmp_path: Path, seed: int) -> str:
    folder = tmp_path / f"seed-{seed}"
    compare(synthesise, ("voice:a", "voice:b"), folder, SENTENCES, seed=seed)
    return (folder / "key.json").read_text("utf-8")


def test_the_listening_page_shows_text_only_as_text(tmp_path: Path) -> None:
    compare(synthesise, ("voice:a", "voice:b"), tmp_path, SENTENCES)
    page = (tmp_path / "listen.html").read_text("utf-8")
    assert "&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt; &amp; more." in page
    assert page.count("<script>") == 1 and "alert(" not in page.replace("alert(&#x27;", "")
    assert page.count("<audio") == 6 and 'src="pair-03-X.wav"' in page
    assert "voice:a" not in page and "voice:b" not in page  # the page never says which voice is which
    assert "http" not in page  # nothing is loaded from anywhere


def test_similarity_is_measured_per_clip_when_available(tmp_path: Path) -> None:
    def similarity(clips: Sequence[Path]) -> list[float]:
        return [0.91 if path.name.endswith("X.wav") else 0.72 for path in clips]

    rows = compare(synthesise, ("voice:a", "voice:b"), tmp_path, SENTENCES[:2], similarity=similarity)
    assert [row["similarity"] for row in rows] == [0.91, 0.72, 0.91, 0.72]
    with (tmp_path / "metrics.csv").open(encoding="utf-8") as handle:
        assert [row["similarity"] for row in csv.DictReader(handle)] == ["0.91", "0.72", "0.91", "0.72"]
    answers = tmp_path / "answers.json"
    answers.write_text(json.dumps({"answers": {"1": "X"}}), "utf-8")
    result = score(tmp_path, answers)
    assert set(result.similarity.values()) <= {0.91, 0.72, 0.815}  # each voice's mean over its own clips
    assert result.summary().count("Mean speaker similarity") == 2


def test_scoring_unblinds_the_answers(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    compare(synthesise, ("voice:a", "voice:b"), tmp_path, SENTENCES, seed=1)
    key = json.loads((tmp_path / "key.json").read_text("utf-8"))["pairs"]
    a_side = {pair: next(label for label, side in sides.items() if side == "A") for pair, sides in key.items()}
    answers = tmp_path / "answers.json"
    answers.write_text(json.dumps({"answers": {"1": a_side["1"], "2": "same", "x": "Y"}}), "utf-8")
    result = score(tmp_path, answers)
    assert (result.a, result.b, result.same, result.unanswered) == (1, 0, 1, 1)
    assert result.similarity == {"A": None, "B": None}
    answers.write_text("[]", "utf-8")  # not what the page saves: counts as unanswered
    assert score(tmp_path, answers).unanswered == 3
    answers.write_text(json.dumps({"answers": {"1": a_side["1"]}}), "utf-8")
    assert main(["voice-ab", "score", str(tmp_path), str(answers)]) == 0
    assert "A (voice:a): preferred 1 times" in capsys.readouterr().out


class ClosingEngine(FakeEngine):
    def __init__(self, engine_id: str, *, cloning: bool = False) -> None:
        super().__init__(engine_id, cloning=cloning)
        self.closed = 0

    def close(self) -> None:
        self.closed += 1


def test_the_command_reads_the_sentences_with_the_apps_engines_and_closes_them(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("LTTS_DATA_DIR", str(tmp_path / "data"))
    engines = [ClosingEngine("kokoro"), ClosingEngine("chatterbox", cloning=True)]
    wired = container.build_services

    def with_fake_engines(settings: Settings) -> container.Services:
        return wired(settings, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines))

    monkeypatch.setattr(container, "build_services", with_fake_engines)
    sentences = tmp_path / "sentences.txt"
    sentences.write_text("The first line.\n\n   Is this the second?  \n", encoding="utf-8")
    reference = tmp_path / "me.wav"
    reference.write_bytes(wav_bytes(speech_like(2)))
    out = tmp_path / "comparison"
    argv = ["voice-ab", "compare", "kokoro:alpha", "chatterbox:alpha", "--sentences", str(sentences), "--out", str(out)]
    assert main([*argv, "--reference", str(reference), "--seed", "2", "--pace", "1.1"]) == 0
    printed = capsys.readouterr().out
    assert f"Wrote 4 clips to {out}." in printed and f"ltts voice-ab score {out} answers.json" in printed
    key = json.loads((out / "key.json").read_text("utf-8"))
    assert (key["A"], key["B"]) == ("kokoro:alpha", "chatterbox:alpha") and len(key["pairs"]) == 2
    for engine in engines:  # each voice read both sentences at the asked pace, then its engine was closed
        assert [(call[0], call[2]) for call in engine.calls] == [("The first line.", 1.1), ("Is this the second?", 1.1)]
        assert engine.closed == 1
    with (out / "metrics.csv").open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 4 and all(0 < float(row["similarity"]) <= 1 for row in rows)  # measured against me.wav
    # Without a reference or a folder of its own, nothing is measured and the comparison lands in the data dir.
    assert main(["voice-ab", "compare", "kokoro:alpha", "chatterbox:alpha", "--sentences", str(sentences)]) == 0
    folders = list((tmp_path / "data" / "comparisons").iterdir())
    assert len(folders) == 1 and (folders[0] / "listen.html").is_file()
    with (folders[0] / "metrics.csv").open(encoding="utf-8") as handle:
        assert all(row["similarity"] == "" for row in csv.DictReader(handle))


def test_the_default_sentences_are_not_in_the_recording_script() -> None:
    """A voice built or fine-tuned on the studio passages must be compared on text it has never read."""
    script = Path(__file__).parents[2] / "web" / "src" / "features" / "studio" / "session" / "passages.json"

    def words(text: str) -> list[str]:
        return re.sub(r"[^a-z ]", " ", text.lower().replace("'", "")).split()

    passages = " ".join(" ".join(words(p["text"])) for p in json.loads(script.read_text("utf-8")))
    for sentence in DEFAULT_SENTENCES:
        found = words(sentence)
        assert not any(" ".join(found[i : i + 5]) in passages for i in range(len(found) - 4)), sentence
