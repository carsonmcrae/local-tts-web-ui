# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Owls, wolves, dogs and horses.

Scope: An owl's hoot, a wolf's howl, a dog barking and horses' hooves, each a one-shot; the lone noun is only a
faint hint, so an immersive setting alone takes it.
Does NOT belong: Birds and insects (``nature.py``).
"""

from __future__ import annotations

from ltts.sfx.lexicon._shared import _A, _ADJ, FAINT, LIKELY, SURE, Group, _rule, near

# What an owl does in prose, surest first.
_OWL_CALLS = "hooted|hooting|called|calling|cried|screeched|screeching|hoot|hoots|questioned|asked"

GROUPS: tuple[Group, ...] = (
    Group(
        "owl",
        ("owl",),
        (
            _rule(
                near("owl|owls", _OWL_CALLS),
                SURE,
            ),
            _rule(rf"\b(?:hoot|hooting|call|cry|screech) of {_A}{_ADJ}owls?\b", SURE),
            _rule(r"\b(?:an |the )owl\b|\bowls\b", FAINT),
        ),
    ),
    Group(
        "wolf-howl",
        ("wolf", "wolves", "coyote", "jackal"),
        (
            _rule(
                near(
                    "wolf|wolves|coyote|coyotes|jackals|jackal",
                    "howled|howling|bayed|baying|cried|crying|called|calling|"
                    "sang|singing|yipped|yipping|wailed|wailing",
                ),
                SURE,
            ),
            _rule(
                rf"\b(?:howl|howling|howls|cry|cries|song|baying|yip|yipping|"
                rf"chorus) of {_A}{_ADJ}(?:wolf|wolves|coyote|"
                rf"coyotes|jackals|the pack)\b",
                SURE,
            ),
            _rule(r"\b(?:a |the )(?:lone |distant |single |far-off )?(?:wolf|coyote)\b|\bwolves\b", FAINT),
        ),
    ),
    Group(
        "dog-bark",
        (
            "dog",
            "hound",
            "pupp",
            "mutt",
            "mongrel",
            "terrier",
            "spaniel",
            "mastiff",
            "retriever",
            "collie",
            "beagle",
            "bulldog",
        ),
        (
            _rule(
                near(
                    "dog|dogs|hound|hounds|puppy|puppies|mutt|mongrel|terrier|spaniel|mastiff|wolfhound|retriever|"
                    "collie|beagle|bulldog|pup",
                    "barked|barking|yapped|yapping|bayed|baying|growled|growling|snarled|"
                    "snarling|woofed|howled|howling|whined|whining|yelped|yelping|bark|barks|gave tongue|went wild|"
                    "set up a",
                ),
                LIKELY,
            ),
            _rule(
                rf"\b(?:bark|barking|barks|yap|yapping|yelp|yelping|howl|howling|baying|growl|growling|snarl|snarling|"
                rf"whine|whining) of {_A}{_ADJ}(?:dog|dogs|hound|hounds)\b|\b{_A}(?:dog's|dogs'|hound's|hounds') "
                rf"(?:bark|barking|yap|howl|baying|growl)\b",
                LIKELY,
            ),
            _rule(r"\b(?:a |the )dog\b|\bdogs\b|\bhounds?\b", FAINT),
        ),
    ),
    Group(
        "horse-hooves",
        (
            "hoof",
            "hooves",
            "horse",
            "stallion",
            "mare",
            "pony",
            "ponies",
            "steed",
            "cavalry",
            "rider",
            "carriage",
            "coach",
            "wagon",
            "cart",
        ),
        (
            _rule(
                near(
                    "hooves|hoofs|hoofbeats|hoof|horse|horses|stallion|mare|pony|ponies|mount|steed|steeds|cavalry|"
                    "riders|rider|carriage|coach|wagon|cart",
                    "clattered|clattering|clopped|clopping|thundered|"
                    "thundering|pounded|pounding|drummed|drumming|rang|ringing|struck|striking|echoed|echoing|"
                    "galloped|galloping|trotted|trotting|cantered|cantering|clip-clopped|rattled|rattling|beat|"
                    "beating|hammered|hammering|stamped|stamping|pawed|snorted|whinnied|neighed|nickered|reared|"
                    "shied",
                ),
                LIKELY,
            ),
            _rule(
                rf"\b(?:clatter|clattering|clip-clop|clop|clopping|thunder|thundering|drum|drumming|drumbeat|beat|"
                rf"beating|pound|pounding|sound|sounds|ring|ringing|rhythm|rattle) of {_A}{_ADJ}(?:hooves|hoofs|"
                rf"hoofbeats|horses|horse|horses' hooves|cavalry|riders|rider|carriage|coach|cart|wagon|wheels)\b|"
                r"\bhoofbeats\b",
                LIKELY,
            ),
            _rule(r"\b(?:horse|horses|hooves|hoofbeats|the carriage|the coach|the wagon)\b", FAINT),
        ),
    ),
)
