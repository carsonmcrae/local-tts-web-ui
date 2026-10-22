# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The recipes for every bundled sound effect, and the table that describes them.

Scope: One function per sound, built from sfx_synth.py primitives with fixed seeds (weather, water,
fire, animals, doors, footsteps, household, impacts, vehicles, atmosphere), and SOUNDS: each sound's
id, recipe, name, category, description, keywords, the events it serves, whether it loops and its
recommended gain. Changing a recipe changes the file; the build records the new size and hash.
Does NOT belong: Levelling, encoding or the manifest (sound-library.py) or the primitives (sfx_synth.py).
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np

from sfx_synth import (
    RATE,
    Signal,
    at,
    band,
    brown,
    envelope,
    harmonics,
    loopable,
    mix,
    partials,
    pink,
    room,
    scatter,
    seconds,
    silence,
    sweep,
    white,
    wobble,
)


def _steps(count: int, spacing: float, thump: Signal, click: Signal, seed: int, jitter: float = 0.04) -> Signal:
    rng = np.random.default_rng(seed)
    out = silence(count * spacing + 0.6)
    for number in range(count):
        moment = number * spacing + rng.uniform(0, jitter)
        at(out, moment, thump, rng.uniform(0.7, 1.0))
        at(out, moment + 0.004, click, rng.uniform(0.5, 1.0))
    return out


def _thump(freq: float, decay: float, seed: int) -> Signal:
    body = partials(decay * 1.2, freq, [(1, 1.0, decay), (1.6, 0.4, decay * 0.6)], seed)
    return body * envelope(decay * 1.2, 0.002, decay)


def _click(low: float, high: float, length: float, seed: int) -> Signal:
    return band(white(length, seed), low, high) * envelope(length, 0.001, length * 0.6)


def rain_light() -> Signal:
    drop = band(white(0.012, 1), 2_000, 9_000) * envelope(0.012, 0.001, 0.008)
    drops = scatter(9.0, 400, drop, 2) * 0.5
    bed = band(pink(9.0, 3), 600, 7_000) * 0.25 * wobble(9.0, 0.3, 0.2, 4)
    return loopable(drops + bed, 1.0)


def rain_heavy() -> Signal:
    drop = band(white(0.010, 5), 1_500, 10_000) * envelope(0.010, 0.001, 0.007)
    drops = scatter(9.0, 1_600, drop, 6) * 0.4
    bed = band(pink(9.0, 7), 300, 9_000) * 0.6 * wobble(9.0, 0.4, 0.25, 8)
    return loopable(drops + bed, 1.0)


def thunder_distant() -> Signal:
    rumble = band(brown(7.0, 10), 30, 260) * wobble(7.0, 1.5, 0.5, 11)
    return rumble * envelope(7.0, 0.8, 4.5, hold=0.4)


def thunder_close() -> Signal:
    out = band(white(0.25, 12), 150, 5_000) * envelope(0.25, 0.002, 0.18)
    out = np.concatenate([out, silence(5.5)])
    out += band(brown(5.75, 13), 25, 400) * envelope(5.75, 0.05, 4.0, hold=0.3) * wobble(5.75, 2.0, 0.4, 14)
    return out


def wind_gust() -> Signal:
    length = 4.5
    centre = 300 + 900 * envelope(length, 1.2, 2.2, curve=1.5)
    noise = pink(length, 15)
    out = np.zeros(seconds(length))
    for lo, hi, weight in ((150, 500, 0.4), (400, 1_200, 0.5), (900, 2_500, 0.3)):
        gain = np.exp(-(((centre - (lo + hi) / 2) / (hi - lo)) ** 2))
        out += band(noise, lo, hi) * gain * weight
    return out * envelope(length, 1.2, 2.4)


def wind_howl() -> Signal:
    length = 11.0
    body = band(pink(length, 16), 200, 1_800) * wobble(length, 0.5, 0.45, 17)
    whistle = band(pink(length, 18), 550, 900, order=4) * wobble(length, 0.35, 0.7, 19) * 1.8
    return loopable(body + whistle, 1.5)


