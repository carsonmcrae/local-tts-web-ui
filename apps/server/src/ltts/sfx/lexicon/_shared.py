# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: What every lexicon module shares: rule and group records, confidences, and word lists.

Scope: ``Rule`` (a compiled pattern and how sure it is), ``Group`` (an event, the key words a sentence must
contain, and its rules), the four confidence levels, ``near`` for a noun and a verb within a few words,
and the alternations several groups reuse (doors, footsteps, vehicles, crowds, machines and their verbs).
Does NOT belong: The groups themselves (the category modules) or how they are applied (``detect.py``).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

SURE, LIKELY, MAYBE, FAINT = 0.9, 0.8, 0.7, 0.55


@dataclass(frozen=True, slots=True)
class Rule:
    pattern: re.Pattern[str]
    confidence: float


@dataclass(frozen=True, slots=True)
class Group:
    event: str
    keys: tuple[str, ...]  # lower-case substrings; a sentence without any of them skips the group
    rules: tuple[Rule, ...]


def near(first: str, second: str, gap: int = 3) -> str:
    """``first`` then ``second`` (alternatives allowed in either) within ``gap`` words."""
    return rf"\b(?:{first})\b(?:\W+\w+){{0,{gap}}}\W+(?:{second})\b"


def _rule(pattern: str, confidence: float) -> Rule:
    return Rule(re.compile(pattern, re.IGNORECASE), confidence)


