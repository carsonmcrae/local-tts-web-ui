# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: How English voices read money, clock times, phone-like numbers, years, chapter numerals and abbreviations.

Scope: A rewrite of the spoken text of English voices only, applied after the pronunciation dictionary and the
engine-neutral speech rewrite (``documents/normalize.speech_text``), so every engine is asked to say the same
words: "£1,284.50" becomes "1,284 pounds 50", "4:45 p.m." becomes "4 45 PM", "020 7946 0321" is read digit by
digit with a pause between groups, "in 1998" becomes "in nineteen ninety-eight", "Chapter IV" becomes
"Chapter 4", and abbreviations espeak-ng spells out or misreads ("Lt. Col.", "Rev.", "Mt.", "Rd.", "Ave.",
"Ms.", "approx.") become words. Years are only rewritten after a cue such as "in", "since" or a month, so
"1024 bytes" stays a number. Every rule is one plain regular expression with bounded repetition, applied once
from left to right, so no input can make it slow.
Does NOT belong: Typography and URLs for every language (``documents/normalize.py``), the user's own
pronunciations (``pronunciation/``), or engine phonemisation.
"""

from __future__ import annotations

import re
from collections.abc import Callable

_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
_TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
_CURRENCY = {
    "£": ("pound", "pounds", "pence"),
    "$": ("dollar", "dollars", "cents"),
    "€": ("euro", "euros", "cents"),
    "¥": ("yen", "yen", "sen"),
}
_SCALES = {"k": "thousand", "m": "million", "bn": "billion"}
_ROMAN = {"M": 1000, "D": 500, "C": 100, "L": 50, "X": 10, "V": 5, "I": 1}
_TITLES = {
    "Mr": "Mister",
    "Mrs": "Missus",
    "Ms": "Miz",
    "Dr": "Doctor",
    "Prof": "Professor",
    "Rev": "Reverend",
    "Hon": "Honourable",
    "Lt": "Lieutenant",
    "Col": "Colonel",
    "Capt": "Captain",
    "Sgt": "Sergeant",
    "Gen": "General",
    "Gov": "Governor",
    "Pres": "President",
    "Sen": "Senator",
    "Rep": "Representative",
}
_PLACES = {"Mt": "Mount", "Rd": "Road", "Ave": "Avenue", "Blvd": "Boulevard", "Sq": "Square"}
_MONTHS = {
    "Jan": "January",
    "Feb": "February",
    "Mar": "March",
    "Apr": "April",
    "Jun": "June",
    "Jul": "July",
    "Aug": "August",
    "Sep": "September",
    "Sept": "September",
    "Oct": "October",
    "Nov": "November",
    "Dec": "December",
}
_YEAR_CUES = (
    "in|since|by|of|from|to|until|till|during|around|about|circa|year|before|after|between|and|the|early|late|"
    "mid|born|died|january|february|march|april|may|june|july|august|september|october|november|december|"
    "jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec"
)

Rule = tuple[re.Pattern[str], "str | Callable[[re.Match[str]], str]"]


def _two_digits(value: int) -> str:
    if value < 10:
        return _ONES[value]
    if value < 20:
        return _TEENS[value - 10]
    tens, ones = divmod(value, 10)
    return _TENS[tens] + (f"-{_ONES[ones]}" if ones else "")


def _year(match: re.Match[str]) -> str:
    """ "in 1998" → "in nineteen ninety-eight"; "the 1990s" → "the nineteen nineties"; "1905" → "nineteen oh five"."""
    high, low, decade = _two_digits(int(match["hi"])), int(match["lo"]), bool(match["s"])
    if match["hi"] == "10" and low == 0:
        return match[0]  # "1000" is one thousand, not "ten hundred"
    if low == 0:
        tail = "hundreds" if decade else "hundred"
    elif decade:
        tail = _TENS[low // 10][:-1] + "ies"
    elif low < 10:
        tail = f"oh {_ONES[low]}"
    else:
        tail = _two_digits(low)
    return f"{match['cue']}{high} {tail}"


def _money(match: re.Match[str]) -> str:
    """ "£1,284.50" → "1,284 pounds 50"; "$1" → "1 dollar"; "€0.99" → "99 cents"; "$3bn" → "3 billion dollars"."""
    one, many, minor = _CURRENCY[match["sym"]]
    amount, fraction, scale = match["amount"], match["fraction"], match["scale"]
    if scale:
        return f"{amount}{'.' + fraction if fraction else ''} {_SCALES.get(scale.lower(), scale.lower())} {many}"
    if fraction and len(fraction) == 1:
        return f"{amount or '0'}.{fraction} {many}"
    if fraction and fraction != "00":
        return f"{fraction} {minor}" if amount.strip("0") == "" else f"{amount} {many} {fraction}"
    return f"{amount} {one if amount == '1' else many}"


def _time(match: re.Match[str]) -> str:
    """ "4:45" → "4 45"; "4:05" → "4 oh 5"; "9:00" → "9 o'clock" (or just "9" before AM/PM); "14:00" → "14 hundred"."""
    hour, minute = int(match["h"]), match["m"]
    if minute == "00":
        if match["meridiem"]:
            return f"{hour}{match['meridiem']}"
        return f"{hour} o'clock" if hour <= 12 else f"{hour} hundred"
    minutes = f"oh {minute[1]}" if minute[0] == "0" else minute
    return f"{hour} {minutes}{match['meridiem'] or ''}"


def _digits(match: re.Match[str]) -> str:
    """A phone or account number: every digit on its own, with a pause between the groups."""
    groups = re.split(r"[ -]", match["groups"])
    if sum(len(group) for group in groups) < 9:
        return match["groups"]
    return ", ".join(" ".join(group) for group in groups)


def _roman(match: re.Match[str]) -> str:
    """ "Chapter IV" → "Chapter 4" (a lone C, L, D or M is left alone: "Section C" is a letter)."""
    numeral = match["roman"]
    if len(numeral) == 1 and numeral not in "IVX":
        return match[0]
    total = 0
    for index, char in enumerate(numeral):
        value = _ROMAN[char]
        total += -value if index + 1 < len(numeral) and _ROMAN[numeral[index + 1]] > value else value
    return f"{match['word']} {total}"


def _lookup(table: dict[str, str], group: str = "abbr") -> Callable[[re.Match[str]], str]:
    return lambda match: table[match[group].capitalize() if group == "abbr" else match[group]] + match["tail"]


_RULES: tuple[Rule, ...] = (
    (re.compile(r"\b([ap])\.m\.(?!\w)", re.IGNORECASE), lambda m: f"{m[1].upper()}M"),
    (
        re.compile(
            r"(?P<sym>[£$€¥])\s?(?=\d|\.\d)(?P<amount>\d{1,3}(?:,\d{3})+|\d{0,15})(?:\.(?P<fraction>\d{1,2}))?"
            r"(?!\d)(?:\s?(?P<scale>(?:k|m|bn|million|billion|trillion|thousand)\b))?"
        ),
        _money,
    ),
    (re.compile(r"(?<![\d:])(?P<h>[01]?\d|2[0-4]):(?P<m>[0-5]\d)(?![\d:])(?P<meridiem>\s?[AP]M\b)?"), _time),
    (re.compile(r"\((?P<area>\d{3})\)\s?(?P<rest>\d{3}[ -]\d{4})\b"), lambda m: f"{m['area']}-{m['rest']}"),
    (re.compile(r"(?<![\d/.,-])(?P<groups>\d{1,5}(?:[ -]\d{1,5}){2,8})(?![\d/.,-])"), _digits),
    (re.compile(r"\+(?P<code>\d{1,3})(?=[ ,-]\d)"), lambda m: "plus " + " ".join(m["code"])),
    (
        re.compile(
            rf"(?P<cue>\b(?:{_YEAR_CUES})\s+|\(\s*)(?P<hi>1\d)(?P<lo>\d\d)(?P<s>s?)\b(?![.,]\d|%)", re.IGNORECASE
        ),
        _year,
    ),
    (
        re.compile(
            r"\b(?P<word>Chapter|Part|Book|Act|Scene|Volume|Section|Canto|Appendix)\s+"
            r"(?P<roman>(?=[IVXLCDM])M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))(?=[\s.,:;!?)]|$)"
        ),
        _roman,
    ),
    (re.compile(r"\b(?P<abbr>Mr|Mrs|Ms|Dr|Prof)\.(?P<tail>\s+)(?=\w)"), _lookup(_TITLES)),
    (re.compile(r"\b(?P<abbr>Rev|Hon|Lt|Col|Capt|Sgt|Gen|Gov|Pres|Sen|Rep)\.(?P<tail>\s+)(?=[A-Z])"), _lookup(_TITLES)),
    (re.compile(r"\bSt\.(?P<tail>\s+)(?=[A-Z])"), lambda m: "Saint" + m["tail"]),
    (re.compile(r"(?<=[A-Za-z] )St\.(?P<tail>(?=[\s,;:.!?)])|$)"), lambda m: "Street" + m["tail"]),
    (re.compile(r"\b(?P<abbr>Mt|Rd|Ave|Blvd|Sq)\.(?P<tail>(?=[\s,;:.!?)])|$)"), _lookup(_PLACES)),
    (
        re.compile(r"\b(?P<abbr>Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.(?P<tail>\s+(?=\d))"),
        _lookup(_MONTHS),
    ),
    (re.compile(r"(?<=\d )(?P<abbr>Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.(?P<tail>)"), _lookup(_MONTHS)),
    (re.compile(r"\b(?:no|No)\.\s?(?=\d)"), "number "),
    (re.compile(r"\bref\.\s?(?=number)"), "reference "),
    (re.compile(r"\b(?:fig|Fig)\.\s?(?=\d)"), "figure "),
    (re.compile(r"\b(?:vol|Vol)\.\s?(?=\d)"), "volume "),
    (re.compile(r"\b(?:ch|Ch)\.\s?(?=\d)"), "chapter "),
    (re.compile(r"\bpp\.\s?(?=\d)"), "pages "),
    (re.compile(r"\bp\.\s?(?=\d)"), "page "),
    (re.compile(r"\bapprox\.(?!\w)"), "approximately"),
    (re.compile(r"\bdept\.(?!\w)"), "department"),
    (re.compile(r"\bgovt\.(?!\w)"), "government"),
    (re.compile(r"\bvs\.?(?!\w)"), "versus"),
    (re.compile(r"\be\.g\.(?!\w)"), "for example"),
    (re.compile(r"\bi\.e\.(?!\w)"), "that is"),
    (re.compile(r"\bret\.(?=\))"), "retired"),
    (re.compile(r"(?<=\d)\s?ft\.(?!\w)"), " feet"),
    (re.compile(r"(?<=\d)\s?lbs?\.(?!\w)"), " pounds"),
    (re.compile(r"(?<=\d)\s?oz\.(?!\w)"), " ounces"),
    (re.compile(r"(?<=\d)\s?°\s?C\b"), " degrees Celsius"),
    (re.compile(r"(?<=\d)\s?°\s?F\b"), " degrees Fahrenheit"),
    (re.compile(r"(?<=\d)°"), " degrees"),
)


def english_speech(text: str) -> str:
    """Rewrite spoken text the way an English narrator reads it (see the module's purpose)."""
    for pattern, replacement in _RULES:
        text = pattern.sub(replacement, text)
    return text
