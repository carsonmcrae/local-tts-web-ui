# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Word patterns that name audible events in prose, with how sure each one is.

Scope: For every event in the vocabulary, regular expressions over one sentence's narration: a noun
and a verb near each other ("thunder rumbled", "a knock at the door"), a set phrase ("clap of
thunder") or, with low confidence, the noun alone (only an immersive setting keeps those). Each
group names the key words a sentence must contain before its patterns are tried, which keeps a
long chapter quick. Also the phrases that say an ambience has ended ("the rain stopped").
The groups live in one module per category; this package joins them for ``detect.py``.
Does NOT belong: Context rules, choosing between sentences or the vocabulary itself (``events.py``).
"""

from __future__ import annotations

from ltts.sfx.lexicon import animals, doors, footsteps, household, impacts, nature, places, weather
from ltts.sfx.lexicon._shared import FAINT, LIKELY, MAYBE, SURE, Group, Rule, near
from ltts.sfx.lexicon.stops import STOPS

GROUPS: tuple[Group, ...] = (
    *weather.GROUPS,
    *nature.GROUPS,
    *animals.GROUPS,
    *doors.GROUPS,
    *footsteps.GROUPS,
    *household.GROUPS,
    *impacts.GROUPS,
    *places.GROUPS,
)

__all__ = ["FAINT", "GROUPS", "LIKELY", "MAYBE", "STOPS", "SURE", "Group", "Rule", "near"]
