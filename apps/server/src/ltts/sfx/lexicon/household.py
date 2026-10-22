# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Clocks, bells and swords.

Scope: A ticking clock (ambience), a clock striking the hour, a tolling bell and clashing blades.
Does NOT belong: Doors and latches (``doors.py``) or machines (``places.py``).
"""

from __future__ import annotations

from ltts.sfx.lexicon._shared import _A, _ADJ, FAINT, LIKELY, SURE, Group, _rule, near

GROUPS: tuple[Group, ...] = (
    Group(
        "clock-tick",
        ("clock", "watch", "timepiece", "pendulum", "metronome", "tick", "tock"),
        (
            _rule(
                near(
                    "clock|clocks|watch|timepiece|pendulum|wristwatch|pocket watch|carriage clock|metronome|timer",
                    "ticked|ticking|tick|ticks|tocked|tocking|tick-tocked|clicked|clicking|counted|counting|measured|"
                    "marked|whirred|whirring|swung|swinging|beat|beating|kept ticking|was ticking|went on ticking",
                ),
                SURE,
            ),
            _rule(
                rf"\b(?:tick|ticking|tick-tock|ticktock|tock|tocking|beat|beating|whirr|whir|click|clicking|rhythm|"
                rf"swing|swinging) of {_A}{_ADJ}(?:clock|clocks|watch|timepiece|pendulum|metronome|wristwatch|pocket "
                rf"watch)\b|\btick-tock\b|\bticktock\b|\btick, tock\b",
                SURE,
            ),
            _rule(r"\b(?:ticked|ticking)\b|\b(?:a |the )(?:[\w-]+ )?(?:clock|watch)\b", FAINT),
        ),
    ),
    Group(
        "clock-chime",
        ("clock", "chime", "struck", "strike", "hour", "midnight", "noon", "o'clock"),
        (
            _rule(
                rf"\b{_A}{_ADJ}(?:clock|clocks|timepiece|chimes) (?:[\w-]+ ){{0,2}}(?:struck|"
                rf"strikes|striking|chimed|chimes|"
                rf"chiming|sounded|sounding|rang|ringing|tolled|tolling|boomed|booming|began to strike|began to chime|"
                rf"was striking|was chiming|announced|marked|cuckooed|clanged)\b",
                SURE,
            ),
            _rule(
                r"\b(?:struck|chimed|rang|tolled|sounded|boomed|clanged|chiming|striking|ringing|tolling) (?:[\w-]+ )"
                r"{0,2}(?:the hour|the half hour|the half-hour|the quarter|the quarters|quarter past|half past|quarter "
                r"to|midnight|noon|midday|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[0-9]{1,2}|"
                r"o'clock)\b",
                SURE,
            ),
            _rule(
                rf"\b(?:chime|chimes|chiming|strike|striking|stroke|strokes|toll|tolling|bong|bongs|note|notes|voice|"
                rf"sound) of {_A}{_ADJ}(?:clock|clocks|the hour|midnight|noon|midday|the hours|the quarter|the "
                rf"half-hour|the half hour)\b|\bthe chimes\b",
                LIKELY,
            ),
        ),
    ),
    Group(
        "bell-toll",
        ("bell", "carillon", "belfry", "steeple", "campanile"),
        (
            _rule(
                near(
                    "bell|bells|church bell|church bells|handbell|handbells|cowbell|cowbells|sleigh bells|doorbell|"
                    "carillon",
                    "tolled|tolling|rang|ringing|rings|pealed|pealing|clanged|clanging|chimed|chiming|"
                    "sounded|sounding|boomed|booming|jangled|jangling|jingled|jingling|tinkled|tinkling|clamoured|"
                    "clamored|answered|began to ring|began to toll|were ringing|was ringing|were tolling|was tolling|"
                    "rang out|tolled out|pealed out|clanged out|knelled|summoned|called|struck|swung|tolls|peals|"
                    "clangs|chimes",
                ),
                SURE,
            ),
            _rule(
                rf"\b(?:toll|tolling|peal|pealing|peals|clang|clanging|clangour|clangor|ring|ringing|chime|chiming|"
                rf"chimes|jangle|jangling|jingle|jingling|tinkle|tinkling|boom|booming|note|notes|voice|voices|sound|"
                rf"clamour|clamor|knell|knelling|din|music|song) of {_A}{_ADJ}(?:bell|bells|church bell|church bells|"
                rf"handbell|handbells|cowbell|cowbells|sleigh bells|doorbell|carillon|bell tower|belfry|steeple|"
                rf"campanile)\b",
                SURE,
            ),
            _rule(
                r"\b(?:church|chapel|temple|village|town|cathedral|monastery|abbey|convent|priory|ship's|school|"
                r"harbour|harbor|alarm|fire|warning|wedding|funeral|evening|morning|vesper|curfew|dinner|distant|"
                r"far-off|faint|muffled|great|deep|iron|bronze|brass|silver|cracked) bells?\b|\bthe bell\b|\bbells\b",
                FAINT,
            ),
        ),
    ),
    Group(
        "sword-clash",
        (
            "sword",
            "blade",
            "steel",
            "sabre",
            "saber",
            "rapier",
            "cutlass",
            "axe",
            "shield",
            "spear",
            "lance",
            "dagger",
            "knife",
            "knives",
            "scimitar",
            "katana",
            "halberd",
            "pike",
            "weapon",
            "duel",
            "melee",
            "mêlée",
            "fray",
            "swordplay",
        ),
        (
            _rule(
                near(
                    "sword|swords|blade|blades|steel|sabre|sabres|saber|sabers|rapier|rapiers|cutlass|cutlasses|axe|"
                    "axes|shield|shields|spear|spears|lance|lances|dagger|daggers|knife|knives|scimitar|scimitars|"
                    "katana|katanas|broadsword|broadswords|longsword|longswords|halberd|halberds|pike|pikes|weapons|"
                    "weapon|edges|edge",
                    "clashed|clashing|clash|clashes|rang|ringing|rings|clanged|clanging|clangs|"
                    "met|meeting|crashed|crashing|sang|singing|clattered|clattering|scraped|scraping|bit|biting|"
                    "struck|striking|hammered|hammering|chimed|chiming|screeched|screeching|shrieked|shrieking|"
                    "grated|grating|slid|sliding|locked|locking|crossed|crossing|came together|kissed|whistled|"
                    "whistling|hissed|hissing|cut the air|rasped|rasping|jarred|jarring|sparked|sparking|crunched|"
                    "crunching|rebounded|shivered|shivering|parried|parrying|blocked|blocking|deflected|deflecting|"
                    "glanced|glancing|skittered|skittering|skated|skating|slithered|slithering",
                ),
                LIKELY,
            ),
            _rule(
                rf"\b(?:clash|clashing|clang|clanging|clangour|clangor|ring|ringing|clatter|clattering|screech|"
                rf"screeching|shriek|shrieking|scrape|scraping|rasp|rasping|crash|crashing|song|music|din|racket|"
                rf"sound|sounds|noise|chime|hammer|hammering|bite|kiss|shock|jar|jarring|hiss|hissing|whistle|"
                rf"whistling|whisper|whir|whirr|whirring|flash|flashing|spark|sparks|sparking|thud|thudding|crunch|"
                rf"crunching|snap|snapping) of {_A}{_ADJ}(?:steel|swords|blades|sword on sword|blade on blade|steel on "
                rf"steel|iron on iron|metal on metal|metal|arms|weapons|battle|combat|swordplay|duel|fight|melee|"
                rf"mêlée|fray|sword|axe|axes|shields|spears|lances|sabres|sabers|rapiers|cutlasses|daggers|knives|"
                rf"fighting)\b|\bsteel (?:on|against|met|rang on|rang against|clashed with|struck) steel\b|\bblade "
                rf"(?:on|against|met|rang on|rang against|clashed with|struck|kissed) blade\b|\bsword (?:on|against|"
                rf"met|rang on|rang against|clashed with|struck|kissed) sword\b|\bblades (?:met|crossed|locked|"
                rf"clashed|rang|sang|kissed|came together)\b|\bswords (?:met|crossed|locked|clashed|rang|sang|kissed|"
                rf"came together)\b|\bsteel (?:rang|sang|clashed|met)\b",
                SURE,
            ),
            _rule(
                r"\b(?:swords|blades|steel|sabres|sabers|rapiers|cutlasses|axes|shields|spears|lances|a sword|the "
                r"sword|a blade|the blade|swordplay|the duel|the melee|the mêlée|the fray)\b",
                FAINT,
            ),
        ),
    ),
)
