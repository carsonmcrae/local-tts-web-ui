# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Glass, falls, shots and explosions.

Scope: Breaking glass, something heavy hitting the floor (with a thud, or landing on a surface), a gunshot and
an explosion; a bare "exploded" is a weaker hint, since it is often figurative.
Does NOT belong: Doors slamming (``doors.py``) or swords (``household.py``).
"""

from __future__ import annotations

from ltts.sfx.lexicon._shared import (
    _A,
    _ADJ,
    _FELL,
    _FIRED,
    _GUNS,
    _NOISE,
    _THUDS,
    LIKELY,
    MAYBE,
    SURE,
    Group,
    _rule,
    near,
)

GROUPS: tuple[Group, ...] = (
    Group(
        "glass-break",
        (
            "glass",
            "window",
            "pane",
            "bottle",
            "vase",
            "mirror",
            "goblet",
            "cup",
            "jar",
            "tumbler",
            "lantern",
            "lamp",
            "bulb",
            "decanter",
            "flask",
            "vial",
            "phial",
            "beaker",
            "dish",
            "plate",
            "crystal",
            "chandelier",
            "windscreen",
            "windshield",
            "china",
            "crockery",
        ),
        (
            _rule(
                near(
                    "glass|glasses|window|windows|windowpane|windowpanes|pane|panes|bottle|bottles|vase|vases|mirror|"
                    "mirrors|goblet|goblets|cup|cups|jar|jars|tumbler|tumblers|wineglass|wineglasses|lantern|lanterns|"
                    "lamp|lamps|bulb|bulbs|lightbulb|lightbulbs|decanter|decanters|flask|flasks|vial|vials|phial|"
                    "phials|beaker|beakers|dish|dishes|plate|plates|crystal|chandelier|chandeliers|windscreen|"
                    "windshield|glassware|china|crockery",
                    "shattered|shattering|smashed|smashing|broke|breaking|"
                    "burst|bursting|splintered|splintering|exploded|exploding|cracked|cracking|crashed|crashing|"
                    "crazed|crazing|fragmented|disintegrated|flew apart|came apart|blew out|blew in|gave way|fell "
                    "in|caved in|imploded|imploding|spiderwebbed|starred|split|splitting|shivered|shivering|rained "
                    "down|flew into pieces|broke into pieces|broke apart|smashed to pieces|shattered into",
                ),
                SURE,
            ),
            _rule(
                rf"\b(?:shatter|shattering|crash|crashing|tinkle|tinkling|smash|smashing|splinter|splintering|crack|"
                rf"cracking|sound|noise|explosion|burst|bursting|chime|music|rain|shower|cascade|hail|spray) of "
                rf"{_A}{_ADJ}(?:breaking glass|shattering glass|smashing glass|splintering glass|falling glass|broken "
                rf"glass|glass breaking|glass shattering|glass smashing|glass splintering|glass|crystal|china|"
                rf"crockery|glassware)\b|\b(?:breaking|shattering|smashing|splintering) glass\b|\bglass (?:shattered|"
                rf"broke|smashed|splintered|exploded|burst|cracked|crashed|flew|rained|showered|sprayed|gave|fell|"
                rf"tinkled|shivered)\b",
                SURE,
            ),
        ),
    ),
    Group(
        "thud",
        (
            "thud",
            "thump",
            "clatter",
            "clunk",
            "thunk",
            "crash",
            "bang",
            "clang",
            "smack",
            "clank",
            "whump",
            "crunch",
            "splat",
            "boom",
            "rattle",
            "wallop",
            "whack",
            "fell",
            "dropped",
            "landed",
            "toppled",
            "tumbled",
            "slumped",
            "collapsed",
            "slammed",
            "sprawl",
            "crumpl",
            "flop",
            "bounc",
            "skidd",
            "tipped",
            "overturn",
            "threw",
            "flung",
            "hurled",
            "tossed",
            "dumped",
            "heaved",
            "lowered",
            "knocked",
            "struck",
            "hit",
        ),
        (
            _rule(
                rf"\b(?:{_FELL})\b(?:\W+[\w-]+){{0,6}}\W+with (?:a |an )?{_NOISE}(?:{_THUDS}|clink|chink|tinkle|jangle|"
                rf"groan|creak|squelch|hiss|snap|pop|thwack|donk|bonk|plonk|bump|report|jolt|jar|shudder|shock|"
                rf"impact)\b",
                SURE,
            ),
            _rule(
                rf"\b(?:there was|came|there came|followed by|then came|and then|heard|hear|was followed by) {_A}"
                rf"{_NOISE}(?:{_THUDS}|clink|chink|jangle|thwack|donk|bonk|plonk|bump|knock|crashing|clattering|"
                rf"thudding|thumping|banging|clanging|clanking|crunching)\b",
                LIKELY,
            ),
            _rule(
                rf"\b(?:{_FELL}|went down|came down|fell down|fell over|kicked|knocked|shoved|pushed|swept|sent)\b"
                rf"(?:\W+[\w-]+){{0,4}}\W+(?:to|on|onto|against|across|down|into|off|over|upon|at|towards|toward) the "
                rf"(?:[\w-]+ )?(?:floor|ground|flagstones|table|desk|stones|stone|boards|floorboards|deck|earth|"
                rf"pavement|cobbles|cobblestones|tiles|rocks|rock|wall|walls|door|steps|stairs|staircase|bed|chair|"
                rf"bench|counter|bar|altar|hearth|grate|flags|paving|concrete|asphalt|tarmac|road|street|path|"
                rf"track|dirt|dust|mud|grass|carpet|rug|mat|bottom|base|foot|side|edge|lid|surface|planks|planking|"
                rf"gravel|sand|snow|ice|water)\b",
                MAYBE,
            ),
            _rule(rf"\b(?:a |the )(?:{_NOISE})(?:{_THUDS}|clink|chink|jangle|thwack|donk|bonk|plonk|bump)\b", MAYBE),
        ),
    ),
    Group(
        "gunshot",
        (
            "shot",
            "gun",
            "pistol",
            "rifle",
            "revolver",
            "musket",
            "cannon",
            "carbine",
            "firearm",
            "sidearm",
            "flintlock",
            "howitzer",
            "mortar",
            "artillery",
            "batter",
            "volley",
            "fusillade",
            "salvo",
            "fire",
            "trigger",
            "bullet",
            "round",
            "musketry",
        ),
        (
            _rule(
                rf"\b{_A}(?:single |second |third |another |first |lone |distant |muffled |sharp |"
                rf"sudden |loud |faint |flat "
                rf"|dull |deafening |echoing |ringing |rifle |pistol |musket |cannon |warning |stray |wild |random |"
                rf"answering |returning |last |final |fatal |close |near |nearby |far |far-off |faraway )?(?:gunshot|"
                rf"gunshots|shot|shots|gunfire|volley|volleys|fusillade|fusillades|salvo|salvos|salvoes|barrage|burst "
                rf"of fire|burst of gunfire|bursts of fire|bursts of gunfire)\b(?:\W+[\w-]+){{0,3}}\W+(?:rang out|rang|"
                rf"cracked|echoed|exploded|split|sounded|boomed|roared|thundered|was fired|were fired|went off|came|"
                rf"followed|answered|tore|ripped|shattered|broke|cut|punched|whined|whistled|sang|spat|barked|"
                rf"crashed|rolled|rattled|chattered|stuttered|hammered|snapped|whipped|slammed|flashed|lit|blazed|"
                rf"erupted|burst|resounded|reverberated|filled|shook|shivered|rocked|split the|cut through|ripped "
                rf"through|tore through|rang through|echoed through|crashed through)\b",
                SURE,
            ),
            _rule(
                rf"\b(?:crack|bark|boom|report|roar|rattle|burst|sound|thunder|chatter|stutter|hammer|whine|whistle) "
                rf"of {_A}{_ADJ}(?:gunfire|gunshots?|rifles?|pistols?|muskets?|shots|cannons?|machine[- ]guns?|guns|"
                rf"artillery|musketry|revolvers?|shotguns?)\b|\bgunfire\b|\bgunshots?\b|\bmusketry\b",
                LIKELY,
            ),
            _rule(near(_GUNS, _FIRED), SURE),
            _rule(
                rf"\b(?:fired|firing|pulled the trigger|squeezed the trigger|squeezed off|loosed off|let off|let fly|"
                rf"opened fire|returned fire|emptied|unloaded|discharged)\b(?:\W+[\w-]+){{0,3}}\W+(?:a |the |his |her |"
                rf"their |another |two |three |several |both )?(?:[\w-]+ )?(?:round|rounds|shot|shots|bullet|bullets|"
                rf"volley|volleys|burst|bursts|salvo|salvos|salvoes|barrel|barrels|clip|clips|magazine|magazines|"
                rf"chamber|chambers|cylinder|{_GUNS})\b",
                MAYBE,
            ),
        ),
    ),
    Group(
        "explosion",
        (
            "explo",
            "blast",
            "detonat",
            "blew",
            "blow",
            "burst",
            "erupt",
            "fireball",
            "shockwave",
            "shock wave",
            "concussion",
            "went off",
            "went up",
        ),
        (
            _rule(
                near(
                    "bomb|bombs|grenade|grenades|shell|shells|mine|mines|landmine|landmines|barrel|barrels|boiler|"
                    "boilers|engine|engines|charge|charges|powder|gunpowder|dynamite|explosives|explosive|magazine|gas|"
                    "tank|tanks|car|truck|lorry|van|building|wall|bridge|dam|rocket|rockets|missile|missiles|torpedo|"
                    "torpedoes|warhead|device|ship|factory|plant|depot|arsenal|ammunition|munitions|fuel|petrol|"
                    "gasoline|propane|gas main|cannon|mortar|shell",
                    "exploded|exploding|detonated|detonating|went "
                    "off|blew|blew up|blew apart|blew out|burst|bursting|erupted|erupting|ignited|igniting|went up|"
                    "blew sky-high|blew to pieces|was blown|were blown|blasted|blasting|disintegrated|flew apart|"
                    "tore apart|ripped apart|went off with|burst apart|mushroomed|fireballed",
                ),
                SURE,
            ),
            _rule(
                rf"\b{_A}(?:massive |huge |enormous |tremendous |terrific |terrible |mighty |great |"
                rf"violent |deafening |"
                rf"thunderous |distant |muffled |second |first |another |sudden |blinding |shattering |ear-splitting |"
                rf"earth-shaking |colossal |titanic |cataclysmic |fiery |roaring |dull )?(?:explosion|explosions|"
                rf"blast|blasts|detonation|detonations|eruption|fireball|fireballs|shockwave|shock wave|shock-wave|"
                rf"concussion)\b(?:\W+[\w-]+){{0,3}}\W+(?:rocked|shook|tore|ripped|split|shattered|rattled|lit|blew|"
                rf"threw|knocked|flung|hurled|sent|filled|echoed|rolled|thundered|boomed|roared|ripped through|tore "
                rf"through|lit up|blew out|blew in|went off|erupted|burst|came|followed|rang|resounded|reverberated|"
                rf"deafened|flattened|levelled|leveled|destroyed|demolished|obliterated|engulfed|swallowed|consumed|"
                rf"hit|struck|slammed|punched|smashed|crashed|rumbled)\b|\b(?:there was|came|there came|followed "
                rf"by|then came|and then|heard|hear|was followed by|felt|feel) {_A}(?:[\w-]+ )?(?:explosion|"
                rf"explosions|blast|blasts|detonation|detonations|eruption|fireball|shockwave|shock wave|"
                rf"concussion)\b",
                SURE,
            ),
            _rule(
                r"\b(?:explosion|explosions|exploded|exploding|detonation|detonated|detonating|blast|blasts|blew up|"
                r"blown up|blowing up|fireball|shockwave|shock wave)\b",
                MAYBE,
            ),
        ),
    ),
)