_A = r"(?:a |an |the |another |some |its |his |her |their |that |this )?"
_ADJ = r"(?:[\w-]+ )?"
_DOOR = "door|doors|gate|gates|hatch|trapdoor|lid|shutter|shutters"
_STEPS = "footsteps|footfalls|footstep|steps|boots|heels|feet|shoes|tread|paces"
_WENT = (
    "walked|strode|stalked|marched|stamped|stomped|tramped|trudged|crept|tiptoed|padded|shuffled|limped|hobbled|"
    "staggered|lurched|stumbled|climbed|descended|went|hurried|strolled|wandered|paced|plodded"
)
_WOOD = (
    "floorboards?|boards|planks|planking|deck|decks|stairs?|staircase|landing|hallway|hall|corridors?|passage|"
    "passageway|floor|gallery|balcony|verandah?|porch|bridge|pier|jetty|boardwalk|parquet|attic|loft|gangplank"
)
_STONE = (
    "cobbles|cobblestones|flagstones|flags|stones?|paving|pavements?|sidewalk|streets?|roads?|alleys?|alleyway|"
    "lanes?|tiles?|marble|courtyard|square|plaza|tunnels?|caves?|cavern|dungeons?|cellars?|crypt|vaults?|cloisters?|"
    "nave|aisle|platform|quay|wharf|ramparts|battlements|concrete|tarmac|asphalt|car park|parking lot|garage|"
    "warehouse|station|underpass"
)
_GROUND = (
    "gravel|shingle|pebbles|cinders|paths?|tracks?|trails?|drive|driveway|snow|frost|ice|leaves|undergrowth|brush|"
    "bracken|heather|needles|sand|dunes|beach|shore|grass|lawn|meadow|fields?|moor|moorland|heath|forest floor|"
    "dirt|mud|earth|ground|garden|orchard|woods|forest|hillside|slope|scree|riverbank|clearing|glade"
)
_CRUNCHED = "crunch(?:ed|ing)?|scrunch(?:ed|ing)?|crackl(?:ed|ing)|rustl(?:ed|ing)|squelch(?:ed|ing)"
_LOOSE = "gravel|shingle|pebbles|cinders|snow|frost|ice|leaves|twigs|undergrowth|bracken|needles|sand|grit|dirt|mud"
_NOISE = r"(?:dull |heavy |loud |soft |muffled |hollow |sickening |solid |distant |sudden |faint |sharp |great )?"
_THUDS = "thud|thump|clatter|clunk|thunk|crash|bang|clang|smack|clank|whump|crunch|splat|boom|rattle|wallop|whack"
_FELL = (
    "fell|dropped|landed|crashed|toppled|tumbled|hit|struck|slumped|collapsed|thudded|slammed|pitched|sprawled|"
    "crumpled|flopped|bounced|rolled|slid|skidded|clattered|tipped|overturned|threw|flung|hurled|tossed|dumped|"
    "heaved|set|put|placed|laid|lowered|let fall|let drop|was thrown|was flung|was hurled|was knocked|was dropped"
)
_GUNS = (
    "guns?|pistols?|rifles?|revolvers?|muskets?|shotguns?|cannons?|carbines?|machine[- ]guns?|firearms?|sidearms?|"
    "flintlocks?|howitzers?|mortars?|artillery|batteries|battery"
)
_FIRED = (
    "fired|firing|went off|barked|cracked|roared|boomed|discharged|spat|thundered|kicked|bucked|blazed|spoke|"
    "coughed|chattered|stuttered|hammered|rattled|belched|erupted|opened up|opened fire|let fly|rang out|blasted"
)
_VEHICLES = (
    "cars?|trucks?|lorry|lorries|vans?|bus|buses|taxis?|cabs?|motorcycles?|motorbikes?|vehicles?|engines?|motors?|"
    "jeeps?|convoys?|limousine|limo|sedan|saloon|pickup|tractors?|ambulances?|police car|patrol car|squad car|"
    "fire engine|fire truck|tanks?|scooters?|mopeds?|headlights|tyres|tires|brakes|exhaust"
)
_DROVE = (
    "passed|passing|drove|driving|roared|roaring|sped|speeding|rumbled|rumbling|rattled|growled|purred|pulled|"
    "screeched|revved|idled|idling|started|coughed|spluttered|sputtered|swept|raced|hummed|approached|stopped|"
    "drew up|drew away|pulled up|pulled away|pulled in|pulled out|pulled over|crawled|lurched|skidded|squealed|"
    "whined|droned|throbbed|shuddered|backfired|honked|hooted|blared|beeped|accelerated|braked|reversed|cruised|"
    "trundled|thundered|zoomed|whizzed|whooshed|hurtled|chugged|juddered|ticked over|fired up|turned over|"
    "came to life|sprang to life|stalled|cut out|rolled past|rolled by|rolled up|rolled away|went by|went past|"
    "came past|came by|overtook|flashed past|shot past|tore past"
)
_TRAINS = (
    "trains?|locomotives?|carriages?|freight train|goods train|express|subway|underground|tube|trams?|streetcars?|"
    "trolleys?|railway|railroad|rails|tracks|wagons|boxcars|steam engine|steam train|night train|last train|"
    "mail train|sleeper|diesel"
)
_RAN = (
    "rumbled|rattled|clattered|roared|thundered|screeched|hissed|whistled|pulled|passed|approached|clanked|"
    "shuddered|shrieked|steamed|chugged|puffed|huffed|panted|wheezed|groaned|squealed|ground|lurched|jolted|"
    "swayed|rocked|clicked|clacked|drummed|hummed|droned|moaned|wailed|hooted|tooted|slowed|braked|gathered speed|"
    "picked up speed|swept|raced|sped|tore|hurtled|flew|crawled|trundled|rolled|glided|came in|came through|"
    "pulled in|pulled out|pulled away|drew in|drew out|drew away|thundered by|thundered past|roared by|roared past|"
    "rattled by|rattled past|rumbled by|rumbled past|clattered by|clattered past|screeched to|ground to|"
    "shuddered to|hissed to|came to a"
)
_CROWD = (
    "crowd|crowds|audience|mob|throng|room|hall|tavern|inn|bar|pub|caf[eé]|restaurant|dining room|canteen|market|"
    "marketplace|bazaar|square|plaza|court|courtroom|assembly|gathering|congregation|spectators|onlookers|"
    "bystanders|people|voices|guests|diners|drinkers|patrons|customers|villagers|townsfolk|townspeople|citizens|"
    "company|everyone|everybody"
)
_MURMURED = (
    "murmured|murmuring|muttered|muttering|hummed|humming|buzzed|buzzing|chattered|chattering|whispered|whispering|"
    "talked|talking|laughed|laughing|argued|arguing|gossiped|babbled|babbling|clamoured|clamored|rumbled|stirred|"
    "jostled|milled|thronged|swarmed|seethed|roared|cheered|jeered|booed|hissed|shouted|yelled|applauded|clapped|"
    "gasped|groaned|sighed|sang|chanted|caroused|revelled|reveled|haggled|bargained|was alive with|were alive with|"
    "was full of|were full of|was crowded|were crowded|was packed|were packed|was busy|were busy|was noisy|were noisy|"
    "was thronged|was heaving|was humming|was buzzing|was bustling|was teeming|was swarming|was seething"
)
_MACHINES = (
    "machines?|machinery|engines?|generators?|motors?|turbines?|fans?|reactor|pumps?|servers?|computers?|"
    "refrigerator|fridge|air conditioner|air conditioning|fluorescent lights|lights|boiler|compressor|dynamo|mill|"
    "looms?|presses?|conveyor|conveyor belt|ventilation|ventilators?|dynamos|pistons|the works"
)
_HUMMED = (
    "hummed|humming|whirred|whirring|droned|droning|throbbed|throbbing|thrummed|thrumming|purred|purring|buzzed|"
    "buzzing|clanked|clanking|clattered|clattering|pulsed|pulsing|ticked|ticking|idled|idling|ground|grinding|"
    "churned|churning|rattled|rattling|pounded|pounding|hissed|hissing|wheezed|wheezing|rumbled|rumbling|"
    "chuntered|chugged|chugging|vibrated|vibrating|sang|singing|whined|whining"
)
