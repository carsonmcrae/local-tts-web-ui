# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Vehicles, crowds, the city and machines.

Scope: A passing car and a passing train (one-shots), and three ambiences: a murmuring crowd, a city in the
distance and humming machinery.
Does NOT belong: Horses and carts (``animals.py``) or the ending phrases of an ambience (``stops.py``).
"""

from __future__ import annotations

from ltts.sfx.lexicon._shared import (
    _A,
    _ADJ,
    _CROWD,
    _DROVE,
    _HUMMED,
    _MACHINES,
    _MURMURED,
    _RAN,
    _TRAINS,
    _VEHICLES,
    FAINT,
    LIKELY,
    Group,
    _rule,
    near,
)

GROUPS: tuple[Group, ...] = (
    Group(
        "car-pass",
        (
            "car",
            "truck",
            "lorr",
            "van",
            "bus",
            "taxi",
            "cab",
            "motor",
            "vehicle",
            "engine",
            "jeep",
            "convoy",
            "limo",
            "sedan",
            "saloon",
            "pickup",
            "tractor",
            "ambulance",
            "tank",
            "scooter",
            "moped",
            "headlight",
            "tyre",
            "tire",
            "brake",
            "exhaust",
            "traffic",
            "horn",
        ),
        (
            _rule(near(_VEHICLES, _DROVE), LIKELY),
            _rule(
                rf"\b(?:roar|roaring|hum|humming|growl|growling|rumble|rumbling|purr|purring|whine|whining|drone|"
                rf"droning|throb|throbbing|thrum|thrumming|cough|coughing|splutter|sputter|sputtering|rattle|rattling|"
                rf"clatter|clattering|hiss|hissing|squeal|squealing|screech|screeching|swish|swishing|whoosh|"
                rf"whooshing|sound|sounds|noise|noises|note|snarl|snarling|bellow|bellowing|revving|rev|revs|idle|"
                rf"idling|crunch|crunching|chug|chugging|judder|juddering|backfire|backfiring|blare|blaring|honk|"
                rf"honking|hoot|hooting|beep|beeping|toot|tooting|wail|wailing|whoop|whooping|siren|sirens) of "
                rf"{_A}{_ADJ}(?:{_VEHICLES}|horn|horns|car horns|traffic|passing cars|passing traffic|passing car|"
                rf"passing truck|passing lorry|passing van|passing bus)\b",
                LIKELY,
            ),
            _rule(
                r"\b(?:a |the )(?:[\w-]+ )?(?:car|truck|lorry|van|bus|taxi|cab|motorcycle|motorbike|jeep|ambulance|"
                r"tractor|convoy|engine|motor)\b",
                FAINT,
            ),
        ),
    ),
    Group(
        "train-pass",
        (
            "train",
            "locomotive",
            "carriage",
            "express",
            "subway",
            "underground",
            "tube",
            "tram",
            "streetcar",
            "trolley",
            "railway",
            "railroad",
            "rails",
            "tracks",
            "wagon",
            "boxcar",
            "steam",
            "sleeper",
            "diesel",
            "whistle",
        ),
        (
            _rule(near(_TRAINS, _RAN), LIKELY),
            _rule(
                rf"\b(?:rumble|rumbling|clatter|clattering|rattle|rattling|roar|roaring|whistle|whistling|scream|"
                rf"screaming|shriek|shrieking|hiss|hissing|clank|clanking|chug|chugging|puff|puffing|huff|huffing|"
                rf"click|clicking|clack|clacking|clickety-clack|clickety-click|drum|drumming|hum|humming|drone|"
                rf"droning|song|moan|moaning|wail|wailing|hoot|hooting|toot|tooting|thunder|thundering|screech|"
                rf"screeching|squeal|squealing|groan|groaning|grind|grinding|sound|sounds|noise|noises|rhythm|beat|"
                rf"pulse|throb|throbbing|approach|passing) of {_A}{_ADJ}(?:{_TRAINS}|wheels|carriage wheels|steam|"
                rf"distant train|passing train|train passing|train going by|night express|whistle|train's whistle|"
                rf"train whistle|engine's whistle|locomotive's whistle)\b|\btrain whistle\b|\b(?:a |the )train "
                rf"whistled\b|\bthe (?:train's|locomotive's|engine's) whistle\b",
                LIKELY,
            ),
            _rule(
                r"\b(?:a |the )(?:[\w-]+ )?(?:train|trains|locomotive|tram|trams|streetcar|express|subway|underground|"
                r"tube|railway|railroad)\b",
                FAINT,
            ),
        ),
    ),
    Group(
        "crowd-murmur",
        (
            "crowd",
            "audience",
            "mob",
            "throng",
            "room",
            "hall",
            "tavern",
            "inn",
            "bar",
            "pub",
            "caf",
            "restaurant",
            "canteen",
            "market",
            "bazaar",
            "square",
            "plaza",
            "court",
            "assembly",
            "gathering",
            "congregation",
            "spectator",
            "onlooker",
            "bystander",
            "people",
            "voices",
            "guests",
            "diners",
            "drinkers",
            "patrons",
            "customers",
            "villagers",
            "townsfolk",
            "townspeople",
            "citizens",
            "company",
            "everyone",
            "everybody",
            "murmur",
            "hubbub",
            "babble",
            "clamour",
            "clamor",
            "din",
            "chatter",
            "applause",
            "cheer",
        ),
        (
            _rule(near(_CROWD, _MURMURED), LIKELY),
            _rule(
                rf"\b(?:murmur|murmuring|hum|humming|buzz|buzzing|roar|roaring|din|clamour|clamor|babble|babbling|"
                rf"chatter|chattering|hubbub|noise|sound|sounds|voices|laughter|conversation|talk|talking|racket|"
                rf"uproar|tumult|commotion|bustle|applause|cheering|cheers|jeering|jeers|shouting|shouts|singing|"
                rf"chanting|chant|chants|roar) of {_A}{_ADJ}(?:{_CROWD}|conversation|voices|a hundred voices|a "
                rf"thousand voices|many voices|the dinner|dinner|the feast|feast|the party|party|the ball|the "
                rf"banquet|banquet|the fair|fair|the fête|fete|the festival|festival|the carnival|carnival|the "
                rf"celebration|celebration|the wedding|wedding|the funeral|funeral|the service|service|the mass|"
                rf"mass|the meeting|meeting|the trial|trial|the hearing|hearing|the match|match|the game|game|the "
                rf"race|race|the parade|parade|the procession|procession)\b",
                LIKELY,
            ),
        ),
    ),
    Group(
        "city-distant",
        ("traffic", "city", "street", "town", "dock", "harbour", "harbor", "port", "station", "metropolis"),
        (
            _rule(
                r"\b(?:traffic|the city|the street|the streets|the town|the docks|the harbour|the harbor|the port|the "
                r"station|the metropolis|the avenue|the avenues|the boulevard|the boulevards|the highway|the "
                r"motorway|the freeway|the main road|the high street|the thoroughfare|the thoroughfares)\b(?:\W+"
                r"[\w-]+){0,3}\W+(?:hummed|humming|roared|roaring|rumbled|rumbling|buzzed|buzzing|murmured|murmuring|"
                r"throbbed|throbbing|droned|droning|was busy|bustled|bustling|teemed|teeming|clamoured|clamored|"
                r"was alive|woke|was waking|stirred|was stirring|never slept|never sleeps|was never quiet|was never "
                r"silent|went on|carried on|flowed|was flowing|crawled|was crawling|hissed|hissing|growled|"
                r"growling|pulsed|pulsing|thrummed|thrumming|seethed|seething)\b",
                LIKELY,
            ),
            _rule(
                rf"\b(?:sound|sounds|noise|noises|din|hum|humming|roar|roaring|murmur|murmuring|rumble|rumbling|"
                rf"clamour|clamor|throb|throbbing|drone|droning|buzz|buzzing|pulse|pulsing|thrum|thrumming|growl|"
                rf"growling|hiss|hissing|music|voice|voices|racket|bustle|traffic) of {_A}{_ADJ}(?:city|traffic|"
                rf"street|streets|town|harbour|harbor|docks|port|metropolis|avenue|avenues|boulevard|boulevards|"
                rf"highway|motorway|freeway|main road|high street|thoroughfare|thoroughfares|city below|city "
                rf"beyond|city outside|street below|street outside|streets below|streets outside|town below|town "
                rf"beyond|town outside|world outside|outside world|life|the living|the waking|a waking city|a city "
                rf"waking|the city waking|a city at night|the city at night)\b",
                LIKELY,
            ),
        ),
    ),
    Group(
        "machine-hum",
        (
            "machine",
            "engine",
            "generator",
            "motor",
            "turbine",
            "fan",
            "reactor",
            "pump",
            "server",
            "computer",
            "refrigerator",
            "fridge",
            "air condition",
            "fluorescent",
            "boiler",
            "compressor",
            "dynamo",
            "mill",
            "loom",
            "press",
            "conveyor",
            "ventilat",
            "piston",
            "works",
        ),
        (
            _rule(near(_MACHINES, _HUMMED), LIKELY),
            _rule(
                rf"\b(?:hum|humming|whirr|whir|whirring|drone|droning|throb|throbbing|thrum|thrumming|clank|clanking|"
                rf"clatter|clattering|buzz|buzzing|purr|purring|pulse|pulsing|rumble|rumbling|grind|grinding|churn|"
                rf"churning|rattle|rattling|pound|pounding|hiss|hissing|wheeze|wheezing|chug|chugging|vibration|"
                rf"vibrations|whine|whining|song|sound|sounds|noise|noises|roar|roaring) of {_A}{_ADJ}(?:{_MACHINES})"
                rf"\b",
                LIKELY,
            ),
        ),
    ),
)
