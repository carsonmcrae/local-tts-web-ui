# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Thunder, rain and wind.

Scope: Distant and close thunder (lightning counts a little), light and heavy rain, a gust and a howling wind;
rain and wind are ambience that lasts until a sentence says it stopped.
Does NOT belong: Water, fire and animals (``nature.py``, ``animals.py``) or the rules that drop metaphors
(``detect.py``).
"""

from __future__ import annotations

from ltts.sfx.lexicon._shared import _A, _ADJ, FAINT, LIKELY, MAYBE, Group, _rule, near

GROUPS: tuple[Group, ...] = (
    Group(
        "thunder-distant",
        ("thunder",),
        (
            _rule(
                near(
                    "thunder",
                    "rumbled|rolled|grumbled|muttered|growled|murmured|boomed|echoed|sounded|came|"
                    "answered|rumbling|rolling|grumbling|growling|muttering",
                ),
                LIKELY,
            ),
            _rule(rf"\b{_A}{_ADJ}(?:rumble|roll|growl|mutter|peal|boom|roar|grumble)s? of {_ADJ}thunder\b", LIKELY),
            _rule(r"\bthunder (?:in the distance|far away|far off|somewhere|beyond|over the|from the)\b", LIKELY),
            _rule(r"\b(?:distant|far-off|faint|faraway|low) thunder\b", LIKELY),
            _rule(r"\bthunder(?:ed)?\b", FAINT),
        ),
    ),
    Group(
        "thunder-close",
        ("thunder", "lightning"),
        (
            _rule(
                near(
                    "thunder",
                    "cracked|crashed|split|shook|exploded|broke|burst|smashed|deafened|clapped|"
                    "crashing|cracking|splitting|shaking",
                ),
                LIKELY,
            ),
            _rule(
                rf"\b{_A}{_ADJ}(?:clap|crack|crash|peal)s? of thunder\b|\bthunderclap\b|"
                rf"\bthunder (?:directly )?overhead\b",
                LIKELY,
            ),
            _rule(near("lightning", "struck|hit|split|forked|flashed|cracked|lit|flashing|forking"), FAINT),
        ),
    ),
    Group(
        "rain-light",
        ("rain", "drizzl", "shower"),
        (
            _rule(
                near(
                    "rain|drizzle|raindrops|rainfall|shower",
                    "fell|falling|pattered|pattering|tapped|tapping|dripped|"
                    "dripping|whispered|misted|ticked|streaked|began|started|came|spattered|spotted|trickled|"
                    "drummed softly|kept falling|was falling|were falling",
                ),
                LIKELY,
            ),
            _rule(
                r"\b(?:it|the sky|the clouds|the heavens) (?:was|were|had been|began|started|"
                r"kept) (?:raining|drizzling|"
                r"spitting)\b",
                LIKELY,
            ),
            _rule(rf"\b(?:patter|whisper|tick|hiss|drip|dripping|pattering|sound|murmur) of {_A}{_ADJ}rain\b", LIKELY),
            _rule(
                rf"\b{_A}(?:light|soft|gentle|steady|fine|thin|cold|grey|gray|warm|spring|summer|autumn|evening|"
                rf"morning|misty|persistent|quiet) (?:rain|drizzle|shower)\b",
                MAYBE,
            ),
            _rule(
                rf"\brain(?:drops)? (?:on|against|at|upon) {_A}{_ADJ}(?:roof|window|windows|glass|pane|panes|tent|"
                rf"canvas|leaves|water|tiles|slates|umbrella|hood)\b",
                LIKELY,
            ),
            _rule(r"\b(?:rain|drizzle|raining|drizzling)\b", FAINT),
        ),
    ),
    Group(
        "rain-heavy",
        ("rain", "downpour", "deluge", "storm", "cloudburst", "pouring", "bucketing", "teeming"),
        (
            _rule(
                near(
                    "rain|downpour|deluge|storm|rains|rainstorm",
                    "poured|pouring|lashed|lashing|hammered|hammering|"
                    "pounded|pounding|drummed|drumming|beat|battered|sheeted|roared|roaring|teemed|pelted|pelting|"
                    "came down|bucketed|streamed|thundered|slashed|drove|driving|raged|raging|hissed",
                ),
                LIKELY,
            ),
            _rule(
                rf"\b{_A}(?:heavy|driving|pouring|torrential|pounding|lashing|hammering|relentless|blinding|sheeting|"
                rf"drenching) (?:rain|downpour|storm)\b",
                LIKELY,
            ),
            _rule(
                r"\bit (?:was )?(?:pouring|bucketing|teeming|pelting|lashing)(?: down)?\b|"
                r"\brain(?:ed|ing)? in sheets\b|"
                r"\bsheets of rain\b|\bcats and dogs\b",
                LIKELY,
            ),
            _rule(rf"\b{_A}(?:downpour|cloudburst|deluge|rainstorm|thunderstorm)\b", MAYBE),
        ),
    ),
    Group(
        "wind-gust",
        ("gust", "wind", "breeze", "draught", "draft"),
        (
            _rule(
                rf"\b{_A}(?:sudden |cold |icy |chill |sharp |strong |fierce |warm |fresh |stray |violent |great )?gust"
                r"(?: of (?:wind|air))?\b",
                LIKELY,
            ),
            _rule(
                near(
                    "wind|breeze|draught|draft|air",
                    "gusted|swept|rushed|whipped|snatched|tugged|tore|burst|caught|"
                    "slammed|rattled|banged|flung|blew in|picked up|stirred|lifted|ruffled|billowed|plucked",
                ),
                MAYBE,
            ),
            _rule(
                r"\bthe wind (?:picked up|rose|got up|freshened|quickened|changed|shifted|veered)\b|"
                r"\b(?:rattled|shook) the (?:[\w-]+ )?(?:windows|shutters|panes|door|doors|glass)\b",
                MAYBE,
            ),
        ),
    ),
    Group(
        "wind-howl",
        ("wind", "gale", "blizzard", "storm"),
        (
            _rule(
                near(
                    "wind|gale|blizzard|storm|winds",
                    "howled|howling|moaned|moaning|whistled|whistling|wailed|wailing|"
                    "screamed|screaming|shrieked|shrieking|keened|keening|sighed|sighing|roared|roaring|whined|"
                    "whining|hissed|sang|droned|buffeted|raged|raging|tore at|blew hard|blew harder",
                ),
                LIKELY,
            ),
            _rule(
                r"\b(?:howl|howling|moan|moaning|whistle|whistling|wail|wailing|scream|screaming|shriek|roar|sigh|"
                r"sighing|keening|song|voice) of the (?:wind|gale|storm|blizzard)\b",
                LIKELY,
            ),
            _rule(
                r"\bthe wind (?:blew|was blowing|was up|never (?:stopped|let up))\b|"
                r"\b(?:a |the )(?:bitter|biting|cutting|fierce|cold|high|strong|steady|relentless|freezing) wind\b",
                MAYBE,
            ),
            _rule(r"\b(?:windy|the wind|a gale|the gale)\b", FAINT),
        ),
    ),
)
