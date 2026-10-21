# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the blind listening panel (``ltts voice-panel``).

Scope: The panel hides which voice is which (shuffled per item, repeatable from a seed, no voice
names on the page), rejects mismatched clips, and scoring unblinds ratings, best picks and garbled
marks, ignores malformed answers, and runs a paired sign test.
Does NOT belong: The two-voice A/B tool (test_voice_ab.py) or synthesis.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from ltts.cli import main
from ltts.voices import listening_panel as panel

ITEMS = [panel.Item("narration", "The ferry left at dawn."), panel.Item("question", "Will anyone notice?")]


def _clips(tmp_path: Path, voices: tuple[str, ...]) -> dict[str, list[Path]]:
    clips: dict[str, list[Path]] = {}
    for voice in voices:
        folder = tmp_path / "clips" / voice
        folder.mkdir(parents=True)
        clips[voice] = []
        for number in range(1, len(ITEMS) + 1):
            path = folder / f"item-{number:02d}.wav"
            sf.write(path, np.full(240, len(clips) / 10, dtype=np.float32), 24_000)
            clips[voice].append(path)
    return clips


def test_the_panel_hides_which_voice_is_which(tmp_path: Path) -> None:
    clips = _clips(tmp_path, ("quick", "studio", "tuned"))
    key = panel.make(tmp_path / "panel", ITEMS, clips, seed=3)
    assert key == panel.make(tmp_path / "again", ITEMS, clips, seed=3)  # repeatable
    page = (tmp_path / "panel" / "listen.html").read_text("utf-8")
    assert all(name not in page for name in ("quick", "studio", "tuned"))
    assert "The ferry left at dawn." in page and "<script>" in page
    for item, labels in key["items"].items():
        assert sorted(labels.values()) == ["quick", "studio", "tuned"]
        for label, voice in labels.items():  # each numbered clip is that voice's clip for the item
            copied = sf.read(tmp_path / "panel" / f"item-{int(item):02d}-{label}.wav")[0]
            assert np.array_equal(copied, sf.read(clips[voice][int(item) - 1])[0])
    with pytest.raises(ValueError, match="one clip per item"):
        panel.make(tmp_path / "bad", ITEMS, {"a": clips["quick"], "b": clips["studio"][:1]})


def test_scoring_unblinds_ratings_best_picks_and_a_sign_test(tmp_path: Path) -> None:
    key = panel.make(tmp_path / "panel", ITEMS, _clips(tmp_path, ("quick", "studio")))
    answers: dict[str, object] = {}
    for item, labels in key["items"].items():
        for label, voice in labels.items():
            answers[f"i{item}-{label}-like"] = "5" if voice == "studio" else "2"
            answers[f"i{item}-{label}-natural"] = "4" if voice == "studio" else "3"
            answers[f"i{item}-{label}-garbled"] = voice == "quick"
        answers[f"i{item}-best"] = next(label for label, voice in labels.items() if voice == "studio")
    answers["i1-1-like"] = "9"  # out of range: ignored
    answers["i9-1-best"] = "1"  # no such item: ignored
    file = tmp_path / "answers.json"
    file.write_text(json.dumps({"answers": answers}), "utf-8")
    scores, tests = panel.score(tmp_path / "panel", file, [("studio", "quick")])
    by_voice = {s.voice: s for s in scores}
    assert by_voice["studio"].best == 2 and by_voice["quick"].best == 0
    assert by_voice["quick"].garbled == 2 and by_voice["studio"].garbled == 0
    assert by_voice["studio"].natural == 4.0 and by_voice["quick"].natural == 3.0
    assert by_voice["studio"].rated + by_voice["quick"].rated == 3  # one likeness rating was out of range
    assert tests[0].wins >= 1 and tests[0].losses == 0
    assert "studio vs quick" in panel.summary(scores, tests)
    file.write_text("[1, 2]", "utf-8")  # not the page's shape: nothing counted
    scores, _ = panel.score(tmp_path / "panel", file)
    assert all(s.rated == 0 and s.best == 0 for s in scores)


def test_the_sign_test_is_exact() -> None:
    assert panel.sign_test(0, 0) == 1.0
    assert panel.sign_test(10, 0) == pytest.approx(2 / 1024, abs=1e-4)
    assert panel.sign_test(5, 5) == 1.0


def test_the_command_makes_and_scores_a_panel(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    clips = _clips(tmp_path, ("A", "C"))
    items = tmp_path / "items.json"
    items.write_text(json.dumps([{"kind": i.kind, "text": i.text} for i in ITEMS]), "utf-8")
    folder = tmp_path / "panel"
    voices = [f"--voice={name}={tmp_path / 'clips' / name}" for name in clips]
    assert main(["voice-panel", "make", str(folder), "--items", str(items), *voices]) == 0
    assert (folder / "listen.html").is_file()
    answers = tmp_path / "answers.json"
    answers.write_text(json.dumps({"answers": {}}), "utf-8")
    assert main(["voice-panel", "score", str(folder), str(answers), "--pair", "C:A"]) == 0
    assert "C vs A" in capsys.readouterr().out
    assert main(["voice-panel", "score", str(folder)]) == 2
    assert main(["voice-panel", "make", str(tmp_path / "unmade"), "--items", str(items), *voices[:1]]) == 2
    assert "at least two --voice" in capsys.readouterr().out and not (tmp_path / "unmade").exists()
