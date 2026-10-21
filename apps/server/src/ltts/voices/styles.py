# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Speaking styles for studio voices: which takes teach each one, and which a sentence needs.

Scope: Chatterbox Turbo takes its rhythm and inflection from a 15 s prompt, so one prompt makes every
sentence sound the same. A studio voice therefore keeps a small style prompt per kind of sentence —
narration, questions, lively lines and dialogue — built from the session's takes of matching
passages (best first: long, clean, varied in pitch and typical of the speaker); the engine picks a
sentence's style from its punctuation (``cloned_speech.sentence_style``), so a question rises like
the speaker's own questions. Also maps take numbers back to the passages they read (for voices saved before
styles existed) and to those passages' words (``passages.json``, a copy of the recording script the web app shows,
for fine-tuning), and builds the styles with a cloning engine.
Does NOT belong: The worker's token extraction (``ltts_chatterbox_worker.studio``), the build job
(``studio.py``) or synthesis (the engine).
"""

from __future__ import annotations

import functools
import hashlib
import json
import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from ltts.engines.base import VoiceBuilder
from ltts.engines.cloned_speech import NARRATION
from ltts.voices.quality import QualityReport

log = logging.getLogger("ltts.voices.styles")
# The passages (exact ids) and passage groups that teach each style, the best-suited first. Measured on
# a real session, calm conversation takes made dialogue flatter, so dialogue prefers the animated lines.
STYLE_SOURCES: dict[str, tuple[str, ...]] = {
    NARRATION: ("foundation", "narration", "storytelling", "calm-and-reflective"),
    "question": (
        *(f"questions-and-surprise-{n}" for n in (2, 3, 5, 7, 6)),  # questions from start to end
        "questions-and-surprise",
        "conversation",
    ),
    "lively": (
        *(f"questions-and-surprise-{n}" for n in (4, 8, 1)),  # exclamations
        "storytelling-1",
        "conversation-4",
        "storytelling",
        "questions-and-surprise",
    ),
    "dialogue": (
        "storytelling-1",
        "storytelling-3",
        "conversation-6",
        "conversation-2",
        "conversation-4",
        "conversation",
    ),
    "calm": ("calm-and-reflective", "narration"),  # asides, whispers and quiet lines
}
PROMPTS_PER_STYLE = 3  # joined until the 15 s prompt is full
# Passage groups in take-number order: takes 1-48 read the eight passages of each group in turn.
_GROUPS = (
    "narration",
    "storytelling",
    "conversation",
    "questions-and-surprise",
    "numbers-names-and-lists",
    "calm-and-reflective",
)
FOUNDATION_NUMBER = 49


def prompt_for_number(number: int) -> str | None:
    """The passage a take number read (for takes saved without one), or None for an imported take."""
    if number == FOUNDATION_NUMBER:
        return "foundation"
    if 1 <= number <= 8 * len(_GROUPS):
        return f"{_GROUPS[(number - 1) // 8]}-{(number - 1) % 8 + 1}"
    return None


@functools.cache
def _passages() -> dict[str, str]:
    data: dict[str, str] = json.loads(Path(__file__).with_name("passages.json").read_text(encoding="utf-8"))
    return data


def passage_text(prompt_id: str | None) -> str | None:
    """The words of a recorded passage (``narration-1``, ``foundation``…), or None for an unknown one."""
    return _passages().get(prompt_id) if prompt_id else None


@dataclass(frozen=True, slots=True)
class StyleTake:
    """A usable take as a style source: where it is, what it read, and how well it would teach a style."""

    path: Path
    prompt_id: str | None
    quality: QualityReport
    pitch_spread: float  # semitones; more rise and fall teaches more inflection
    typical: bool  # sounds like the session's speaker


def _score(take: StyleTake, style: str) -> float:
    q = take.quality
    lively = 1.5 if style != NARRATION else 0.5  # questions and lively lines need movement in the voice
    return min(q.speech_s, 12) / 12 + min(q.snr_db, 40) / 40 + lively * min(take.pitch_spread, 4) / 4 - q.pause_ratio


def _reads(prompt_id: str | None, source: str) -> bool:
    """Whether a take read ``source``: that exact passage, or any passage of that group."""
    return prompt_id is not None and (prompt_id == source or prompt_id.startswith(f"{source}-"))


def teaches(prompt_id: str | None, style: str) -> bool:
    """Whether a take of this passage can teach ``style`` (from any of the style's passage groups)."""
    return any(_reads(prompt_id, source) for source in STYLE_SOURCES[style])


def style_prompts(takes: Sequence[StyleTake], style: str) -> list[Path]:
    """The takes that teach ``style``, best first: from its preferred passage group, then the next ones."""
    usable = [t for t in takes if t.typical and t.quality.ok and t.quality.snr_db >= 12 and t.prompt_id]
    chosen: list[StyleTake] = []
    for group in STYLE_SOURCES[style]:
        members = [t for t in usable if _reads(t.prompt_id, group) and t not in chosen]
        chosen += sorted(members, key=lambda t: _score(t, style), reverse=True)
        if len(chosen) >= PROMPTS_PER_STYLE:
            break
    return [take.path for take in chosen[:PROMPTS_PER_STYLE]]


def build_styles(
    builder: VoiceBuilder,
    takes: Sequence[StyleTake],
    folder: Path,
    progress: Callable[[int, int], None] = lambda _done, _total: None,
) -> list[str]:
    """Build every style the takes can teach into ``folder`` (``<style>.safetensors``); returns their names."""
    folder.mkdir(parents=True, exist_ok=True)
    built: list[str] = []
    for done, style in enumerate(STYLE_SOURCES):
        progress(done, len(STYLE_SOURCES))
        prompts = style_prompts(takes, style)
        if not prompts:
            continue
        builder.build_style(prompts, folder / f"{style}.safetensors")
        built.append(style)
    log.info("voice styles built", extra={"styles": built})
    return built


def styles_in(folder: Path) -> dict[str, Path]:
    """The style files a voice has, by style name (only known styles)."""
    if not folder.is_dir():
        return {}
    return {path.stem: path for path in sorted(folder.glob("*.safetensors")) if path.stem in STYLE_SOURCES}


def styles_revision(styles: dict[str, Path]) -> str:
    """Changes whenever a voice's styles are built again, so audio made with the old ones is never reused."""
    digest = hashlib.sha256()
    for name, path in sorted(styles.items()):
        digest.update(f"{name}:{path.stat().st_size}:{path.stat().st_mtime_ns}".encode())
    return f"styles-{digest.hexdigest()[:12]}" if styles else ""