def stream() -> Signal:
    length = 9.0
    water = band(pink(length, 20), 500, 6_000) * wobble(length, 1.0, 0.25, 21)
    blip = sweep(0.03, 900, 2_600) * envelope(0.03, 0.002, 0.02)
    bubbles = scatter(length, 14, blip, 22) * 0.12
    return loopable(water + bubbles, 1.0)


def waves() -> Signal:
    length = 13.0
    t = np.arange(seconds(length)) / RATE
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * t / 6.5 - np.pi / 2)
    swell = swell**2.2
    noise = pink(length, 23)
    out = band(noise, 80, 900) * (0.3 + 0.4 * swell) + band(noise, 800, 6_000) * swell * 0.7
    return loopable(out, 1.0)


def fire_crackle() -> Signal:
    length = 9.0
    bed = band(brown(length, 24), 60, 500) * 0.35 * wobble(length, 0.8, 0.35, 25)
    crackle = scatter(length, 9, _click(1_500, 8_000, 0.012, 26), 27) * 0.9
    pops = scatter(length, 1.2, _click(300, 2_000, 0.03, 28), 29) * 0.7
    hiss = band(pink(length, 30), 2_000, 9_000) * 0.05
    return loopable(bed + crackle + pops + hiss, 1.0)


def crickets() -> Signal:
    length = 9.0
    rng = np.random.default_rng(31)
    out = silence(length)
    for pitch in (4_100.0, 4_350.0, 3_900.0):
        t = np.arange(seconds(0.16)) / RATE
        chirp = np.sin(2 * np.pi * pitch * t) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 28 * t)))
        chirp *= envelope(0.16, 0.01, 0.1, hold=0.05)
        moment = rng.uniform(0, 0.4)
        while moment < length - 0.2:
            at(out, moment, chirp, rng.uniform(0.5, 1.0))
            moment += rng.uniform(0.32, 0.55)
    return loopable(out * 0.5, 0.5)


def birdsong() -> Signal:
    rng = np.random.default_rng(32)
    out = silence(6.5)
    moment = 0.2
    for _ in range(14):
        up = rng.random() < 0.6
        length = rng.uniform(0.05, 0.14)
        start, end = rng.uniform(2_200, 4_200), rng.uniform(2_800, 5_500)
        note = sweep(length, start if up else end, end if up else start) * envelope(length, 0.01, length * 0.7)
        at(out, moment, note, rng.uniform(0.5, 1.0))
        moment += length + rng.uniform(0.04, 0.6 if rng.random() < 0.3 else 0.12)
    return out


def owl() -> Signal:
    out = silence(3.2)
    for moment, length in ((0.2, 0.45), (0.95, 0.7)):
        tone = sweep(length, 390, 340) * envelope(length, 0.08, length * 0.6, hold=length * 0.2)
        breath = band(pink(length, 33), 250, 900) * envelope(length, 0.08, length * 0.5) * 0.15
        at(out, moment, tone + breath)
    return band(out, 120, 1_600)


def wolf_howl() -> Signal:
    length = 5.0
    n = seconds(length)
    progress = np.linspace(0, 1, n)
    glide = 300 + 220 * np.clip(progress / 0.25, 0, 1) - 180 * np.clip((progress - 0.45) / 0.55, 0, 1)
    vibrato = 1 + 0.012 * np.sin(2 * np.pi * 5.5 * np.arange(n) / RATE)
    voice = harmonics(length, glide * vibrato, [1.0, 0.55, 0.3, 0.18, 0.1])
    voice = band(voice, 200, 2_400) * envelope(length, 0.35, 1.6, hold=2.6)
    return voice + band(pink(length, 34), 300, 1_500) * envelope(length, 0.35, 1.6, hold=2.6) * 0.06


