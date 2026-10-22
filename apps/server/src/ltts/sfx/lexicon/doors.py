# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Doors, gates and shutters.

Scope: Creaking (also floorboards, stairs and rigging), closing with a latch, slamming and bursting open, and
knocking; "opened the door" alone is only a faint hint.
Does NOT belong: Footsteps through doorways (``footsteps.py``) or glass breaking (``impacts.py``).
"""

from __future__ import annotations

from ltts.sfx.lexicon._shared import _A, _ADJ, _DOOR, FAINT, LIKELY, MAYBE, SURE, Group, _rule, near

GROUPS: tuple[Group, ...] = (
    Group(
        "door-creak",
        (
            "creak",
            "groan",
            "squeal",
            "squeak",
            "whine",
            "protest",
            "grat",
            "hinge",
            "door",
            "gate",
            "shutter",
            "hatch",
        ),
        (
            _rule(
                near(
                    f"{_DOOR}|hinge|hinges",
                    "creaked|creaking|groaned|groaning|squealed|squealing|squeaked|"
                    "squeaking|whined|whining|protested|protesting|complained|complaining|shrieked|screeched|"
                    "screeching|grated|grating|moaned|moaning|creak|creaks|groan|groans|squeak|squeaks|strained|"
                    "straining",
                ),
                LIKELY,
            ),
            _rule(
                rf"\b(?:creak|creaking|groan|groaning|squeal|squealing|squeak|squeaking|screech|screeching|whine|"
                rf"whining|complaint|protest|moan|moaning|grating) of {_A}{_ADJ}(?:{_DOOR}|hinge|hinges)\b",
                LIKELY,
            ),
            _rule(
                rf"\b{_A}{_ADJ}(?:{_DOOR}) (?:slowly |gently |silently |softly |very slowly |inch by inch )?(?:swung|"
                rf"drifted|eased|inched|crept|edged|scraped|grated|ground|juddered|shuddered|came) (?:open|ajar|"
                rf"inward|inwards|outward|outwards|wide|back)\b",
                MAYBE,
            ),
            _rule(
                rf"\b(?:opened|pushed open|pulled open|eased open|inched open|nudged open|"
                rf"prised open|pried open|forced "
                rf"open|cracked open) {_A}{_ADJ}(?:{_DOOR})\b|\b{_A}{_ADJ}(?:{_DOOR}) (?:opened|was opened|came open|"
                rf"stood open|hung open|was ajar)\b",
                FAINT,
            ),
        ),
    ),
    Group(
        "door-close",
        ("door", "gate", "lid", "hatch", "shutter", "window", "latch", "bolt", "lock", "key"),
        (
            _rule(
                rf"\b(?:click|clunk|thud|snick|snap|rattle|scrape|thunk) of {_A}{_ADJ}(?:latch|bolt|lock|key|{_DOOR}|"
                rf"closing door|door closing|door shutting)\b|\b{_A}(?:latch|bolt|lock|key) (?:clicked|turned|fell|"
                rf"dropped|snicked|rattled|scraped|slid|shot|ground|grated|was thrown|was shot)\b",
                LIKELY,
            ),
            _rule(
                near(
                    f"{_DOOR}|window|windows",
                    "clicked shut|swung shut|fell shut|drew shut|eased shut|pulled shut|"
                    "pushed shut|snapped shut|thudded shut|slid shut|rolled shut|clanged shut|closed softly|"
                    "closed quietly|closed gently|closed behind|shut behind|clicked to|swung to|came to|closed|shut|"
                    "latched|bolted|locked",
                ),
                MAYBE,
            ),
            _rule(
                rf"\b(?:closed|shut|pulled|pushed|drew|eased|slid|latched|bolted|locked|snicked|clicked) {_A}{_ADJ}"
                rf"(?:{_DOOR}|window|windows|latch|bolt|lock)(?: (?:behind|after|shut|closed|to|softly|quietly|gently|"
                rf"firmly|carefully|silently))?\b",
                MAYBE,
            ),
        ),
    ),
    Group(
        "door-slam",
        ("slam", "bang", "crash", "burst", "flung", "kick", "smash", "wrench", "threw", "thrown"),
        (
            _rule(
                near(
                    f"{_DOOR}|window|windows|screen door",
                    "slammed|slamming|banged|banging|crashed|crashing|burst open|"
                    "flew open|was flung open|was thrown open|was kicked open|was kicked in|smashed|smashing|exploded|"
                    "was torn open|was wrenched open|was ripped open|slam|slams|bang|bangs|crashed open|boomed|"
                    "rebounded|splintered|gave way",
                ),
                SURE,
            ),
            _rule(
                rf"\b(?:slammed|banged|kicked|flung|threw|hurled|wrenched|crashed|smashed|shouldered|rammed|booted|"
                rf"kicked in|kicked open|flung open|threw open|burst through|crashed through|smashed through|broke "
                rf"down|battered down|barged through|shouldered open) {_A}{_ADJ}(?:{_DOOR}|window|windows|screen "
                rf"door)\b|\b(?:slam|slamming|bang|banging|crash|crashing) of {_A}{_ADJ}(?:{_DOOR})\b",
                SURE,
            ),
        ),
    ),
    Group(
        "door-knock",
        ("knock", "rap", "tap", "pound", "hammer", "bang", "thump", "thud", "batter", "beat"),
        (
            _rule(
                rf"\b{_A}(?:[\w-]+ )?(?:knock|knocks|knocking|rap|rapping|raps|tap|tapping|taps|pounding|hammering|"
                rf"banging|thump|thumping|thud|thudding|thundering|beating|battering) (?:at|on|upon|against) {_A}{_ADJ}"
                rf"(?:{_DOOR}|window|windows|windowpane|pane|glass|wood|panel|panels|wall|frame|doorframe|front door|"
                rf"back door)\b",
                SURE,
            ),
            _rule(
                rf"\b(?:knocked|knocking|rapped|rapping|tapped|tapping|pounded|pounding|hammered|hammering|banged|"
                rf"banging|thumped|thumping|beat|battered|battering|drummed|drumming|thundered) (?:[\w-]+ ){{0,2}}"
                rf"(?:at|on|upon|against) {_A}{_ADJ}(?:{_DOOR}|window|windows|windowpane|pane|glass|wood|panel|panels|"
                rf"wall|frame|doorframe|front door|back door)\b",
                SURE,
            ),
            _rule(
                r"\bthere (?:was|came|had been) (?:a |another |the |an |the sound of |"
                r"a sound of )?(?:[\w-]+ )?(?:knock|"
                r"knocking|rap|rapping|tap|tapping|pounding|hammering|banging|thump|thumping)\b|\b(?:a |the )"
                r"(?:[\w-]+ )?(?:knock|knocking|rap|rapping) (?:came|sounded|echoed|rang|was repeated|came again)\b",
                LIKELY,
            ),
            _rule(
                r"\b(?:someone|somebody|a visitor|a caller|a hand|a fist|a stranger|the stranger|the caller|the "
                r"visitor|the butler|the maid|the landlord|the landlady|the neighbour|the neighbor|the police) (?:was |"
                r"were |began |started |kept )?(?:knocking|knocked|rapping|rapped|pounding|pounded|hammering|hammered|"
                r"tapping|tapped|banging|banged)\b",
                LIKELY,
            ),
        ),
    ),
)
