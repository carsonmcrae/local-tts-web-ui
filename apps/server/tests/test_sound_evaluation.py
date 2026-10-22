# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""
Purpose: Measure the detector against the labelled corpus, so restraint is a number, not a hope.
Scope: Precision, recall and the false-positive rate per kind of writing at each intensity's
  threshold (the table prints with ``pytest -s``); the Minimal and Balanced settings must suggest
  nothing wrong anywhere in the corpus, Balanced must still find most literal events, and Immersive
  may leak only a little. A sentence counts as right when any acceptable event is found, wrong when
  an event is found where none belongs or only the wrong one is, and missed when nothing is.
Does NOT belong: The passages (sfx_corpus.py) or rule-level cases (test_sound_detection.py).
"""

from __future__ import annotations

from dataclasses import dataclass

from ltts.sfx.detect import Sentence, detect
from ltts.sfx.proposals import LIMITS, validate
from sfx_corpus import CORPUS

SILENT_KINDS = ("metaphor and simile", "negated events", "recollection", "repeated actions", "nonfiction")


@dataclass(frozen=True)
class Score:
    sentences: int
    positives: int
    right: int
    wrong: int
    missed: int

    @property
    def precision(self) -> float:
        return self.right / (self.right + self.wrong) if self.right + self.wrong else 1.0

    @property
    def recall(self) -> float:
        return self.right / self.positives if self.positives else 1.0

    @property
    def false_rate(self) -> float:
        return self.wrong / self.sentences


def score(kind: str, threshold: float) -> tuple[Score, list[str]]:
    """The detector's score on one kind of writing, and each sentence it got wrong or missed."""
    sentences: list[Sentence] = []
    labels: list[set[str]] = []
    for paragraph, labelled in enumerate(CORPUS[kind]):
        for text, expected in labelled:
            sentences.append(Sentence(len(sentences), paragraph, False, text))
            labels.append(expected)
    found: dict[int, set[str]] = {}
    for proposal in validate(detect(sentences, 20), 0, len(sentences) - 1):
        if proposal.confidence >= threshold:
            found.setdefault(proposal.index, set()).add(proposal.event)
    right = wrong = missed = 0
    notes: list[str] = []
    for index, expected in enumerate(labels):
        got = found.get(index, set())
        if expected and got & expected:
            right += 1
        elif got:
            wrong += 1
            notes.append(f"wrong: {sentences[index].text!r} -> {sorted(got)}")
        elif expected:
            missed += 1
            notes.append(f"missed: {sentences[index].text!r}")
    return Score(len(labels), sum(1 for e in labels if e), right, wrong, missed), notes


def table(threshold: float) -> dict[str, tuple[Score, list[str]]]:
    scores = {kind: score(kind, threshold) for kind in CORPUS}
    print(f"\nthreshold {threshold}")
    for kind, (result, _) in scores.items():
        print(
            f"  {kind:24} sentences={result.sentences:3} events={result.positives:2} right={result.right:2} "
            f"wrong={result.wrong:2} missed={result.missed:2} P={result.precision:.2f} R={result.recall:.2f}"
        )
    return scores


def overall(scores: dict[str, tuple[Score, list[str]]]) -> Score:
    parts = [result for result, _ in scores.values()]
    return Score(
        sum(p.sentences for p in parts),
        sum(p.positives for p in parts),
        sum(p.right for p in parts),
        sum(p.wrong for p in parts),
        sum(p.missed for p in parts),
    )


def test_the_corpus_is_varied_and_labelled_with_real_events() -> None:
    assert len(CORPUS) == 10
    total = overall({kind: score(kind, 2.0) for kind in CORPUS})  # a threshold nothing reaches: counts only
    assert total.sentences >= 120 and 40 <= total.positives <= 60


def test_minimal_and_balanced_suggest_nothing_wrong() -> None:
    for name in ("minimal", "balanced"):
        scores = table(LIMITS[name].threshold)
        wrong = [note for _, notes in scores.values() for note in notes if note.startswith("wrong")]
        assert wrong == [], (name, wrong)
        for kind in SILENT_KINDS:
            assert scores[kind][0].wrong == 0, (name, kind)


def test_balanced_still_finds_most_literal_events() -> None:
    scores = table(LIMITS["balanced"].threshold)
    total = overall(scores)
    assert total.recall >= 0.9, [note for _, notes in scores.values() for note in notes]
    for kind in ("literal events", "fantasy and adventure", "mystery and suspense"):
        assert scores[kind][0].recall == 1.0, (kind, scores[kind][1])


def test_immersive_leaks_little_and_only_figuratively() -> None:
    scores = table(LIMITS["immersive"].threshold)
    total = overall(scores)
    assert total.precision >= 0.9 and total.false_rate <= 0.03, [n for _, notes in scores.values() for n in notes]
    for kind in SILENT_KINDS:
        assert scores[kind][0].wrong == 0, (kind, scores[kind][1])