def dog_bark() -> Signal:
    out = silence(2.6)
    rng = np.random.default_rng(35)
    for moment in (0.2, 0.62, 1.45):
        length = 0.16
        pitch = np.linspace(520, 330, seconds(length)) * rng.uniform(0.95, 1.05)
        bark = harmonics(length, pitch, [1.0, 0.8, 0.5, 0.35, 0.2, 0.1]) * envelope(length, 0.008, 0.1)
        bark += band(white(length, 36), 500, 3_500) * envelope(length, 0.004, 0.06) * 0.3
        at(out, moment, band(bark, 250, 4_000))
    return out


def horse_hooves() -> Signal:
    clop = mix(_thump(170, 0.07, 37) * 0.8, _click(400, 2_500, 0.025, 38) * 0.9)
    out = silence(5.5)
    rng = np.random.default_rng(39)
    moment = 0.3
    while moment < 5.0:
        for gap in (0.0, 0.11, 0.33, 0.44):  # a four-beat gallop
            at(out, moment + gap + rng.uniform(0, 0.015), clop, rng.uniform(0.6, 1.0))
        moment += 0.9
    passing = envelope(5.5, 2.2, 2.0, hold=0.6, curve=2.0)
    return out * passing


def door_creak() -> Signal:
    length = 2.4
    n = seconds(length)
    rng = np.random.default_rng(40)
    jitter = np.interp(np.arange(n), np.linspace(0, n, 60), rng.uniform(-1, 1, 60))
    freq = 210 * (1 + 0.12 * jitter) * (1 + 0.15 * np.linspace(0, 1, n))
    slips = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 9 * np.arange(n) / RATE + 2 * jitter))
    voice = harmonics(length, freq, [1.0, 0.7, 0.5, 0.4, 0.3, 0.25, 0.2]) * slips
    voice = band(voice, 180, 3_200) * envelope(length, 0.15, 0.6, hold=1.5) * wobble(length, 3.0, 0.3, 41)
    thump = _thump(110, 0.12, 42) * 0.5
    at(voice, 2.05, thump)
    return voice


def door_close() -> Signal:
    out = silence(1.3)
    at(out, 0.05, mix(_thump(95, 0.18, 43), band(white(0.05, 44), 150, 900) * envelope(0.05, 0.002, 0.03) * 0.4))
    at(out, 0.17, _click(2_000, 7_000, 0.02, 45) * 0.5)
    return room(out, 0.4, 0.15, 46)


def door_slam() -> Signal:
    out = silence(1.6)
    at(out, 0.03, mix(_thump(70, 0.32, 47) * 1.2, band(white(0.12, 48), 80, 700) * envelope(0.12, 0.002, 0.08)))
    at(out, 0.03, _click(900, 5_000, 0.15, 49) * 0.6)
    at(out, 0.11, _click(2_500, 7_000, 0.06, 50) * 0.3)
    return room(out, 0.9, 0.3, 51)


def door_knock() -> Signal:
    knock = mix(_thump(125, 0.09, 52), partials(0.09, 420, [(1, 0.35, 0.05)], 53), _click(1_200, 4_000, 0.01, 54) * 0.6)
    out = silence(1.9)
    for moment in (0.1, 0.42, 0.74):
        at(out, moment, knock)
    return room(out, 0.35, 0.12, 55)


def footsteps_wood() -> Signal:
    return _steps(6, 0.62, _thump(140, 0.08, 56), _click(600, 2_500, 0.015, 57) * 0.5, 58)


def footsteps_stone() -> Signal:
    steps = _steps(6, 0.6, _thump(220, 0.04, 59) * 0.4, _click(1_200, 5_000, 0.012, 60), 61)
    return room(steps, 0.5, 0.22, 62)


def footsteps_gravel() -> Signal:
    crunch = band(white(0.11, 63), 1_000, 8_000) * envelope(0.11, 0.01, 0.07) * wobble(0.11, 80, 0.7, 64)
    return _steps(6, 0.64, _thump(120, 0.05, 65) * 0.3, crunch, 66)


