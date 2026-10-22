# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The sentences that say an ambience has ended.

Scope: One pattern per looping event (rain, wind, fire, crickets, clocks, crowds, the city, machines, water):
the first later sentence it matches is where the ambience stops.
Does NOT belong: Finding where an ambience starts (the category modules, ``detect.py``).
"""

from __future__ import annotations

import re

from ltts.sfx.lexicon._shared import _CROWD, _MACHINES

# A sentence that says an ambience has ended; the ambience stops at that sentence.
STOPS: dict[str, re.Pattern[str]] = {
    "rain-light": re.compile(
        r"\b(?:rain|drizzle|downpour|storm|shower|rains)\b(?:\W+[\w-]+){0,3}\W+(?:stopped|ceased|ended|passed|eased|"
        r"eased off|let up|died|died away|died down|faded|petered out|cleared|blew over|moved on|was over|had "
        r"stopped|had passed|had ceased|had ended|was gone|had gone)\b|\bthe sun (?:came out|broke through|"
        r"appeared)\b|\b(?:it|the sky) (?:had )?(?:stopped raining|cleared)\b",
        re.IGNORECASE,
    ),
    "wind-howl": re.compile(
        r"\b(?:wind|gale|storm|blizzard)\b(?:\W+[\w-]+){0,3}\W+(?:dropped|died|died down|died away|fell|eased|stopped|"
        r"ceased|calmed|stilled|subsided|faded|abated|was gone|had dropped|had died|blew itself out|blew over|"
        r"passed|had passed)\b|\bthe air (?:was|grew|went|fell) (?:still|calm|quiet)\b",
        re.IGNORECASE,
    ),
    "fire-crackle": re.compile(
        r"\b(?:fire|flames|embers|hearth|campfire|bonfire|coals|logs)\b(?:\W+[\w-]+){0,3}\W+(?:died|died down|died "
        r"away|went out|burned out|burnt out|burned low|burnt low|guttered out|faded|was out|were out|had gone out|"
        r"had died|sank|settled into|collapsed into|was cold|were cold|had burned down|had burnt down)\b|\b(?:put "
        r"out|doused|stamped out|smothered|kicked out|quenched|extinguished) the (?:fire|flames|campfire|"
        r"bonfire|embers)\b",
        re.IGNORECASE,
    ),
    "crickets": re.compile(
        r"\b(?:crickets|cicadas|insects|frogs)\b(?:\W+[\w-]+){0,3}\W+(?:fell silent|stopped|ceased|went quiet|were "
        r"silent|had stopped|were still|hushed)\b|\bdawn\b|\bsunrise\b|\bthe sun rose\b|\bmorning came\b|\bfirst "
        r"light\b|\bday broke\b|\bdaybreak\b",
        re.IGNORECASE,
    ),
    "clock-tick": re.compile(
        r"\b(?:clock|watch|pendulum)\b(?:\W+[\w-]+){0,3}\W+(?:stopped|had stopped|fell silent|ran down|was silent|"
        r"went silent|was still|had run down)\b",
        re.IGNORECASE,
    ),
    "crowd-murmur": re.compile(
        rf"\b(?:{_CROWD})\b(?:\W+[\w-]+){{0,3}}\W+(?:fell silent|went quiet|went silent|hushed|was hushed|were hushed|"
        r"was silent|were silent|grew quiet|grew silent|quietened|quieted|dispersed|thinned|emptied|had gone|was "
        r"empty|were gone|drifted away|melted away|dwindled|fell still|held its breath|held their breath)\b|"
        r"\bsilence fell\b|\ba hush fell\b|\ba silence fell\b|\bthe silence\b|\bthe room was silent\b|\bthe room "
        r"was quiet\b|\bthe hall was silent\b|\bthe hall was quiet\b",
        re.IGNORECASE,
    ),
    "city-distant": re.compile(
        r"\b(?:closed|shut|drew|pulled) the (?:window|windows|door|doors|shutters|curtains|blinds)\b|\bthe (?:city|"
        r"street|streets|town|traffic|docks|harbour|harbor|port)\b(?:\W+[\w-]+){0,3}\W+(?:fell silent|went quiet|was "
        r"quiet|was silent|slept|was asleep|had gone quiet|grew quiet|was still|were still|had fallen silent|"
        r"were silent|were quiet)\b",
        re.IGNORECASE,
    ),
    "machine-hum": re.compile(
        rf"\b(?:{_MACHINES})\b(?:\W+[\w-]+){{0,3}}\W+(?:stopped|fell silent|died|died away|went quiet|shut down|were "
        r"shut down|was shut down|cut out|cut off|wound down|was switched off|were switched off|was turned off|"
        r"were turned off|went dead|ground to a halt|fell quiet|was still|were still|had stopped)\b|\b(?:switched "
        rf"off|turned off|shut off|shut down|killed|cut|stopped) the (?:{_MACHINES})\b",
        re.IGNORECASE,
    ),
}
STOPS["rain-heavy"] = STOPS["rain-light"]
STOPS["stream"] = re.compile(
    r"\b(?:left|leaving|away from|out of earshot of|out of sight of|behind them|behind him|behind her|behind us) the "
    r"(?:river|stream|brook|creek|water|waterfall|rapids)\b",
    re.IGNORECASE,
)
STOPS["waves"] = re.compile(
    r"\b(?:left|leaving|away from|out of earshot of|out of sight of|behind them|behind him|behind her|behind us) the "
    r"(?:shore|beach|sea|water|waves|coast|harbour|harbor|cliffs|cove|bay|strand|surf)\b|\b(?:closed|shut) the "
    r"(?:window|windows|door|doors|shutters|hatch|porthole|portholes)\b",
    re.IGNORECASE,
)
