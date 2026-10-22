# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Find the audible events a chapter's narration describes, as plain data for the validation gate.

Scope: Reads each sentence's narration (quoted speech is masked, with a quotation open from an earlier
sentence of the same paragraph still counted), tries the lexicon's patterns for the event groups whose
key words the sentence contains, and drops a match that the context says is not a sound happening
now: negated ("no thunder"), figurative ("like thunder", "a storm of emotions", "a door opening in
her life"), imagined, remembered, hoped for or conditional ("dreamed of", "would", "if"), habitual
("every night"), already over ("the wind died down"), a question, a heading, or a capitalised name
("Mr Bell rang"). The best match per event and sentence is kept, with its confidence, the fraction of
the sentence where the trigger stands (snapped to the start when it is near it) and, for ambience,
the sentence it should last to: the first later sentence saying it ended, or the cap given.
The result is a list of dictionaries, never trusted as such: ``proposals.validate`` checks every one.
Does NOT belong: The patterns (``lexicon.py``), choosing between sentences (``proposals.py``) or storage.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from ltts.sfx.events import event as event_of
from ltts.sfx.lexicon import GROUPS, STOPS, Group

DETECTOR_VERSION = "rules-2"
OPEN_QUOTES = '"\N{LEFT DOUBLE QUOTATION MARK}\N{LEFT-POINTING DOUBLE ANGLE QUOTATION MARK}'
CLOSE_QUOTES = '"\N{RIGHT DOUBLE QUOTATION MARK}\N{RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK}'
START_SNAP = 0.2  # a trigger in the first fifth of a sentence fires at its start
BEFORE_WORDS, AFTER_WORDS, UNREAL_WORDS = 6, 5, 8

_NEGATION = re.compile(
    r"\b(?:no|not|never|without|nor|none|neither|hardly|barely|scarcely|nothing|didn't|did not|couldn't|could not|"
    r"wasn't|was not|weren't|were not|isn't|is not|aren't|won't|wouldn't|can't|cannot|unable to|failed to|stopped|"
    r"ceased|silence|silent|quiet|still|absence of|lack of|instead of|rather than|too far|too faint|free of|devoid "
    r"of|empty of|clear of|save for|except for|but for)\b",
    re.IGNORECASE,
)
_CESSATION = re.compile(
    r"\b(?:died (?:down|away|out)|died|faded|fading|stopped|ceased|fell silent|subsided|was gone|were gone|had "
    r"(?:stopped|ceased|died|faded|passed|ended|gone)|ended|passed|abated|dwindled|petered out|let up|eased off|went "
    r"quiet|grew quiet|was over|were over|was silent|were silent|no longer|no more|silence fell)\b",
    re.IGNORECASE,
)
_SIMILE = re.compile(
    r"\b(?:like|unlike|as if|as though|resembl\w+|remind\w* \w+ of|sound\w* like|seem\w* like|felt like|feel like|"
    r"looked like|look like|a kind of|a sort of|sort of|kind of|metaphorical\w*|figurative\w*|so-called|proverbial|"
    r"(?:his|her|their|my|our|your|its) (?:own|inner|inward|mental|emotional|silent|private|imaginary|imagined))\b",
    re.IGNORECASE,
)
_ABSTRACT_DET = r"(?:(?:the|his|her|their|my|our|your|its|a|an) )?"
_ABSTRACT_NOUNS = (
    r"morning|night|dawn|dusk|evening|time|death|sleep|dream|dreams|years|truth|silence|darkness|light|eternity|"
    r"heaven|childhood|youth|age|winter|summer|spring|autumn|heart|mind|soul|senses|past|future|hooves|horses|drums|"
    r"guns|cannon|wings|feet|engines|traffic|"
    r"emotion|emotions|feeling|feelings|applause|protest|protests|laughter|words|thoughts|memories|memory|"
    r"anger|rage|fury|grief|doubt|doubts|hope|hopes|change|controversy|criticism|activity|questions|ideas|excitement|"
    r"panic|fear|joy|passion|desire|possibility|possibilities|opportunity|opportunities|abuse|insults|accusations|"
    r"objections|indignation|outrage|disapproval|approval|relief|gossip|rumour|rumours|rumor|rumors|speculation|"
    r"publicity|interest|attention|letters|complaints|requests|demands|argument|arguments|debate|discussion|dissent|"
    r"disagreement|opinion|opinions|life|history|events|"
    r"creativity|inspiration|energy|enthusiasm|ambition|resentment|jealousy|envy|guilt|shame|regret|sorrow|sadness|"
    r"despair|longing|love|hatred|hate|pride|pleasure|pain|confusion|chaos|thought|information|data|numbers|figures|"
    r"statistics|evidence|news|bad news|press|media|his own|her own|their own|my own"
)
# "a storm of protest", "the door of her heart": the complement is an idea or another sound, not a thing.
_ABSTRACT = re.compile(rf"^\W*of {_ABSTRACT_DET}(?:{_ABSTRACT_NOUNS})\b", re.IGNORECASE)
_ABSTRACT_INSIDE = re.compile(rf"\bof {_ABSTRACT_DET}(?:{_ABSTRACT_NOUNS})\b", re.IGNORECASE)
# An abstract subject right before the sound ("Hope knocked at the door").
_ABSTRACT_SUBJECT = re.compile(
    r"\b(?:hope|fear|guilt|grief|love|courage|doubt|despair|anger|rage|joy|memory|silence|time|death|sorrow|shame|"
    r"regret|longing|pride|envy|jealousy|hatred|panic|dread|desire|passion|ambition|loneliness|history|fate|destiny|"
    r"chance|luck|truth|justice|freedom|war|peace|news|rumour|rumor|gossip|laughter|applause|protest|change|progress|"
    r"life|sleep|darkness)\s*$",
    re.IGNORECASE,
)
# "She was thunder", "the city was a machine": a predicate says what something is like, not what sounds.
_PREDICATE = re.compile(
    r"\b(?!(?:it|there|that|this|what|which|here|sound|noise)\b)[a-z]+ (?:was|were|is|are|became|become|seemed|"
    r"felt)(?: (?:a|an|the|all|pure|only|just|merely|simply))?\s*$",
    re.IGNORECASE,
)
# Negation between or just after the words that make a sound ("the dog did not bark", "thunder never came").
_NEGATED_INSIDE = re.compile(
    r"\b(?:not|never|no|nor|didn't|did not|couldn't|could not|wouldn't|would not|hadn't|had not|wasn't|was not|"
    r"weren't|were not|failed to|refused to)\b",
    re.IGNORECASE,
)
_NEGATED_AFTER = re.compile(
    r"^\W*(?:(?:that|which|who) )?(?:never|not|didn't|did not|hadn't|had not|couldn't|could not|wouldn't|would not|"
    r"no longer|was not|wasn't|were not|weren't)\b",
    re.IGNORECASE,
)
# Context from an earlier clause doesn't carry over ("he said nothing, and the clock ticked").
_CLAUSE_BREAK = re.compile(
    r"[;\u2014\u2013]|,\s+(?:and|but|while|yet|so|then|only|until|till|though|although)\s+|\.\s+", re.IGNORECASE
)
# A year anywhere in a sentence: history or reportage, not a scene.
_YEAR = re.compile(r"\b(?:1\d{3}|20\d{2})\b")
# Generic statements: a bare plural subject in the present tense ("Dogs bark to communicate"), a definition
# ("Thunder is the sound…") or a report of a recording ("footsteps can be heard").
_NOT_A_PRESENT_VERB = (
    r"sang|rang|fell|broke|came|ran|blew|rose|shook|struck|flew|swept|crept|began|went|stood|sat|lay|hung|drove|rode|"
    r"tore|burst|beat|bit|sprang|swung|wept|woke|spoke|shot|slid|split|spread|threw|hit|cut|let|set|put|shut|sank|"
    r"rung|sung|clung|stung|swam|ground|wound|fought|caught|brought|thought|heard|made|gave|took|got|had|was|were|"
    r"did|said|told|left|kept|slept|met|led|fed|bled|sped|lit|bound|found|have|has|are|is|"
    r"to|of|in|on|at|by|for|from|with|and|or|but|that|which|who|whose|as|than|like|into|onto|over|under|near|off|"
    r"out|up|down|all|both|will|would|can|could|should|may|might|must|do|does|not|no|so|then|there|here|still|"
    r"also|only|just|now"
)
_GENERIC = re.compile(
    rf"^(?:[A-Z][a-z]+ )?[A-Z][a-z]+(?<!s)s (?!(?:{_NOT_A_PRESENT_VERB})\b)(?![a-z]+(?:ed|ing)\b)[a-z]{{2,}}\b"
    r"|\b(?:is|are) (?:the|a|an) (?:sound|noise|name|term|word)\b|\b(?:can|may|could) be heard\b|\bare heard\b"
)
_INNER = re.compile(
    r"^\W*(?:(?:in|within|inside|deep in|deep inside) (?:him|her|them|me|us|you)|(?:in|within|inside|through|across|"
    r"over|behind|beneath|deep in|deep inside) (?:his|her|their|my|our|your|its|one's) (?:life|heart|"
    r"mind|soul|head|chest|"
    r"stomach|belly|veins|ears|memory|eyes|voice|imagination|dreams|dream|thoughts|spirit|being|bones|"
    r"blood|skull|brain|"
    r"conscience|gut|guts))\b",
    re.IGNORECASE,
)
_UNREAL = re.compile(
    r"\b(?:imagined|imagine|imagining|dreamed|dreamt|dreaming|dream of|dreams of|pictured|picturing|remembered|"
    r"remembering|recalled|recalling|recollected|wished|wishing|hoped|hoping|expected|expecting|feared|fearing|"
    r"dreaded|thought of|thinking of|thought about|thinking about|used to|would|might|could have|should have|if "
    r"only|pretended|pretending|suppose|supposing|what if|perhaps|maybe|in (?:his|her|their|my|our|your) (?:dream|"
    r"dreams|memory|memories|imagination|mind's eye|mind|head|nightmare|nightmares)|the memory of|a memory of|"
    r"memories of|(?<!for )once|long ago|years ago|years before|months before|weeks before|days before|had once|"
    r"in those "
    r"days|back then|as a (?:child|boy|girl)|every time|whenever|unless|if|will|shall|going to|about to|threatened "
    r"to|promised|planned|planning|wanted to|wants to|tried to|trying to|waiting for|waited for|listening for|"
    r"listened for|hoping for|hoped for|afraid of|fear of|in case|lest|before the|until the|till the|should the|"
    r"were the|had the|expected the|hadn't|had not|no longer)\b",
    re.IGNORECASE,
)
_HABITUAL = re.compile(
    r"\b(?:always|often|usually|sometimes|frequently|rarely|seldom|occasionally|every (?:night|day|morning|evening|"
    r"time|hour|week|year|winter|summer|spring|autumn|afternoon)|each (?:night|day|morning|evening|time)|whenever|"
    r"most (?:nights|days|mornings|evenings)|some (?:nights|days|mornings|evenings)|all (?:night|day) long|as "
    r"usual|as always|as ever|habitually|customarily|routinely|regularly|now and then|from time to time|again and "
    r"again|over and over|year after year|night after night|day after day|day and night|night and day|"
    r"(?:twice|once|\w+ times) an? (?:day|night|week|month|year)|(?:each|every) (?:half )?hour|"
    r"on the (?:half |quarter )?"
    r"hour|daily|nightly|weekly|hourly|used to|for (?:a|many|several|two|three|four|five|ten) (?:years?|months?|weeks?|"
    r"days?)|all (?:winter|summer|spring|autumn|year)|as (?:it|he|she|they) always)\b",
    re.IGNORECASE,
)
_WORD = re.compile(r"[A-Za-z][\w'-]*")
# Past perfect inside the match ("the dog had barked"): background from an earlier time, not this moment.
_PERFECT = re.compile(r"\bhad (?:\w+ly )?(?:\w+ed|been|once|often|always|long)\b", re.IGNORECASE)
_OPENED_TO = re.compile(
    r"^\W*(?:to|for|on) (?:further|new|more|fresh|talks|negotiations|the possibility|possibilities|a new|another|an? "
    r"(?:[\w-]+ )?(?:future|era|chapter|world|way|life|career|opportunity|opportunities|debate|discussion|question|"
    r"questions|solution|deal|agreement|settlement|compromise|peace|war|friendship|romance|relationship|adventure))\b",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class Sentence:
    index: int
    paragraph: int
    heading: bool
    text: str


@dataclass(frozen=True, slots=True)
class _Hit:
    event: str
    confidence: float
    start: int


def _mask_quotes(text: str, open_at_start: bool) -> tuple[str, bool]:
    """``text`` with quoted speech blanked (same length, so positions hold), and whether a quote stays open."""
    out: list[str] = []
    quoted = open_at_start
    for char in text:
        is_open, is_close = char in OPEN_QUOTES, char in CLOSE_QUOTES
        if (is_open and not quoted) or (is_close and quoted):
            quoted = not quoted
            out.append(" ")
            continue
        out.append(" " if quoted else char)
    return "".join(out), quoted


def _before(text: str, start: int, words: int) -> str:
    return " ".join(text[:start].split()[-words:])


def _clause_before(text: str, start: int) -> str:
    """The text before ``start`` back to the last clause break."""
    head = text[:start]
    breaks = list(_CLAUSE_BREAK.finditer(head))
    return head[breaks[-1].end() :] if breaks else head


def _not_a_scene(text: str) -> bool:
    """A habit, a schedule, a dated report or a general statement: nothing is sounding in the story."""
    return bool(_HABITUAL.search(text) or _YEAR.search(text) or _GENERIC.search(text))


def _after(text: str, end: int, words: int) -> str:
    return " ".join(text[end:].split()[:words])


def _is_name(text: str, match: re.Match[str]) -> bool:
    """A capitalised word inside the match that isn't the sentence's first word: likely a name."""
    first = _WORD.search(text)
    first_at = first.start() if first else -1
    for word in _WORD.finditer(text, match.start(), match.end()):
        if word.group(0)[0].isupper() and word.start() != first_at:
            return True
    return False


def _rejected(text: str, match: re.Match[str]) -> bool:
    """Context says this isn't a sound happening now in the story."""
    clause = _clause_before(text, match.start())
    before = _before(clause, len(clause), BEFORE_WORDS)
    after = text[match.end() :]
    matched = match.group(0)
    return bool(
        _NEGATION.search(before)
        or _NEGATED_INSIDE.search(matched)
        or _NEGATED_AFTER.match(after)
        or _SIMILE.search(" ".join(before.split()[-4:]))
        or _PREDICATE.search(" ".join(before.split()[-3:]))
        or _ABSTRACT_SUBJECT.search(" ".join(before.split()[-2:]))
        or _CESSATION.search(_after(text, match.end(), AFTER_WORDS))
        or _ABSTRACT.match(after)
        or _ABSTRACT_INSIDE.search(matched)
        or _INNER.match(after)
        or _OPENED_TO.match(after)
        or _PERFECT.search(" ".join(before.split()[-4:]) + " " + matched)
        or _UNREAL.search(_before(clause, len(clause), UNREAL_WORDS))
        or _is_name(text, match)
    )


def _hits(text: str, lowered: str, group: Group) -> _Hit | None:
    """The surest match of one group in a sentence, if any survives the context rules."""
    if not any(key in lowered for key in group.keys):
        return None
    best: _Hit | None = None
    for rule in group.rules:
        if best is not None and rule.confidence <= best.confidence:
            continue  # rules are listed surest first; a weaker one can't improve the result
        for match in rule.pattern.finditer(text):
            if match.end() > match.start() and not _rejected(text, match):
                best = _Hit(group.event, rule.confidence, match.start())
                break
    return best


def _fraction(start: int, length: int) -> float:
    fraction = start / length if length else 0.0
    return 0.0 if fraction < START_SNAP else round(min(fraction, 0.95), 2)


def _until(event_id: str, position: int, narrations: Sequence[str], indexes: Sequence[int], cap: int) -> int:
    """The sentence an ambience lasts to: the first later one that says it ended, or the cap."""
    stop = STOPS.get(event_id)
    last = min(position + cap, len(indexes) - 1)
    for at in range(position + 1, last + 1):
        if stop is not None and stop.search(narrations[at]):
            return indexes[at]
    return indexes[last]


def _narrations(sentences: Sequence[Sentence]) -> list[str]:
    """Each sentence with its quoted speech masked; a quotation never runs over a paragraph break."""
    out: list[str] = []
    quoted, paragraph = False, None
    for sentence in sentences:
        if sentence.paragraph != paragraph:
            quoted, paragraph = False, sentence.paragraph
        masked, quoted = _mask_quotes(sentence.text, quoted)
        out.append(masked)
    return out


def detect(sentences: Sequence[Sentence], loop_sentences: int) -> list[dict[str, object]]:
    """Candidate events in reading order: ``index``, ``event``, ``confidence``, ``fraction`` and ``until``."""
    narrations = _narrations(sentences)
    indexes = [sentence.index for sentence in sentences]
    found: list[dict[str, object]] = []
    for position, sentence in enumerate(sentences):
        text = narrations[position]
        if sentence.heading or text.rstrip().endswith("?") or _not_a_scene(text):
            continue
        lowered = text.lower()
        for group in GROUPS:
            hit = _hits(text, lowered, group)
            if hit is None:
                continue
            loop = event_of(hit.event).loop
            found.append(
                {
                    "index": sentence.index,
                    "event": hit.event,
                    "confidence": hit.confidence,
                    "fraction": _fraction(hit.start, len(sentence.text)),
                    "until": _until(hit.event, position, narrations, indexes, loop_sentences) if loop else None,
                }
            )
    return found