def footsteps_run() -> Signal:
    return _steps(10, 0.29, _thump(150, 0.06, 67) * 0.8, _click(600, 3_000, 0.012, 68) * 0.5, 69, jitter=0.02)


def clock_tick() -> Signal:
    tick = mix(_click(2_500, 7_000, 0.006, 70), partials(0.03, 1_300, [(1, 0.4, 0.02)], 71))
    tock = mix(_click(1_800, 5_000, 0.007, 72), partials(0.03, 950, [(1, 0.4, 0.02)], 73))
    out = silence(4.0)
    for number in range(8):
        at(out, number * 0.5, tick if number % 2 == 0 else tock)
    return out


def clock_chime() -> Signal:
    strike = partials(3.0, 660, [(1, 1.0, 2.6), (2.4, 0.45, 1.6), (3.9, 0.25, 1.0), (5.5, 0.12, 0.6)], 74)
    out = silence(6.5)
    for moment in (0.1, 1.4, 2.7):
        at(out, moment, strike)
    return out


def bell_toll() -> Signal:
    toll = partials(5.5, 220, [(0.5, 0.5, 5.0), (1, 1.0, 4.5), (1.2, 0.5, 3.5), (1.5, 0.35, 2.5), (2, 0.4, 2.0),
                               (2.5, 0.2, 1.4), (3, 0.15, 1.0)], 75)  # fmt: skip
    toll = mix(toll, _click(1_000, 4_000, 0.02, 76) * 0.2)
    out = silence(7.0)
    for moment in (0.1, 2.8):
        at(out, moment, toll)
    return out


def sword_clash() -> Signal:
    rng = np.random.default_rng(77)
    ratios = [(float(r), float(level), float(decay)) for r, level, decay in
              zip(rng.uniform(1, 3.5, 7), rng.uniform(0.2, 1.0, 7), rng.uniform(0.15, 0.5, 7), strict=True)]  # fmt: skip
    clash = mix(partials(0.6, 2_100, ratios, 78), _click(1_500, 9_000, 0.03, 79) * 0.8)
    out = silence(2.0)
    at(out, 0.05, clash)
    at(out, 0.7, clash * 0.8)
    return out


def glass_break() -> Signal:
    out = silence(2.2)
    at(out, 0.02, _click(800, 9_000, 0.06, 80))
    rng = np.random.default_rng(81)
    for _ in range(70):
        moment = 0.03 + rng.exponential(0.25)
        if moment > 1.6:
            continue
        ping = partials(0.25, rng.uniform(2_800, 9_000), [(1, 1.0, 0.12), (1.7, 0.4, 0.06)], int(rng.integers(1e6)))
        at(out, moment, ping, rng.uniform(0.2, 0.9))
    return out


def thud() -> Signal:
    length = 1.2
    pitch = np.linspace(140, 55, seconds(length))
    body = harmonics(length, pitch, [1.0, 0.4, 0.15]) * envelope(length, 0.003, 0.28)
    body = mix(body, band(white(0.06, 82), 60, 500) * envelope(0.06, 0.002, 0.04) * 0.5)
    return room(body, 0.5, 0.18, 83)


def gunshot() -> Signal:
    out = silence(1.6)
    at(out, 0.02, white(0.006, 84) * envelope(0.006, 0.0005, 0.004) * 1.5)
    at(out, 0.02, band(white(0.18, 85), 90, 1_800) * envelope(0.18, 0.002, 0.12))
    return room(out, 1.1, 0.35, 86)


def explosion() -> Signal:
    length = 4.2
    out = band(white(0.08, 87), 200, 6_000) * envelope(0.08, 0.001, 0.05)
    out = np.concatenate([out, silence(length - 0.08)])
    out += band(brown(length, 88), 18, 220) * envelope(length, 0.04, 2.8, hold=0.2) * 1.6
    out += scatter(length, 6, _click(800, 5_000, 0.02, 89), 90) * envelope(length, 0.3, 1.8) * 0.4
    return out


