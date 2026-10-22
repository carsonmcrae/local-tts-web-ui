# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The one gate every detector output passes through, and the restraint that keeps few of them.

Scope: ``validate`` turns whatever a detector returned into a bounded list of ``Proposal`` records
(a sentence inside the analysed range, an event from the vocabulary, a confidence and a position
between 0 and 1, and for ambience the sentence it lasts to) and drops everything else: unknown
fields, unknown events, out-of-range numbers, NaN, strings, nested data, and anything beyond the
first few thousand items. ``choose`` then applies an intensity's limits: a lowest confidence, a
distance between any two effects and between two of the same event, a cap per hundred sentences,
one effect per sentence, no ambience over another, and nothing where the document already has an
effect of that event (dismissed ones included, so a rejected suggestion never returns).
Does NOT belong: Finding events (``detect.py``), sounds (``catalogue.py``) or storage (``store.py``).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from ltts.sfx.events import EVENT_IDS
from ltts.sfx.events import event as event_of

Intensity = Literal["minimal", "balanced", "immersive"]
MAX_PROPOSALS = 300  # kept after validation, the surest first
MAX_RAW = 5_000  # items of a detector's output looked at
COVERED_SPAN = 2  # an effect of the same event this close is the same moment


@dataclass(frozen=True, slots=True)
class Limits:
    threshold: float  # the lowest confidence kept
    spacing: int  # sentences between any two effects
    same_spacing: int  # sentences between two effects of the same event
    per_hundred: float  # suggestions per hundred sentences, at most
    loop_sentences: int  # the longest ambience, in sentences
    loop_seconds: int  # and in seconds, enforced by the player


LIMITS: dict[str, Limits] = {
    "minimal": Limits(0.8, 10, 40, 3, 12, 90),
    "balanced": Limits(0.65, 5, 20, 6, 20, 150),
    "immersive": Limits(0.5, 2, 8, 12, 30, 240),
}


class Proposal(BaseModel):
    """One candidate effect, as a detector may describe it and nothing more."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    index: int = Field(ge=0, le=10_000_000)
    event: str = Field(min_length=1, max_length=40)
    confidence: float = Field(ge=0.0, le=1.0, allow_inf_nan=False)
    fraction: float = Field(default=0.0, ge=0.0, le=1.0, allow_inf_nan=False)
    until: int | None = Field(default=None, ge=0, le=10_000_000)

    @field_validator("event")
    @classmethod
    def _known_event(cls, value: str) -> str:
        if value not in EVENT_IDS:
            raise ValueError("not an event in the vocabulary")
        return value

    @model_validator(mode="after")
    def _ambience_runs_forward(self) -> Proposal:
        if self.until is not None and (not event_of(self.event).loop or self.until < self.index):
            raise ValueError("only ambience lasts to a later sentence")
        return self


class Spot(Protocol):
    """Where an effect is: a proposal or one already in the document."""

    @property
    def index(self) -> int: ...
    @property
    def event(self) -> str: ...
    @property
    def until(self) -> int | None: ...


@dataclass(frozen=True, slots=True)
class Placed:
    """An effect the document already has (any status), as ``choose`` needs to know it."""

    index: int
    event: str
    until: int | None = None
    dismissed: bool = False


def validate(raw: object, first: int, last: int) -> list[Proposal]:
    """Whatever a detector returned, as proposals inside sentences ``first``..``last``; the rest is dropped."""
    if not isinstance(raw, list):
        return []
    kept: list[Proposal] = []
    for item in raw[:MAX_RAW]:
        try:
            proposal = Proposal.model_validate(item)
        except ValidationError:
            continue
        if first <= proposal.index <= last and (proposal.until is None or proposal.until <= last):
            kept.append(proposal)
    kept.sort(key=lambda proposal: (-proposal.confidence, proposal.index))
    return kept[:MAX_PROPOSALS]


def _overlaps(one: Spot, other: Spot) -> bool:
    return one.until is not None and other.until is not None and one.index <= other.until and other.index <= one.until


def _same_moment(proposal: Spot, placed: Placed) -> bool:
    if placed.event != proposal.event:
        return False
    inside = placed.until is not None and placed.index <= proposal.index <= placed.until
    return inside or abs(placed.index - proposal.index) <= COVERED_SPAN


def _crowds(proposal: Spot, other: Spot, limits: Limits) -> bool:
    gap = abs(other.index - proposal.index)
    if gap < limits.spacing or (other.event == proposal.event and gap < limits.same_spacing):
        return True
    return _overlaps(proposal, other)


def choose(
    proposals: Sequence[Proposal], limits: Limits, existing: Sequence[Placed], sentence_count: int
) -> list[Proposal]:
    """The few proposals worth suggesting under ``limits``, in reading order."""
    cap = max(1, round(limits.per_hundred * sentence_count / 100))
    kept = [placed for placed in existing if not placed.dismissed]
    chosen: list[Proposal] = []
    for proposal in sorted(proposals, key=lambda item: (-item.confidence, item.index)):
        if len(chosen) >= cap or proposal.confidence < limits.threshold:
            break
        if any(_same_moment(proposal, placed) for placed in existing):
            continue
        others: list[Spot] = [*chosen, *kept]
        if any(_crowds(proposal, other, limits) for other in others):
            continue
        until = None if proposal.until is None else min(proposal.until, proposal.index + limits.loop_sentences)
        chosen.append(proposal.model_copy(update={"until": until}))
    return sorted(chosen, key=lambda item: item.index)
