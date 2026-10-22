# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""
Purpose: A labelled evaluation corpus for the sound-effect detector: varied passages, each sentence
  marked with the events a careful reader would accept there, or nothing.
Scope: Ten kinds of writing (literal events, metaphor and simile, negated events, quoted dialogue,
  recollection, repeated actions, fantasy and adventure, mystery and suspense, poetry, nonfiction),
  each as paragraphs of sentences so quotations and context carry across sentences as they do in a
  document. A label is a set of acceptable events: any one of them counts; an empty set means the
  sentence should stay silent. All passages were written for this corpus.
Does NOT belong: The measurement itself (test_sound_evaluation.py) or detector rules.
"""

from __future__ import annotations

Labelled = tuple[str, set[str]]
Paragraph = list[Labelled]

NONE: set[str] = set()
RAIN = {"rain-light", "rain-heavy"}
THUNDER = {"thunder-distant", "thunder-close"}
WIND = {"wind-gust", "wind-howl"}
FOOTSTEPS = {"footsteps-wood", "footsteps-stone", "footsteps-gravel", "footsteps-run"}
DOOR_SHUT = {"door-close", "door-slam"}

CORPUS: dict[str, list[Paragraph]] = {
    "literal events": [
        [
            ("Rain drummed on the tin roof all through supper.", RAIN),
            ("Somewhere to the west, thunder rolled across the hills.", THUNDER),
            ("The back door creaked as Mara pushed it open.", {"door-creak"}),
            ("She stepped onto the gravel path and it crunched under her boots.", {"footsteps-gravel"}),
            ("A dog barked twice from the neighbour's yard and fell quiet.", {"dog-bark"}),
            ("Inside, the kitchen clock ticked against the silence.", {"clock-tick"}),
        ],
        [
            ("The train rattled past the end of the platform without stopping.", {"train-pass"}),
            ("A car passed slowly on the wet road, its tyres hissing.", {"car-pass"}),
            ("Glass shattered on the floor of the shop below.", {"glass-break"}),
            ("He knocked three times on the door and waited.", {"door-knock"}),
            ("The door slammed shut behind him.", {"door-slam"}),
            ("Waves broke against the sea wall below the promenade.", {"waves"}),
        ],
        [
            ("The fire crackled in the grate while the wind howled outside.", {"fire-crackle", "wind-howl"}),
            ("An owl hooted from the oak at the end of the garden.", {"owl"}),
            ("Crickets chirped in the long grass by the stream.", {"crickets", "stream"}),
            ("Birds sang in the hedgerow as the sun came up.", {"birdsong"}),
            ("The church bell tolled nine.", {"bell-toll", "clock-chime"}),
            ("A gunshot echoed across the marsh.", {"gunshot"}),
        ],
    ],
    "metaphor and simile": [
        [
            ("A storm of protest followed the announcement.", NONE),
            ("The news hit him like a thunderclap.", NONE),
            ("Her laughter rippled through the room like a stream over stones.", NONE),
            ("His voice was gravel, low and tired.", NONE),
            ("The city was a machine that never slept.", NONE),
            ("Hope knocked softly at the door of her heart.", NONE),
        ],
        [
            ("The crowd's silence was louder than any explosion.", NONE),
            ("Guilt howled through him like a winter wind.", NONE),
            ("Each word fell like a slammed door.", NONE),
            ("He had a heart like a ticking clock, always counting.", NONE),
            ("The rumour spread like fire through dry grass.", NONE),
            ("She was thunder in a small room.", NONE),
        ],
    ],
    "negated events": [
        [
            ("No bell rang that morning.", NONE),
            ("The dog did not bark when the stranger came to the gate.", NONE),
            ("There were no footsteps on the stairs, only the hum of the fridge.", {"machine-hum"}),
            ("It had not rained for weeks.", NONE),
            ("The clock had stopped ticking years ago.", NONE),
            ("Not a single car passed all night.", NONE),
        ],
        [
            ("Nobody knocked.", NONE),
            ("The thunder never came; the clouds simply moved on.", NONE),
            ("The fire had gone out and the crickets had stopped.", NONE),
            ("No train ran on Sundays.", NONE),
            ("The owls were silent for once.", NONE),
            ("Nothing shattered, nothing fell; the shelf held.", NONE),
        ],
    ],
    "quoted dialogue": [
        [
            ("“Did you hear thunder just now?” Lena asked.", NONE),
            ("“That was the door slamming,” her brother said.", NONE),
            ("“A dog was barking all night,” she went on, “and then a car pulled up.”", NONE),
            ("“You imagined it.”", NONE),
            ("“Listen,” she said, and as she spoke the rain began to fall against the window.", RAIN),
            ("He said nothing, and the clock ticked between them.", {"clock-tick"}),
        ],
        [
            ("“The bells will toll at noon, and the crowd will cheer,” the mayor promised.", NONE),
            ("“And if it rains?”", NONE),
            ("“Then it rains.”", NONE),
            ("Outside the hall, a gust of wind rattled the shutters.", {"wind-gust"}),
            ("“Horses,” someone whispered. “I can hear hooves.”", NONE),
            ("Hooves clattered into the square.", {"horse-hooves"}),
        ],
    ],
    "recollection": [
        [
            ("Years ago, the bells had tolled every Sunday from the hill.", NONE),
            ("He remembered the night the train had passed through the valley for the last time.", NONE),
            ("When she was a child, a stream had run behind the house.", NONE),
            ("Back then the wind had howled all winter.", NONE),
            ("She could still recall how the door used to creak.", NONE),
            ("Once, long before, a gunshot had woken the whole street.", NONE),
        ],
        [
            ("His grandmother had kept a clock that chimed on the half hour.", NONE),
            ("They had watched the waves from that same window as boys.", NONE),
            ("If the dog had barked, he would have heard it.", NONE),
            ("Had it rained, the match would have been cancelled.", NONE),
            ("She imagined the explosion she had only read about.", NONE),
            ("Now the kitchen clock ticked, and he was back in the present.", {"clock-tick"}),
        ],
    ],
    "repeated actions": [
        [
            ("Every evening the dog barked at the postman.", NONE),
            ("The clock chimed each hour, as it always did.", NONE),
            ("She used to hear the owls calling from the wood.", NONE),
            ("The trains came through twice a day, morning and dusk.", NONE),
            ("On Fridays the crowd gathered in the square.", NONE),
            ("It always rained on their anniversary.", NONE),
        ],
        [
            ("Whenever the wind got up, the shutters would bang.", NONE),
            ("He knocked on that door every morning for a year.", NONE),
            ("The machines hummed day and night in the mill.", NONE),
            ("Sometimes a car would pass, but mostly the road was empty.", NONE),
            ("That night, for once, a car did pass, slowly, with its lights off.", {"car-pass"}),
            ("The fire had to be lit every evening.", NONE),
        ],
    ],
    "fantasy and adventure": [
        [
            ("Thunder cracked directly overhead and the tower shook.", {"thunder-close"}),
            ("The great bell of the keep tolled the alarm.", {"bell-toll"}),
            ("Steel rang on steel as the two knights met in the gateway.", {"sword-clash"}),
            ("Hooves pounded across the plain towards the river.", {"horse-hooves"}),
            ("The wolf pack howled from the black line of the forest.", {"wolf-howl"}),
            ("Rain lashed the battlements through the night.", RAIN),
        ],
        [
            ("The dragon was a legend, and legends make no sound.", NONE),
            ("Her courage was a sword she had never drawn.", NONE),
            ("The iron door groaned open on its hinges.", {"door-creak"}),
            ("The powder store exploded with a roar that lifted the roof.", {"explosion"}),
            ("Footsteps rang on the stone stair below them.", {"footsteps-stone"}),
            ("A fire crackled in the hearth of the empty hall.", {"fire-crackle"}),
        ],
    ],
    "mystery and suspense": [
        [
            ("Someone knocked, three times, at the back door.", {"door-knock"}),
            ("A car pulled up outside with its engine running.", {"car-pass"}),
            ("The clock on the mantel ticked on.", {"clock-tick"}),
            ("Upstairs, glass broke.", {"glass-break"}),
            ("Footsteps crossed the hall above her head.", FOOTSTEPS),
            ("A shot rang out in the yard.", {"gunshot"}),
        ],
        [
            ("Was that a door closing somewhere in the house?", NONE),
            ("She told herself it was only the wind.", NONE),
            ("The detective did not believe in coincidences.", NONE),
            ("The telephone sat silent; the clock did not.", NONE),
            ("A floorboard gave a creak under a weight that was not hers.", NONE),
            ("Then the front door opened, and closed, quietly.", DOOR_SHUT),
        ],
    ],
    "poetry": [
        [
            ("My heart is a bell that will not toll.", NONE),
            ("Thunder of hooves in my veins, and no horse.", NONE),
            ("O wind, you howl, but not for me.", NONE),
            ("The rain falls on the just and the unjust alike.", NONE),
            ("Let the door of morning creak upon its hinge.", NONE),
            ("I am the sea and I break against myself.", NONE),
        ],
        [
            ("Tonight the rain is real, and taps the glass.", RAIN),
            ("A dog barks; the dark replies.", {"dog-bark"}),
            ("Somewhere a clock ticks down the year.", {"clock-tick"}),
            ("What is a bell but a wound that sings?", NONE),
            ("Crickets stitch the long grass with their sound.", {"crickets"}),
            ("And the train that never came still goes.", NONE),
        ],
    ],
    "nonfiction": [
        [
            ("Thunder is the sound produced by the rapid expansion of air around a lightning channel.", NONE),
            ("Dogs bark to communicate, and the pitch of the bark carries meaning.", NONE),
            ("The branch line was closed in 1964 and the last train ran that June.", NONE),
            ("Rainfall in the valley averages eight hundred millimetres a year.", NONE),
            ("A door closer slows the leaf so it cannot slam.", NONE),
            ("The tower's bell weighs thirteen tonnes and is rung by machine.", NONE),
        ],
        [
            ("Crickets produce sound by rubbing their forewings together.", NONE),
            ("The explosion of 1917 flattened two square kilometres of the city.", NONE),
            ("Modern engines idle so quietly that pedestrians often do not hear a car approaching.", NONE),
            ("Owls hunt by sound and can locate prey in complete darkness.", NONE),
            ("In the recording, footsteps can be heard approaching the microphone.", NONE),
            ("Waves transfer energy, not water, across the open ocean.", NONE),
        ],
    ],
}