def car_pass() -> Signal:
    length = 5.5
    n = seconds(length)
    progress = np.linspace(0, 1, n)
    doppler = 1.14 - 0.3 / (1 + np.exp(-(progress - 0.5) * 14))
    engine = harmonics(length, 95 * doppler * wobble(length, 6, 0.02, 91), [1.0, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1])
    engine = band(engine, 60, 1_200) * 0.6
    road = band(pink(length, 92), 300, 2_500) * 0.8
    passing = envelope(length, 2.4, 2.0, hold=0.4, curve=2.5)
    return (engine + road) * passing


def train_pass() -> Signal:
    length = 10.0
    n = seconds(length)
    progress = np.linspace(0, 1, n)
    doppler = 1.1 - 0.22 / (1 + np.exp(-(progress - 0.5) * 12))
    rumble = band(brown(length, 93), 40, 320) * wobble(length, 2.0, 0.3, 94) * 1.3
    hiss = band(pink(length, 95), 800, 5_000) * 0.25
    clack = mix(_click(700, 4_000, 0.02, 96), _thump(180, 0.04, 97) * 0.6)
    out = rumble + hiss
    rng = np.random.default_rng(98)
    beat = 0.0
    while beat < length:
        for gap in (0.0, 0.14):
            at(out, beat + gap, clack, rng.uniform(0.5, 0.9))
        beat += 0.42 / float(np.interp(beat, [0, length], [1.0, 0.8]))
    whistle = harmonics(1.2, np.full(seconds(1.2), 520 * doppler[: seconds(1.2)].mean()), [1.0, 0.5, 0.3])
    at(out, 2.0, band(whistle, 300, 3_000) * envelope(1.2, 0.1, 0.5, hold=0.5) * 0.35)
    return out * envelope(length, 3.5, 3.5, hold=2.0, curve=2.0)


def crowd_murmur() -> Signal:
    length = 11.0
    rng = np.random.default_rng(99)
    out = silence(length)
    for _ in range(40):
        voice = band(pink(length, int(rng.integers(1e6))), 180, 3_200) * wobble(length, 4.0, 0.9, int(rng.integers(1e6)))
        formant = band(voice, rng.uniform(350, 700), rng.uniform(1_200, 2_600), order=1.5)
        out += formant * rng.uniform(0.3, 1.0)
    return loopable(out, 1.5)


def city_distant() -> Signal:
    length = 11.0
    bed = band(brown(length, 100), 40, 600) * wobble(length, 0.6, 0.3, 101)
    swoosh = band(pink(2.0, 102), 500, 2_200) * envelope(2.0, 0.9, 0.9, curve=2.0)
    out = bed + scatter(length, 0.5, swoosh, 103) * 0.25
    horn = harmonics(0.35, np.full(seconds(0.35), 410.0), [1.0, 0.6, 0.3]) * envelope(0.35, 0.03, 0.15, hold=0.1)
    at(out, 4.2, band(horn, 250, 2_500) * 0.12)
    return loopable(out, 1.5)


def machine_hum() -> Signal:
    length = 7.0
    n = seconds(length)
    hum = harmonics(length, np.full(n, 50.0), [1.0, 0.5, 0.35, 0.25, 0.15, 0.1]) * wobble(length, 2.0, 0.08, 104)
    air = band(pink(length, 105), 900, 3_000) * 0.12
    out = hum + air
    tick = _click(1_500, 5_000, 0.008, 106) * 0.25
    for number in range(int(length * 6)):
        at(out, number / 6, tick)
    return loopable(out, 0.5)


