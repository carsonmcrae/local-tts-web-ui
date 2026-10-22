# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Water, fire, insects and birds.

Scope: A running stream, waves on a shore, a crackling fire, crickets at night and birdsong; all but birdsong
are ambience.
Does NOT belong: Weather (``weather.py``) or named animals (``animals.py``).
"""

from __future__ import annotations

from ltts.sfx.lexicon._shared import _A, _ADJ, FAINT, LIKELY, MAYBE, Group, _rule, near

# The words a sentence must contain before the stream patterns are tried.
_WATER_WORDS = (
    "stream",
    "brook",
    "creek",
    "river",
    "water",
    "rapids",
    "waterfall",
    "spring",
    "current",
)

GROUPS: tuple[Group, ...] = (
    Group(
        "stream",
        _WATER_WORDS,
        (
            _rule(
                near(
                    "stream|brook|creek|river|water|rapids|waterfall|spring|rill|beck|current",
                    "babbled|babbling|"
                    "gurgled|gurgling|burbled|burbling|chattered|chattering|trickled|trickling|murmured|murmuring|"
                    "rushed|rushing|tumbled|tumbling|splashed|splashing|flowed|flowing|rippled|rippling|ran|"
                    "running|chuckled|sang|singing|purled|plashed|cascaded|roared|gushed",
                ),
                LIKELY,
            ),
            _rule(
                rf"\b(?:gurgle|gurgling|babble|babbling|murmur|rush|rushing|trickle|trickling|chatter|song|sound|"
                rf"roar|splash|splashing|ripple|rippling) of {_A}{_ADJ}(?:water|stream|brook|creek|river|waterfall|"
                rf"rapids|spring|current)\b",
                LIKELY,
            ),
            _rule(r"\b(?:running|flowing|rushing|moving|falling|tumbling) water\b", MAYBE),
        ),
    ),
    Group(
        "waves",
        ("wave", "surf", "sea", "ocean", "tide", "breakers", "swell"),
        (
            _rule(
                near(
                    "waves|wave|surf|sea|ocean|tide|breakers|swell",
                    "crashed|crashing|lapped|lapping|broke|breaking|"
                    "rolled|rolling|pounded|pounding|hissed|hissing|washed|washing|boomed|booming|roared|roaring|"
                    "slapped|slapping|surged|surging|thundered|thundering|sucked|dragged|foamed|slopped|sloshed|"
                    "beat|smashed|murmured|sighed|whispered",
                ),
                LIKELY,
            ),
            _rule(
                rf"\b(?:crash|crashing|roar|roaring|hiss|hissing|wash|washing|lap|lapping|boom|booming|rumble|"
                rf"thunder|sound|murmur|suck|drag|pull|rush|sigh) of {_A}{_ADJ}(?:waves|surf|sea|ocean|breakers|tide|"
                rf"swell)\b",
                LIKELY,
            ),
            _rule(r"\b(?:the )?(?:waves|surf|breakers)\b", FAINT),
        ),
    ),
    Group(
        "fire-crackle",
        ("fire", "flame", "log", "hearth", "ember", "coals", "kindling", "brazier", "stove", "torch", "blaze"),
        (
            _rule(
                near(
                    "fire|flames|flame|logs|log|hearth|embers|coals|campfire|bonfire|kindling|fireplace|brazier|stove|"
                    "torches|torch|blaze",
                    "crackled|crackling|popped|popping|snapped|snapping|hissed|hissing|spat|"
                    "spitting|spluttered|sputtered|sputtering|roared|roaring|blazed|blazing|burned|burning|burnt|"
                    "settled|shifted|guttered|flickered|leapt|leaped|danced|smouldered|smoldered|glowed",
                ),
                LIKELY,
            ),
            _rule(
                rf"\b(?:crackle|crackling|pop|popping|snap|snapping|hiss|hissing|roar|roaring|spit|spitting|glow|"
                rf"warmth|light|heat) of {_A}{_ADJ}(?:fire|flames|logs|hearth|embers|coals|campfire|bonfire|torches|"
                rf"stove|brazier)\b",
                LIKELY,
            ),
            _rule(
                rf"\b{_A}(?:fire|hearth|stove|campfire|bonfire) (?:was |were )?(?:burning|lit|blazing|alight|going|"
                rf"roaring)\b|\b(?:lit|built|stoked|fed|banked|kindled|made|started) (?:a |the |up the )?(?:fire|"
                rf"campfire|bonfire)\b",
                MAYBE,
            ),
            _rule(r"\b(?:fire|flames|hearth|campfire|bonfire)\b", FAINT),
        ),
    ),
    Group(
        "crickets",
        ("cricket", "cicada", "insect", "frog", "katydid", "grasshopper"),
        (
            _rule(
                near(
                    "crickets|cricket|cicadas|cicada|insects|frogs|bullfrogs|katydids|grasshoppers",
                    "chirped|chirping|"
                    "chirruped|sang|singing|trilled|trilling|shrilled|hummed|humming|buzzed|buzzing|droned|droning|"
                    "whirred|whirring|called|calling|croaked|croaking|thrummed|pulsed|sawed|rasped|screamed",
                ),
                LIKELY,
            ),
            _rule(
                rf"\b(?:chirp|chirping|chirrup|song|singing|drone|droning|buzz|buzzing|whirr|whir|hum|humming|trill|"
                rf"trilling|chorus|croak|croaking|pulse|rasp|scream) of {_A}{_ADJ}(?:crickets|cicadas|insects|frogs|"
                rf"bullfrogs|katydids|the night)\b",
                LIKELY,
            ),
            _rule(r"\bcrickets\b|\bcicadas\b", FAINT),
        ),
    ),
    Group(
        "birdsong",
        (
            "bird",
            "sparrow",
            "robin",
            "lark",
            "thrush",
            "blackbird",
            "wren",
            "finch",
            "starling",
            "swallow",
            "nightingale",
            "warbler",
            "cuckoo",
            "dove",
            "pigeon",
            "gull",
            "crow",
            "rook",
            "jay",
            "magpie",
            "geese",
            "duck",
            "chicken",
            "hen",
            "rooster",
            "cockerel",
            "chorus",
        ),
        (
            _rule(
                near(
                    "birds|bird|sparrows|sparrow|robins|robin|larks|lark|thrush|thrushes|blackbird|blackbirds|wrens|"
                    "wren|finches|finch|songbirds|songbird|starlings|swallows|nightingale|nightingales|warblers|"
                    "warbler|cuckoo|doves|dove|pigeons|gulls|seagulls|crows|rooks|jays|magpies|geese|ducks|chickens|"
                    "hens|rooster|cockerel",
                    "sang|singing|chirped|chirping|twittered|twittering|trilled|trilling|"
                    "warbled|warbling|called|calling|chattered|chattering|piped|piping|cried|crying|screamed|"
                    "screeching|cawed|cawing|cooed|cooing|chirruped|whistled|whistling|squawked|squawking|honked|"
                    "honking|quacked|clucked|crowed|crowing|chorused|shrieked|wheeled",
                ),
                LIKELY,
            ),
            _rule(
                rf"\bbirdsong\b|\b(?:dawn|morning|evening) chorus\b|\b(?:song|singing|chirping|twitter|twittering|"
                rf"call|calls|calling|cry|cries|chatter|chattering|screech|screeching|caw|cawing|coo|cooing) of "
                rf"{_A}{_ADJ}(?:birds|bird|sparrows|robins|larks|lark|thrushes|thrush|blackbirds|blackbird|gulls|"
                rf"seagulls|crows|rooks|doves|pigeons|geese|nightingale|cuckoo)\b",
                LIKELY,
            ),
            _rule(r"\b(?:birds|birdsong)\b", FAINT),
        ),
    ),
)
