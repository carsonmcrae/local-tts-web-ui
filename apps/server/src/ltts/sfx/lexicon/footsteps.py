# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Footsteps on wood, stone and gravel, and running.

Scope: Steps named by their surface (floorboards and stairs, cobbles and flagstones, gravel and leaves) or by a
verb of walking over it, and running; the key words every group shares are listed once.
Does NOT belong: Hooves (``animals.py``) or a thud when something falls (``impacts.py``).
"""

from __future__ import annotations

from ltts.sfx.lexicon._shared import (
    _A,
    _ADJ,
    _CRUNCHED,
    _GROUND,
    _LOOSE,
    _STEPS,
    _STONE,
    _WENT,
    _WOOD,
    FAINT,
    LIKELY,
    MAYBE,
    SURE,
    Group,
    _rule,
    near,
)

# The words of walking that every footsteps group looks for before trying its patterns.
_STEP_KEYS = (
    "footstep",
    "footfall",
    "feet",
    "step",
    "boot",
    "heel",
    "shoe",
    "tread",
    "pace",
    "walk",
    "strode",
    "stalk",
    "march",
    "stamp",
    "stomp",
    "tramp",
    "trudg",
    "crept",
    "tiptoe",
    "padded",
    "shuffl",
    "limp",
    "hobbl",
    "stagger",
    "lurch",
    "stumbl",
    "climb",
    "descend",
    "hurr",
    "stroll",
    "wander",
    "plod",
)

GROUPS: tuple[Group, ...] = (
    Group(
        "footsteps-wood",
        (*_STEP_KEYS,),
        (
            _rule(
                near(_STEPS, rf"(?:on|along|down|up|across|over|through|in|upon) (?:[\w-]+ ){{0,2}}(?:{_WOOD})"), LIKELY
            ),
            _rule(
                rf"\b(?:sound|sounds|creak|creaking|thud|thuds|thump|thumping|clump|clumping|tread|shuffle|shuffling|"
                rf"patter|pattering|scuff|scuffing|clatter|clattering|tramp|tramping|stamp|stamping|drum|drumming|"
                rf"rhythm|echo|echoes|beat) of {_A}{_ADJ}(?:footsteps|footfalls|feet|boots|heels|steps|someone walking|"
                rf"somebody walking|someone running|people walking|tread)\b",
                LIKELY,
            ),
            _rule(
                r"\b(?:footsteps|footfalls|steps|boots|heels|feet) (?:[\w-]+ ){0,2}(?:creaked|thudded|thumped|"
                r"clumped|clomped|pounded|sounded|came|went|approached|receded|passed|crossed|climbed|descended|"
                r"mounted|paced|shuffled|dragged|scuffed|padded|stomped|stamped|drummed|tramped|hurried|faded|died "
                r"away|grew louder|grew fainter|moved|returned|retreated|went by)\b",
                MAYBE,
            ),
            _rule(
                rf"\b(?:paced|pacing) (?:the |up and down the |back and forth across the |the length of the )"
                rf"(?:[\w-]+ )?(?:room|floor|hall|hallway|corridor|cabin|deck|study|office|chamber|library|parlour|"
                rf"parlor|landing|gallery)\b|\b(?:{_WENT}) (?:[\w-]+ ){{0,2}}(?:down|up|along|across|over|through|"
                rf"into|out of|onto) the (?:[\w-]+ )?(?:{_WOOD})\b",
                MAYBE,
            ),
        ),
    ),
    Group(
        "footsteps-stone",
        (
            *_STEP_KEYS,
            "hobnail",
            "echo",
        ),
        (
            _rule(
                near(
                    f"{_STEPS}|hobnails|sandals",
                    rf"(?:on|along|down|up|across|over|through|in|upon) (?:[\w-]+ ){{0,2}}"
                    rf"(?:{_STONE})",
                ),
                LIKELY,
            ),
            _rule(
                r"\b(?:footsteps|footfalls|steps|boots|heels|feet|hobnails|hobnailed boots) (?:[\w-]+ ){0,2}(?:echoed|"
                r"echoing|rang|ringing|clattered|clattering|clicked|clicking|slapped|slapping|scraped|scraping|"
                r"resounded|resounding|reverberated|reverberating|tapped|tapping|clacked|clacking)\b",
                LIKELY,
            ),
            _rule(
                rf"\b(?:echo|echoes|echoing|ring|ringing|clatter|clattering|click|clicking|clack|clacking|scrape|"
                rf"scraping|slap|slapping|tap|tapping|reverberation) of {_A}{_ADJ}(?:footsteps|footfalls|feet|boots|"
                rf"heels|steps|hobnails)\b",
                LIKELY,
            ),
            _rule(
                rf"\b(?:{_WENT}) (?:[\w-]+ ){{0,2}}(?:down|up|along|across|over|through|into|out of|onto|around|round) "
                rf"the (?:[\w-]+ )?(?:{_STONE})\b",
                MAYBE,
            ),
        ),
    ),
    Group(
        "footsteps-gravel",
        (
            *_STEP_KEYS,
            "crunch",
            "scrunch",
            "crackl",
            "rustl",
            "squelch",
            "trek",
            "hike",
            "slog",
            "wade",
            "way",
        ),
        (
            _rule(
                rf"\b(?:{_CRUNCHED})\b(?:\W+[\w-]+){{0,5}}\W+(?:{_LOOSE}|dead leaves|fallen leaves|dry leaves|pine "
                rf"needles|dust|earth|puddles|the path|the track|the trail|the drive|the driveway|the lane|the beach|"
                rf"the shore|the forest floor|the ground)\b",
                LIKELY,
            ),
            _rule(
                rf"\b(?:{_LOOSE}|dead leaves|dry leaves|pine needles)\b(?:\W+[\w-]+){{0,3}}\W+(?:{_CRUNCHED}|squeaked|"
                rf"squeaking|shifted|shifting|scattered|scattering|gave|slid|sliding|slipped)\b",
                LIKELY,
            ),
            _rule(
                near(_STEPS, rf"(?:on|along|down|up|across|over|through|in|upon) (?:[\w-]+ ){{0,2}}(?:{_GROUND})"),
                LIKELY,
            ),
            _rule(
                rf"\b(?:{_WENT}|trekked|hiked|slogged|waded|picked (?:his|her|their) way|made (?:his|her|their) way) "
                rf"(?:[\w-]+ ){{0,2}}(?:down|up|along|across|over|through|into|out of|onto|around|"
                rf"round|toward|towards) "
                rf"the (?:[\w-]+ )?(?:{_GROUND})\b",
                MAYBE,
            ),
        ),
    ),
    Group(
        "footsteps-run",
        (
            "footstep",
            "footfall",
            "feet",
            "run",
            "ran",
            "sprint",
            "dash",
            "rac",
            "bolt",
            "fled",
            "flee",
            "pelt",
            "hurtl",
            "charg",
            "scrambl",
            "scurr",
            "scamper",
            "rush",
            "sped",
            "gallop",
            "stampede",
            "took off",
            "heels",
            "pounding",
            "steps",
        ),
        (
            _rule(
                r"\b(?:running|pounding|racing|hurrying|flying|fleeing|rapid|quick|hasty|frantic|urgent|thundering) "
                r"(?:footsteps|footfalls|feet|steps)\b|\b(?:footsteps|footfalls|feet|steps) (?:[\w-]+ ){0,2}"
                r"(?:running|pounding|racing|hurrying|flying|sprinting|thundering|hammering|pelting|drumming|"
                r"galloping)\b",
                SURE,
            ),
            _rule(
                r"\b(?:ran|sprinted|dashed|raced|bolted|fled|pelted|hurtled|charged|tore|hared|scrambled|scurried|"
                r"scampered|rushed|sped|streaked|galloped|stampeded|took off|broke into a run|burst into a run|ran "
                r"for it|took to (?:his|her|their) heels) (?:[\w-]+ ){0,2}(?:down|along|across|up|through|into|out "
                r"of|toward|towards|back|away|off|after|past|over|around|round|from|for|to|between|behind|ahead|home|"
                r"on|onwards|onward|downstairs|upstairs|outside|inside|forward|forwards|headlong|flat out|full tilt|"
                r"like the|as fast)\b",
                MAYBE,
            ),
            _rule(
                r"\b(?:ran|running|sprinted|sprinting|dashed|dashing|raced|racing|bolted|fled|fleeing|pelted|hurtled|"
                r"charged|scrambled|scurried|rushed|sped|galloped)\b",
                FAINT,
            ),
        ),
    ),
)