# id: recipe, name, category, description, keywords, events, loop, gain
SOUNDS: list[tuple[str, Callable[[], Signal], str, str, str, list[str], list[str], bool, float]] = [
    ("rain-light", rain_light, "Light rain", "weather", "Steady light rain with soft drops.", ["rain", "drizzle", "shower", "wet"], ["rain-light"], True, 0.45),
    ("rain-heavy", rain_heavy, "Heavy rain", "weather", "Pouring rain, dense and close.", ["rain", "downpour", "storm", "pouring"], ["rain-heavy"], True, 0.45),
    ("thunder-distant", thunder_distant, "Distant thunder", "weather", "A long, low rumble far away.", ["thunder", "storm", "rumble", "distant"], ["thunder-distant"], False, 0.8),
    ("thunder-close", thunder_close, "Thunder overhead", "weather", "A crack and a rolling rumble.", ["thunder", "storm", "crack", "lightning"], ["thunder-close"], False, 0.7),
    ("wind-gust", wind_gust, "A gust of wind", "weather", "One gust that rises and dies away.", ["wind", "gust", "breeze", "draught"], ["wind-gust"], False, 0.6),
    ("wind-howl", wind_howl, "Howling wind", "weather", "Wind moaning and whistling without a break.", ["wind", "gale", "storm", "howl", "blizzard"], ["wind-howl"], True, 0.4),
    ("stream", stream, "A running stream", "nature", "Water running over stones with small bubbles.", ["stream", "brook", "river", "water", "creek"], ["stream"], True, 0.4),
    ("waves", waves, "Waves on the shore", "nature", "Slow waves breaking and washing back.", ["sea", "waves", "ocean", "shore", "beach", "surf"], ["waves"], True, 0.4),
    ("fire-crackle", fire_crackle, "A crackling fire", "nature", "A fire with a low glow, crackles and pops.", ["fire", "hearth", "campfire", "crackle", "flames"], ["fire-crackle"], True, 0.4),
    ("crickets", crickets, "Crickets at night", "nature", "A few crickets chirping.", ["crickets", "night", "insects", "summer"], ["crickets"], True, 0.3),
    ("birdsong", birdsong, "Birdsong", "nature", "Two birds trading short phrases.", ["birds", "song", "morning", "garden", "dawn"], ["birdsong"], False, 0.45),
    ("owl", owl, "An owl's hoot", "animals", "Two soft hoots.", ["owl", "night", "hoot", "forest"], ["owl"], False, 0.6),
    ("wolf-howl", wolf_howl, "A wolf's howl", "animals", "A single long howl.", ["wolf", "howl", "night", "wild"], ["wolf-howl"], False, 0.55),
    ("dog-bark", dog_bark, "A dog barking", "animals", "Three barks.", ["dog", "bark", "hound"], ["dog-bark"], False, 0.6),
    ("horse-hooves", horse_hooves, "Horse's hooves", "animals", "A horse galloping past.", ["horse", "hooves", "gallop", "rider", "carriage"], ["horse-hooves"], False, 0.6),
    ("door-creak", door_creak, "A creaking door", "doors", "An old door opening slowly on dry hinges.", ["door", "creak", "hinge", "gate", "open"], ["door-creak"], False, 0.65),
    ("door-close", door_close, "A door closing", "doors", "A door closed with a soft thump and a latch.", ["door", "close", "shut", "latch"], ["door-close"], False, 0.6),
    ("door-slam", door_slam, "A door slamming", "doors", "A door slammed hard.", ["door", "slam", "bang"], ["door-slam"], False, 0.7),
    ("door-knock", door_knock, "A knock at the door", "doors", "Three knocks on a wooden door.", ["door", "knock", "visitor"], ["door-knock"], False, 0.7),
    ("footsteps-wood", footsteps_wood, "Footsteps on wood", "footsteps", "Six unhurried steps on floorboards.", ["footsteps", "walking", "floor", "stairs", "corridor"], ["footsteps-wood"], False, 0.6),
    ("footsteps-stone", footsteps_stone, "Footsteps on stone", "footsteps", "Six steps on stone with a little echo.", ["footsteps", "walking", "street", "stone", "echo"], ["footsteps-stone"], False, 0.6),
    ("footsteps-gravel", footsteps_gravel, "Footsteps on gravel", "footsteps", "Six crunching steps on gravel.", ["footsteps", "walking", "gravel", "path", "snow"], ["footsteps-gravel"], False, 0.6),
    ("footsteps-run", footsteps_run, "Running footsteps", "footsteps", "Ten quick, light steps.", ["footsteps", "running", "chase", "hurry"], ["footsteps-run"], False, 0.6),
    ("clock-tick", clock_tick, "A ticking clock", "household", "A clock ticking once a second.", ["clock", "tick", "time", "watch", "waiting"], ["clock-tick"], True, 0.35),
    ("clock-chime", clock_chime, "A clock chiming", "household", "A clock striking three.", ["clock", "chime", "strike", "hour"], ["clock-chime"], False, 0.55),
    ("bell-toll", bell_toll, "A tolling bell", "fantasy", "A large bell tolling twice.", ["bell", "toll", "church", "tower"], ["bell-toll"], False, 0.6),
    ("sword-clash", sword_clash, "Clashing swords", "fantasy", "Two strikes of steel on steel.", ["sword", "steel", "battle", "duel", "clash"], ["sword-clash"], False, 0.65),
    ("glass-break", glass_break, "Breaking glass", "impacts", "Glass shattering and scattering.", ["glass", "shatter", "break", "window", "bottle"], ["glass-break"], False, 0.65),
    ("thud", thud, "A heavy thud", "impacts", "Something heavy hitting the floor.", ["thud", "fall", "drop", "impact", "thump"], ["thud"], False, 0.7),
    ("gunshot", gunshot, "A gunshot", "impacts", "One shot with an echo.", ["gun", "shot", "pistol", "rifle", "fire"], ["gunshot"], False, 0.6),
    ("explosion", explosion, "An explosion", "impacts", "A blast with a long rumble and debris.", ["explosion", "blast", "bomb", "boom"], ["explosion"], False, 0.6),
    ("car-pass", car_pass, "A passing car", "vehicles", "A car approaching and driving past.", ["car", "engine", "traffic", "road", "vehicle"], ["car-pass"], False, 0.55),
    ("train-pass", train_pass, "A passing train", "vehicles", "A train clattering past with a whistle.", ["train", "railway", "station", "locomotive"], ["train-pass"], False, 0.5),
    ("crowd-murmur", crowd_murmur, "A murmuring crowd", "ambience", "Many voices talking, none of them clear.", ["crowd", "voices", "tavern", "market", "room", "people"], ["crowd-murmur"], True, 0.35),
    ("city-distant", city_distant, "A city in the distance", "ambience", "Far-off traffic and a horn.", ["city", "traffic", "street", "town", "night"], ["city-distant"], True, 0.35),
    ("machine-hum", machine_hum, "Humming machinery", "mechanical", "A steady electrical hum with a faint tick.", ["machine", "engine", "hum", "generator", "factory"], ["machine-hum"], True, 0.35),
]  # fmt: skip

# Sounds the synthesis cannot make credible yet (organic sources: animals, voices, glass, steel). They stay
# in the library for a reader to add by hand, marked experimental, and are never suggested. To promote one
# after listening (docs/research/sound-effects-listening.html), delete its line here and rebuild.
EXPERIMENTAL: dict[str, str] = {
    "dog-bark": "A filtered burst stands in for a bark; a real dog's formants and texture are not synthesised.",
    "owl": "Two tones with vibrato; a real hoot has breath and resonance this lacks.",
    "wolf-howl": "A sliding tone over noise; a real howl's timbre is not synthesised.",
    "horse-hooves": "Clicks on a rhythm; real hooves on ground have a body this lacks.",
    "birdsong": "Chirped sine phrases; real birdsong is richer and less regular.",
    "crowd-murmur": "Modulated noise with no voices in it, so it reads as a wash rather than people.",
    "glass-break": "A noise burst with ringing partials; real glass has sharper, denser shards.",
    "sword-clash": "Ringing metallic partials; real steel on steel is brighter and more complex.",
}
