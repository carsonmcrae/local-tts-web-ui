# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: How far a studio session has come, measured by what the voice will actually use.

Scope: A studio voice (Chatterbox Turbo, zero-shot: no model is trained) takes its sound from one take,
its rhythm per speaking style from up to three takes of matching passages, and two embeddings averaged
over every take, which settle after about twelve clean takes (docs/research/studio-voice-audit.md). So
the tier is: starting (not enough to build), foundation (an early voice can be built), developing (the
averaged sound has settled) or complete (every speaking style has its three takes and one take is clean
and long enough to give the voice its sound: more passages would not change it). How many passages that
takes depends on the recordings, not a fixed number. Also each style's coverage, the passages that would
help most next, and advice when the audio itself, not more passages, is what would help.
Does NOT belong: Storing takes (``sessions.py``) or choosing a voice's style prompts (``styles.py``).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal, Protocol

from ltts.common import ApiModel
from ltts.voices.quality import QualityReport
from ltts.voices.styles import FOUNDATION_NUMBER, PROMPTS_PER_STYLE, STYLE_SOURCES, prompt_for_number, teaches

SETTLED_TAKES = 12  # clean takes after which the averaged speaker hardly moves (0.997 of a 42-take average)
STYLE_SNR_DB = 12.0  # a take noisier than this never teaches a style (``styles.style_prompts``)
SUGGESTIONS = 3
SOUND_SNR_DB = 20.0  # the take a voice's sound comes from should be at least this clean...
SOUND_SPEECH_S = 6.0  # ...and this long (the build prefers such takes: ``studio.MIN_PROMPT_SPEECH_S``)
JUDGE_AFTER = 4  # takes recorded before the session judges the recording setup
# starting: not enough to build yet; foundation: an early voice; developing: its sound has settled;
# complete: every speaking style has the takes it uses
Tier = Literal["starting", "foundation", "developing", "complete"]
# noisy_takes: most takes are too noisy to use, so better audio would help, not more passages;
# no_sound_take: no take is clean and long enough to give the voice its sound yet
Advice = Literal["noisy_takes", "no_sound_take"]
PASSAGE_IDS = tuple(
    pid for n in (FOUNDATION_NUMBER, *range(1, FOUNDATION_NUMBER)) if (pid := prompt_for_number(n)) is not None
)


class Recorded(Protocol):
    @property
    def prompt_id(self) -> str | None: ...
    @property
    def quality(self) -> QualityReport: ...


class StyleCoverage(ApiModel):
    """How many clean takes can teach one speaking style (narration, question, lively, dialogue, calm)."""

    style: str
    takes: int
    needed: int = PROMPTS_PER_STYLE  # a style prompt joins this many takes; more aren't used


def _clean(takes: Sequence[Recorded]) -> list[Recorded]:
    return [take for take in takes if take.quality.ok and take.quality.snr_db >= STYLE_SNR_DB]


def coverage(takes: Sequence[Recorded]) -> list[StyleCoverage]:
    clean = _clean(takes)
    return [
        StyleCoverage(style=style, takes=sum(teaches(take.prompt_id, style) for take in clean))
        for style in STYLE_SOURCES
    ]


def settled(takes: Sequence[Recorded]) -> bool:
    return len(_clean(takes)) >= SETTLED_TAKES


def covered(styles: Sequence[StyleCoverage]) -> bool:
    return all(style.takes >= style.needed for style in styles)


def has_sound_take(takes: Sequence[Recorded]) -> bool:
    """Whether one take is clean and long enough for the voice to take its sound from."""
    return any(
        t.quality.ok and t.quality.snr_db >= SOUND_SNR_DB and t.quality.speech_s >= SOUND_SPEECH_S for t in takes
    )


def advice(takes: Sequence[Recorded]) -> Advice | None:
    """When the recordings themselves, not more of them, are what would improve the voice."""
    if len(takes) >= JUDGE_AFTER and len(_clean(takes)) < len(takes) / 2:
        return "noisy_takes"
    if settled(takes) and not has_sound_take(takes):
        return "no_sound_take"
    return None


def tier(takes: Sequence[Recorded], can_build: bool) -> Tier:
    if not can_build:
        return "starting"
    if covered(coverage(takes)) and settled(takes) and has_sound_take(takes):
        return "complete"
    return "developing" if settled(takes) else "foundation"


def _sources(style: str) -> list[str]:
    """The passages that teach ``style``, in the order the voice prefers them."""
    found: list[str] = []
    for source in STYLE_SOURCES[style]:
        found += [pid for pid in PASSAGE_IDS if (pid == source or pid.startswith(f"{source}-")) and pid not in found]
    return found


def _add_missing(style: StyleCoverage, done: set[str | None], wanted: list[str]) -> None:
    """Add to ``wanted`` the passages that would give ``style`` the clean takes it still needs, while there is room."""
    missing = style.needed - style.takes
    for pid in _sources(style.style):
        if missing <= 0 or len(wanted) >= SUGGESTIONS:
            return
        if pid not in done and pid not in wanted:
            wanted.append(pid)
            missing -= 1


def suggestions(takes: Sequence[Recorded]) -> list[str]:
    """The passages (ids) that would add most to the voice next: the foundation, then missing style takes.

    None while most takes are noisy (better audio would help, not more passages); the foundation again
    when no take is clean and long enough to give the voice its sound.
    """
    trouble = advice(takes)
    if trouble == "noisy_takes":
        return []
    done = {take.prompt_id for take in _clean(takes)}
    wanted: list[str] = [] if "foundation" in done and trouble is None else ["foundation"]
    for style in coverage(takes):
        _add_missing(style, done, wanted)
    if not settled(takes):  # a few more of anything clean steady the voice's sound
        wanted += [pid for pid in PASSAGE_IDS if pid not in done and pid not in wanted]
    return wanted[:SUGGESTIONS]
