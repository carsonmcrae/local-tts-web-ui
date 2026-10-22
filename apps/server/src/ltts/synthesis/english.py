# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: How English voices read money, clock times, phone numbers, years, chapter numerals and abbreviations.

Scope: A conservative rewrite of the spoken text of English voices only, after the pronunciation dictionary and
``documents/normalize.speech_text``, so every engine says the same words. A rule fires only where the written form
has one clear reading and the engine's own reading is wrong (espeak-ng says "dollar five" for "$5"); a sentence that
looks like code or a formula is left alone. Rules are bounded regular expressions, applied once; applying the
rewrite twice changes nothing.
Does NOT belong: Typography and URLs for every language (``documents/normalize.py``), the user's own
pronunciations (``pronunciation/``), or engine phonemisation.

What each rule reads, and what it deliberately leaves alone:

- money with a sign in front ("£1,284.50" is "1,284 pounds 50"), never "US$5", "$5-10", "$12.345" or "¥500";
- clock times after a cue word or before AM/PM ("at 4:45"), never ratios, verses, scores or addresses;
- phone and account numbers, digit by digit, after +, a leading 0, in the US 555-123-4567 pattern or after a word
  such as "call", "account" or "ISBN", never lists of numbers or dates;
- years after a cue word when the next word shows a year ("in 1998 the", not "in 1500 copies"), decades ("the
  1980s") and citations ("(Smith, 1998)", "Smith (1998)");
- roman numerals after Chapter, Part, Book, Act, Scene, Volume, Canto and War, never lettered parts ("Part C");
- abbreviations whose neighbours settle their meaning ("Dr. Nguyen" is a doctor, "Elm Dr." a drive; "no." as a word
  stays a word). Known limit: a bare "$1" in otherwise plain prose ("echo $1 and $2") is read as money.
"""

from __future__ import annotations

import re
from collections.abc import Callable

_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
_TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
_CURRENCY = {"£": ("pound", "pounds", "pence"), "$": ("dollar", "dollars", "cents"), "€": ("euro", "euros", "cents")}
_SCALES = {"k": "thousand", "m": "million", "bn": "billion"}
_ROMAN = {"M": 1000, "D": 500, "C": 100, "L": 50, "X": 10, "V": 5, "I": 1}
_ALWAYS = {"Mr": "Mister", "Mrs": "Missus", "Ms": "Miz", "Prof": "Professor"}
_BEFORE_NAME = {"Dr": "Doctor", "St": "Saint", "Mt": "Mount", "Rev": "Reverend", "Hon": "Honourable",
                "Lt": "Lieutenant", "Col": "Colonel", "Capt": "Captain", "Sgt": "Sergeant", "Gen": "General",
                "Gov": "Governor", "Pres": "President", "Sen": "Senator", "Rep": "Representative"}  # fmt: skip
_AFTER_NAME = {"Dr": "Drive", "St": "Street", "Rd": "Road", "Ave": "Avenue", "Blvd": "Boulevard", "Sq": "Square"}
_MONTHS = {"Jan": "January", "Feb": "February", "Mar": "March", "Apr": "April", "Jun": "June", "Jul": "July",
           "Aug": "August", "Sep": "September", "Sept": "September", "Oct": "October", "Nov": "November",
           "Dec": "December"}  # fmt: skip
_WORDS = {"approx": "approximately", "dept": "department", "govt": "government"}
_UNITS = {"ft": "feet", "lb": "pounds", "lbs": "pounds", "oz": "ounces"}
_REFERENCES = {"fig": "figure", "vol": "volume", "ch": "chapter", "pp": "pages", "p": "page"}
# Words that may follow a year ("in 1998 the firm"); anything else lowercase reads as a quantity ("in 1500 copies").
_AFTER_YEAR = frozenset({
    "the", "a", "an", "and", "or", "but", "nor", "so", "yet", "when", "while", "as", "at", "on", "in", "by", "for",
    "to", "with", "from", "of", "after", "before", "during", "until", "since", "he", "she", "it", "they", "we",
    "i", "you", "his", "her", "its", "their", "our", "my", "there", "this", "that", "these", "those", "which",
    "who", "whom", "where", "was", "were", "is", "are", "be", "been", "had", "has", "have", "did", "does", "do",
    "will", "would", "could", "should", "might", "may", "can", "bc", "ad", "ce", "bce",
})  # fmt: skip
_MONTH_WORDS = "january|february|march|april|may|june|july|august|september|october|november|december"
_YEAR_CUES = (
    rf"in|since|during|circa|until|till|year|born|died|early|late|mid|before|after|from|between|"
    rf"(?:summer|winter|spring|autumn|fall|class) of|{_MONTH_WORDS}"
)
_TIME_CUES = "at|by|from|until|till|before|after|around|about|since|between|opens?|closes?|starts?|begins?|ends?|" \
    "leaves?|arrives?|departs?"  # fmt: skip
_NUMBER_CUES = "phone|telephone|tel|call|ring|dial|fax|mobile|cell|number|no|account|acct|serial|order|invoice|" \
    "policy|reference|ref|card|pin|tracking|isbn|issn"  # fmt: skip
_LONG_NUMBER_CUES = (
    "phone|telephone|tel|call|fax|mobile|account|acct|serial|order|invoice|policy|card|tracking|isbn|issn"
)
_NO_CUES = "ref|reference|account|acct|item|invoice|order|serial|case|room|policy|flight|issue|patent"

# Signs of code or a formula: braces, backslashes, comparisons, pipes, arrows, shell variables, positional
# arguments before code punctuation, paths, and function calls with arguments.
_CODE = re.compile(
    r"[{}\\=<>|]|->|::|\$[A-Za-z_{(]|\$\d+\s*[;\]}]|[/\[]\$\d"
    r"|(?<!\w)/[\w.-]+/|\b\w+/[\w/-]*\.\w{1,4}\b|\b[A-Za-z_]\w+\([^()]*[,\d][^()]*\)|\b\w+\(\)"
)
_CLOCK = r"(?P<{0}h>[01]?\d|2[0-3]):(?P<{0}m>[0-5]\d)(?P<{0}x> ?[AaPp][Mm]\b)?"
_TIME_SEP = r"\s*(?:\bto\b|\band\b|\bor\b|\buntil\b|\btill\b|-|\N{EN DASH})\s*"
_CLOCK_END = r"(?![\d:\]/]|\.\d)"
_GROUPS = r"\d{1,5}(?:[ -]\d{1,5}){1,8}"
_AUTHOR = re.compile(r"(?:[A-Z][\w'-]*|al\.)\s*$")
_DIGITS_END = r"(?![\w/-]|[.,]\d)"

Rule = tuple[re.Pattern[str], "str | Callable[[re.Match[str]], str]"]


def _at_end(match: re.Match[str]) -> str:
    """The full stop an abbreviation took from the end of the sentence, given back."""
    return "." if match.end() == len(match.string) and match[0].endswith(".") else ""


def _two_digits(value: int) -> str:
    """10 to 99 as words (a year's halves; a low half under 10 is read "oh" plus the digit by the caller)."""
    if value < 20:
        return _TEENS[value - 10]
    tens, ones = divmod(value, 10)
    return _TENS[tens] + (f"-{_ONES[ones]}" if ones else "")


def _year_words(year: str) -> str:
    """ "1998" is "nineteen ninety-eight", "1905" "nineteen oh five", "1900" "nineteen hundred"."""
    high, low = _two_digits(int(year[:2])), int(year[2:])
    if low == 0:
        return f"{high} hundred"
    return f"{high} oh {_ONES[low]}" if low < 10 else f"{high} {_two_digits(low)}"


def _reads_as_year(match: re.Match[str]) -> bool:
    """A year is followed by the end, punctuation, a capitalised word or a small word, never by a noun it counts."""
    following = re.match(r"\s*([A-Za-z']+|\S)?", match.string[match.end() :])
    word = following[1] if following else None
    return (not word or word[0] in ",.;:!?)]\"'\N{EN DASH}\N{EM DASH}" or word[0].isupper()
            or word.lower() in _AFTER_YEAR)  # fmt: skip


def _year(match: re.Match[str]) -> str:
    """ "in 1998 the" is "in nineteen ninety-eight the"; a range "from 1990 to 1995" reads both years."""
    if match["y1"] == "1000" or match["y2"] == "1000" or not _reads_as_year(match):
        return match[0]
    if match["cue"].startswith("(") and not match["y2"] and not _AUTHOR.search(match.string[: match.start()]):
        return match[0]  # "(1998)" after a name is a citation; "(1024)" alone may be a count
    second = f"{match['sep']}{_year_words(match['y2'])}" if match["y2"] else ""
    return f"{match['cue']}{_year_words(match['y1'])}{second}"


def _decade(match: re.Match[str]) -> str:
    """ "the 1980s" is "the nineteen eighties"; "the 1900s" "the nineteen hundreds"."""
    high, low = _two_digits(int(match["hi"])), int(match["lo"])
    return f"{high} hundreds" if low == 0 else f"{high} {_TENS[low // 10][:-1]}ies"


def _money(match: re.Match[str]) -> str:
    """ "£1,284.50" is "1,284 pounds 50"; "$1" "1 dollar"; "€0.99" "99 cents"; "$1.5bn" "1.5 billion dollars"."""
    one, many, minor = _CURRENCY[match["sym"]]
    amount, cents, scale = match["amount"], match["cents"], match["scale"]
    if scale:
        fraction = f".{match['fraction']}" if match["fraction"] else ""
        return f"{amount}{fraction} {_SCALES.get(scale.lower(), scale.lower())} {many}"
    if cents and cents != "00":
        return f"{int(cents)} {minor}" if amount.strip("0") == "" else f"{amount} {many} {cents}"
    return f"{amount} {one if amount == '1' else many}"


def _clock(match: re.Match[str], part: str) -> str:
    """ "4:45" is "4 45"; "4:05" "4 oh 5"; "9:00" "9 o'clock" (or "9 AM"); "14:00" "14 hundred"."""
    hour, minute, meridiem = int(match[f"{part}h"]), match[f"{part}m"], match[f"{part}x"]
    after = f" {meridiem.strip().upper()}" if meridiem else ""
    if minute == "00":
        return f"{hour}{after}" if meridiem else f"{hour} o'clock" if hour <= 12 else f"{hour} hundred"
    return f"{hour} {'oh ' + minute[1] if minute[0] == '0' else minute}{after}"


def _times(match: re.Match[str]) -> str:
    second = f"{match['sep']}{_clock(match, 'b')}" if match["bh"] else ""
    return f"{match['cue']}{_clock(match, 'a')}{second}"


def _spell(groups: str) -> str:
    return ", ".join(" ".join(group) for group in re.split(r"[ -]", groups))


def _digits(minimum: int, prefix: str = "") -> Callable[[re.Match[str]], str]:
    """Every digit on its own with a pause between groups, once the number is long enough to be one."""

    def spell(match: re.Match[str]) -> str:
        groups = match["groups"]
        if sum(char.isdigit() for char in groups) < minimum or all(len(g) == 1 for g in re.split(r"[ -]", groups)):
            return match[0]  # too short to be a number of this kind, or already read digit by digit
        return f"{match.groupdict().get('cue') or ''}{prefix}{_spell(groups)}"

    return spell


def _us_number(match: re.Match[str]) -> str:
    return _spell(f"{match['a'] or match['c']} {match['b'] or match['d']} {match['e']}")


def _roman(match: re.Match[str]) -> str:
    """ "Chapter IV" is "Chapter 4" (a lone C, L, D or M is a letter: "Part C")."""
    numeral = match["roman"]
    if len(numeral) == 1 and numeral not in "IVX":
        return match[0]
    total = 0
    for index, char in enumerate(numeral):
        value = _ROMAN[char]
        total += -value if index + 1 < len(numeral) and _ROMAN[numeral[index + 1]] > value else value
    return f"{match['word']} {total}"


def _lookup(table: dict[str, str]) -> Callable[[re.Match[str]], str]:
    return lambda match: f"{match.groupdict().get('pre') or ''}{table[match['abbr']]}{_at_end(match)}"


def _lower_lookup(table: dict[str, str]) -> Callable[[re.Match[str]], str]:
    return lambda match: f"{table[match['abbr'].lower()]}{_at_end(match)}"


_RULES: tuple[Rule, ...] = (
    # Times of day: "4:45 p.m." becomes "4:45 PM" (the sentence keeps its final full stop).
    (re.compile(r"(?<=\d)\s?(?P<x>[ap])\.m\.(?!\w)", re.IGNORECASE), lambda m: f" {m['x'].upper()}M{_at_end(m)}"),
    (
        re.compile(
            r"(?<![\w$])(?P<sym>[£$€])\s?(?P<amount>\d{1,3}(?:,\d{3})+|\d{1,15})"
            r"(?:\.(?P<cents>\d{2})(?!\d)|\.(?P<fraction>\d{1,3})(?=\s?(?:k|m|bn|million|billion|trillion|thousand)\b))?"
            r"(?!\d|[.,]\d)(?:\s?(?P<scale>k|m|bn|million|billion|trillion|thousand)\b)?(?!\s?[-\N{EN DASH}]\s?\d|%)"
        ),
        _money,
    ),
    (
        re.compile(
            rf"(?P<cue>\b(?:{_TIME_CUES})\s+){_CLOCK.format('a')}"
            rf"(?:(?P<sep>{_TIME_SEP}){_CLOCK.format('b')})?{_CLOCK_END}",
            re.IGNORECASE,
        ),
        _times,
    ),
    (
        re.compile(
            rf"(?P<cue>)(?<![\w.:/\[$])(?P<ah>[01]?\d|2[0-3]):(?P<am>[0-5]\d)(?P<ax> ?[AaPp][Mm]\b){_CLOCK_END}"
        ),
        lambda m: _clock(m, "a"),
    ),
    # Abbreviations, where the words around them settle what they mean.
    (re.compile(r"\b(?P<abbr>Mr|Mrs|Ms|Prof)\.(?=\s+\w)"), _lookup(_ALWAYS)),
    (
        re.compile(
            r"(?P<pre>\b(?:[A-Z][a-z]+|\d+(?:st|nd|rd|th)?) )(?P<abbr>Dr|St|Rd|Ave|Blvd|Sq)\."
            r"(?=\s+[a-z]|\s*[,;:!?)]|\s*$|\s+(?:[NSEW]|NE|NW|SE|SW)\b)"
        ),
        _lookup(_AFTER_NAME),
    ),
    (
        re.compile(r"\b(?P<abbr>Dr|St|Mt|Rev|Hon|Lt|Col|Capt|Sgt|Gen|Gov|Pres|Sen|Rep)\.(?=\s+[A-Z](?:[a-z']|\.))"),
        _lookup(_BEFORE_NAME),
    ),
    (re.compile(r"\b(?P<abbr>Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.(?=\s+\d)"), _lookup(_MONTHS)),
    (
        re.compile(r"(?<=\d )(?P<abbr>Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.(?=[\s,;)]|$)"),
        _lookup(_MONTHS),
    ),
    (re.compile(r"\bNo\.\s?(?=\d)"), "number "),
    (re.compile(rf"\b(?P<pre>(?:{_NO_CUES})\.?\s+)no\.\s?(?=\S*\d)", re.IGNORECASE), lambda m: f"{m['pre']}number "),
    (re.compile(r"\bref\.\s?(?=number)"), "reference "),
    (re.compile(r"\b(?P<abbr>[Ff]ig|[Vv]ol|[Cc]h|pp|p)\.\s?(?=\d)"), lambda m: f"{_REFERENCES[m['abbr'].lower()]} "),
    (re.compile(r"\b(?P<abbr>approx|dept|govt)\.(?!\w)"), _lower_lookup(_WORDS)),
    (re.compile(r"\bvs\.(?=\s)|(?<=[A-Za-z] )vs(?= [A-Za-z])"), "versus"),
    (re.compile(r"\be\.g\.(?!\w)"), "for example"),
    (re.compile(r"\bi\.e\.(?!\w)"), "that is"),
    (re.compile(r"\bret\.(?=\))"), "retired"),
    (re.compile(r"(?<=\d) ?(?P<abbr>ft|lbs|lb|oz)\.(?!\w)"), lambda m: f" {_UNITS[m['abbr']]}{_at_end(m)}"),
    (re.compile(r"(?<=\d) ?°\s?C\b"), " degrees Celsius"),
    (re.compile(r"(?<=\d) ?°\s?F\b"), " degrees Fahrenheit"),
    # Numbers read digit by digit: after a cue word, international, leading zero, or the US pattern.
    (
        re.compile(
            rf"(?P<cue>\b(?:{_NUMBER_CUES})\b\.?(?:\s+(?:number|no\.?))?\s*[:#]?\s*)(?P<groups>{_GROUPS}){_DIGITS_END}",
            re.IGNORECASE,
        ),
        _digits(7),
    ),
    (
        re.compile(
            rf"(?P<cue>\b(?:{_LONG_NUMBER_CUES})\b\.?(?:\s+(?:number|no\.?))?\s*[:#]?\s*)(?P<groups>\d{{7,20}}){_DIGITS_END}",
            re.IGNORECASE,
        ),
        _digits(7),
    ),
    (re.compile(rf"(?<![\w+])\+(?P<groups>\d{{1,3}}(?:[ -]\d{{1,5}}){{1,8}}){_DIGITS_END}"), _digits(8, "+")),
    (re.compile(rf"(?<![\w/.,+-])(?P<groups>0\d{{1,4}}(?:[ -]\d{{1,5}}){{1,8}}){_DIGITS_END}"), _digits(9)),
    (
        re.compile(
            r"(?<![\w/.,+-])(?:\((?P<a>\d{3})\)\s?(?P<b>\d{3})[-. ]|(?P<c>\d{3})(?P<s>[-.])(?P<d>\d{3})(?P=s))"
            rf"(?P<e>\d{{4}}){_DIGITS_END}"
        ),
        _us_number,
    ),
    # Roman numerals where they number something, decades, and years.
    (
        re.compile(
            r"\b(?P<word>Chapter|Part|Book|Act|Scene|Volume|Canto|War)\s+"
            r"(?P<roman>(?=[IVXLCDM])M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))(?=[\s.,:;!?)]|$)"
        ),
        _roman,
    ),
    (re.compile(r"\b(?P<hi>1\d)(?P<lo>\d0)'?s\b"), _decade),
    (
        re.compile(
            rf"(?P<cue>\b(?:{_YEAR_CUES})\s+|\(\s*)(?P<y1>1\d{{3}})"
            rf"(?:(?P<sep>\s+(?:to|and|or|until|till)\s+|\s*[-\N{{EN DASH}}]\s*)(?P<y2>1\d{{3}}))?\b(?![.,]\d|%|')",
            re.IGNORECASE,
        ),
        _year,
    ),
    (
        re.compile(r"(?<=, )(?P<y>1\d{3})(?P<x>[a-z]?)(?=[);])"),
        lambda m: f"{_year_words(m['y'])}{' ' + m['x'] if m['x'] else ''}",
    ),
)


def english_speech(text: str) -> str:
    """Rewrite spoken text the way an English narrator reads it (see the module's purpose)."""
    if _CODE.search(text):
        return text
    for pattern, replacement in _RULES:
        text = pattern.sub(replacement, text)
    return text
