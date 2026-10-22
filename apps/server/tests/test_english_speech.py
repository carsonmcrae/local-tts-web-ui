# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: How English voices read money, times, numbers, years, numerals and abbreviations, and where they don't.

Scope: Every rule of ``synthesis/english.py`` on realistic text it is for and on ambiguous look-alikes it must
leave alone (ratios, verses, code, formulas, lists of numbers, quantities, lettered sections, "no." as a word),
grouped by kind; that rewriting twice changes nothing; that hostile input stays fast; and that the rewrite is for
English voices only.
Does NOT belong: The engine-neutral rewrite (``test_text_processing.py``) or the paths that carry the spoken text
(``test_english_reading_paths.py``).
"""

from __future__ import annotations

import dataclasses
import time

import pytest

from ltts.container import Services
from ltts.synthesis.english import english_speech

MONEY = [
    ("The ticket costs $5.", "The ticket costs 5 dollars."),
    ("came to £1,284.50, half of it £642.25", "came to 1,284 pounds 50, half of it 642 pounds 25"),
    ("$1 each, £1.00 each, $1,000.00 exactly", "1 dollar each, 1 pound each, 1,000 dollars exactly"),
    ("just €0.99, £0.50 or €0.05", "just 99 cents, 50 pence or 5 cents"),
    ("£5m, $3bn, €2.5 million, $40k, £1.5bn", "5 million pounds, 3 billion dollars, 2.5 million euros, 40 thousand dollars, 1.5 billion pounds"),
    ("$5 more", "5 dollars more"),
    # Ambiguous or foreign formats are left to the engine.
    ("US$5 million and A$20", "US$5 million and A$20"),  # the country prefix is not split from its sign
    ("$5-10 per hour", "$5-10 per hour"),  # a range
    ("Price: $12.345 per unit", "Price: $12.345 per unit"),  # more decimals than cents
    ("€1.234,56 in total", "€1.234,56 in total"),  # European grouping
    ("¥500 note", "¥500 note"),  # yen or yuan
    ("costs $0.5 or $.50", "costs $0.5 or $.50"),
    ("a $ sign, 5% off", "a $ sign, 5% off"),
]  # fmt: skip

TIMES = [
    ("Meet me at 4:45 p.m.", "Meet me at 4 45 PM."),  # the sentence keeps its full stop
    ("The train leaves at 7:30. Doors open 7:30.", "The train leaves at 7 30. Doors open 7 30."),
    ("from 9:00 to 17:30, or at 9:00 or 10:00", "from 9 o'clock to 17 30, or at 9 o'clock or 10 o'clock"),
    ("between 9:05 and 14:00", "between 9 oh 5 and 14 hundred"),
    ("at 3:30pm, 4:45 PM today", "at 3 30 PM, 4 45 PM today"),
    ("at 5 p.m. and 9 a.m.", "at 5 PM and 9 AM."),
    # Ratios, verses, durations, addresses and code are not times.
    ("a scale of 1:25, odds of 5:1, a 16:9 screen, a 1:1 mapping", "a scale of 1:25, odds of 5:1, a 16:9 screen, a 1:1 mapping"),
    ("mixed 1:10 with water", "mixed 1:10 with water"),
    ("John 3:16 and Genesis 1:27", "John 3:16 and Genesis 1:27"),
    ("The score was 2:15 at half-time.", "The score was 2:15 at half-time."),
    ("ran the mile in 3:59.4", "ran the mile in 3:59.4"),
    ("timestamp 01:02:03 at 10:30:15", "timestamp 01:02:03 at 10:30:15"),
    ("server at 10.0.0.1:22 and localhost:8080", "server at 10.0.0.1:22 and localhost:8080"),
    ("P.M. Johnson spoke.", "P.M. Johnson spoke."),  # not after a number
]  # fmt: skip

YEARS = [
    ("In 1998 the firm grew.", "In nineteen ninety-eight the firm grew."),
    ("in 1066, the Normans", "in ten sixty-six, the Normans"),
    ("born 4 July 1776 in Boston", "born 4 July seventeen seventy-six in Boston"),
    ("since 1905 there", "since nineteen oh five there"),
    ("In 1500 there were few.", "In fifteen hundred there were few."),
    ("from 1990 to 1995, between 1914 and 1918", "from nineteen ninety to nineteen ninety-five, between nineteen fourteen and nineteen eighteen"),
    ("Dickens (1812 to 1870)", "Dickens (eighteen twelve to eighteen seventy)"),
    ("the summer of 1969 and the class of 1999", "the summer of nineteen sixty-nine and the class of nineteen ninety-nine"),
    ("the 1980s, the 1900s and the 1920's", "the nineteen eighties, the nineteen hundreds and the nineteen twenties"),
    ("Smith (1998) argued", "Smith (nineteen ninety-eight) argued"),
    ("(Smith, 1998; Jones et al., 2001a)", "(Smith, nineteen ninety-eight; Jones et al., 2001a)"),
    ("(Ng et al., 1998a)", "(Ng et al., nineteen ninety-eight a)"),
    # Counts, codes and quantities stay numbers.
    ("stored in 1024 blocks, in 1500 copies", "stored in 1024 blocks, in 1500 copies"),
    ("about 1200 people, around 1850 there, the 1500 soldiers", "about 1200 people, around 1850 there, the 1500 soldiers"),
    ("Sales increased by 1500. An array of 1024.", "Sales increased by 1500. An array of 1024."),
    ("a count (1024) of items", "a count (1024) of items"),
    ("(1500 + 300) / 2", "(1500 + 300) / 2"),
    ("Room 1205, port 1433, 1080p video, RFC 2616, ISO 8601", "Room 1205, port 1433, 1080p video, RFC 2616, ISO 8601"),
    ("in 1000 BC, in 2019 and in 1998.5%", "in 1000 BC, in 2019 and in 1998.5%"),
    ("between 1914 and 1918 millions died", "between 1914 and 1918 millions died"),
]  # fmt: skip

NUMBERS = [
    ("Call 020 7946 0321.", "Call 0 2 0, 7 9 4 6, 0 3 2 1."),
    ("Call (555) 123-4567 now, or 555-123-4567, or 555.123.4567.", "Call 5 5 5, 1 2 3, 4 5 6 7 now, or 5 5 5, 1 2 3, 4 5 6 7, or 5 5 5, 1 2 3, 4 5 6 7."),
    ("from +44 20 7946 0321 or +1-800-555-0100", "from +4 4, 2 0, 7 9 4 6, 0 3 2 1 or +1, 8 0 0, 5 5 5, 0 1 0 0"),
    ("account 0047-3391-2, account 12345678", "account 0 0 4 7, 3 3 9 1, 2, account 1 2 3 4 5 6 7 8"),
    ("serial number 4417-2290-118", "serial number 4 4 1 7, 2 2 9 0, 1 1 8"),
    ("order 1234 5678 9012, card 4111 1111 1111 1111", "order 1 2 3 4, 5 6 7 8, 9 0 1 2, card 4 1 1 1, 1 1 1 1, 1 1 1 1, 1 1 1 1"),
    ("Call 555 0123.", "Call 5 5 5, 0 1 2 3."),
    # Lists, dates, scores and short numbers are not phone numbers.
    ("scores of 10 20 30 40 50 and rows 100 200 300 400", "scores of 10 20 30 40 50 and rows 100 200 300 400"),
    ("the years 2019 2020 2021", "the years 2019 2020 2021"),
    ("On 2024-10-21 15 people came, on 21-10-2024 and 15 06 2021.", "On 2024-10-21 15 people came, on 21-10-2024 and 15 06 2021."),
    ("Call 911. Dial 999.", "Call 911. Dial 999."),
    ("temperatures of 20 25 30 35 40 degrees, postcode 90210 1234", "temperatures of 20 25 30 35 40 degrees, postcode 90210 1234"),
    ("No. 5 6 7 and pages 12-15", "number 5 6 7 and pages 12-15"),
]  # fmt: skip

CODE_AND_MATH = [
    # A sentence that looks like code or a formula is left entirely alone.
    ("if (x > 10) return $1;", "if (x > 10) return $1;"),
    ("s/(foo)/$1/g", "s/(foo)/$1/g"),
    ("Set PORT=8080 and start at 9:00.", "Set PORT=8080 and start at 9:00."),
    ("for i in range(1, 10): print(i)", "for i in range(1, 10): print(i)"),
    ('printf("%d:%02d", h, m)', 'printf("%d:%02d", h, m)'),
    ("echo $HOME costs $5", "echo $HOME costs $5"),
    ("see src/ltts/app.py for $5 at 9:00", "see src/ltts/app.py for $5 at 9:00"),
    ("run /usr/bin/env at 9:00", "run /usr/bin/env at 9:00"),
    ("x = a[1:10] and y = 1998", "x = a[1:10] and y = 1998"),
    ("cat log | grep 1998", "cat log | grep 1998"),
    ("main() runs in 1998 mode", "main() runs in 1998 mode"),
    ("2 + 3 = 5, and 3 x 4 = 12", "2 + 3 = 5, and 3 x 4 = 12"),
    ("x^2 + 2x + 1 and 10^9, 1/2 + 1/3, f(x) = 1998x", "x^2 + 2x + 1 and 10^9, 1/2 + 1/3, f(x) = 1998x"),
    ("a 3:4 ratio and the 1:2:3 ratio", "a 3:4 ratio and the 1:2:3 ratio"),
    ("version 2.1.0, HTTP/1.1 200 OK, chmod 755 file, git log -n 20", "version 2.1.0, HTTP/1.1 200 OK, chmod 755 file, git log -n 20"),
    ("for v in vs: print(v)", "for v in vs: print(v)"),
    # Prose with a slash or parentheses is still prose.
    ("he/she/they paid $5.", "he/she/they paid 5 dollars."),
    ("The fee ($5) and your friend(s) at 9:00.", "The fee (5 dollars) and your friend(s) at 9 o'clock."),
]  # fmt: skip

DATES_AND_UNITS = [
    ("On 3 Jan. 2019, in Dec. 2020, Sept. 4 and Mar. 1", "On 3 January 2019, in December 2020, September 4 and March 1"),
    ("Jan. and Dec. without a date", "Jan. and Dec. without a date"),
    ("15/06/2021 and 2024-10-21", "15/06/2021 and 2024-10-21"),  # day or month first: left alone
    ("6 ft. tall, 12 lb. bag, 3 lbs. and 8 oz.", "6 feet tall, 12 pounds bag, 3 pounds and 8 ounces."),
    ("25°C, 77 °F", "25 degrees Celsius, 77 degrees Fahrenheit"),
    ("a 90° angle at 51°30′N", "a 90° angle at 51°30′N"),  # the engine reads degrees itself
    ("5 ft 10 in, 20 km, 3.5 kg, 100 mph", "5 ft 10 in, 20 km, 3.5 kg, 100 mph"),
]  # fmt: skip

ABBREVIATIONS = [
    ("Dr. Nguyen arrived. Dr. J. Okafor too.", "Doctor Nguyen arrived. Doctor J. Okafor too."),
    ("Mulholland Dr. is closed. Turn onto Elm Dr. and stop at 221 Elm Dr.", "Mulholland Drive is closed. Turn onto Elm Drive and stop at 221 Elm Drive."),
    ("St. John's Wood and Baker St. is busy.", "Saint John's Wood and Baker Street is busy."),
    ("No. 10 Downing St.", "number 10 Downing Street."),
    ("on Mt. Everest, Mt. Pleasant Rd., Penn Ave. NW, Sunset Blvd., Trafalgar Sq.", "on Mount Everest, Mount Pleasant Road, Penn Avenue NW, Sunset Boulevard, Trafalgar Square."),
    ("Mr. and Mrs. Lindqvist, Ms. O'Brien, Prof. Okafor", "Mister and Missus Lindqvist, Miz O'Brien, Professor Okafor"),
    ("Lt. Col. Haines (ret.) and the Rev. Dr. King", "Lieutenant Colonel Haines (retired) and the Reverend Doctor King"),
    ("Capt. Lee, Sgt. Ng, Gen. Ko, Gov. Li, Hon. Wu, Pres. Xi, Sen. Ro, Rep. Mo", "Captain Lee, Sergeant Ng, General Ko, Governor Li, Honourable Wu, President Xi, Senator Ro, Representative Mo"),
    ("Ali vs. Frazier, Ali vs Frazier, cats vs dogs", "Ali versus Frazier, Ali versus Frazier, cats versus dogs"),
    ("e.g. this, i.e. that; approx. 9, the IT dept., the govt.", "for example this, that is that; approximately 9, the IT department, the government."),
    # Where the neighbours don't settle the meaning, the engine reads it as before.
    ("I said no. 5 minutes later. No, 5 is fine.", "I said no. 5 minutes later. No, 5 is fine."),
    ("Gen. 3:1, Mt. 5:3, Col. 3:12, Rev. 21", "Gen. 3:1, Mt. 5:3, Col. 3:12, Rev. 21"),  # Bible references
    ("the dr. said, Rd. 5, St Ives, Gen. Z", "the dr. said, Rd. 5, St Ives, Gen. Z"),
    ("Baker St. Station", "Baker Saint Station"),  # ambiguous; the engine says "saint" here too
]  # fmt: skip

REFERENCES = [
    ("ISBN 978-0-596-52068-7 and ISBN 0-596-52068-9", "ISBN 9 7 8, 0, 5 9 6, 5 2 0 6 8, 7 and ISBN 0, 5 9 6, 5 2 0 6 8, 9"),
    ("ISBN 9780596520687", "ISBN 9 7 8 0 5 9 6 5 2 0 6 8 7"),
    ("See p. 12, pp. 14 to 16, fig. 2, Fig. 4b, vol. 3, ch. 4 and Ch. 3.", "See page 12, pages 14 to 16, figure 2, figure 4b, volume 3, chapter 4 and chapter 3."),
    ("Vol. 3, No. 2, pp. 45-67", "volume 3, number 2, pages 45-67"),
    ("the ref. no. AB/2024-17 and invoice no. 5", "the reference number AB/2024-17 and invoice number 5"),
    ("doi:10.1000/182, Section 3.2.1, [12]", "doi:10.1000/182, Section 3.2.1, [12]"),
    ("Chapter IV: Part I, Act III, Book XII, Volume MCMXC, World War II.", "Chapter 4: Part 1, Act 3, Book 12, Volume 1990, World War 2."),
    ("Chapter XLIX, Canto V, Scene II", "Chapter 49, Canto 5, Scene 2"),
    ("Appendix I, Section V, Part C, Part M, Chapter Iv, Chapter IVX", "Appendix I, Section V, Part C, Part M, Chapter Iv, Chapter IVX"),
]  # fmt: skip

ALL = MONEY + TIMES + YEARS + NUMBERS + CODE_AND_MATH + DATES_AND_UNITS + ABBREVIATIONS + REFERENCES


@pytest.mark.parametrize(("text", "spoken"), ALL, ids=[text[:40] for text, _ in ALL])
def test_english_narration_rewrites(text: str, spoken: str) -> None:
    assert english_speech(text) == spoken


@pytest.mark.parametrize("text", [text for text, _ in ALL], ids=[text[:40] for text, _ in ALL])
def test_rewriting_twice_changes_nothing_more(text: str) -> None:
    once = english_speech(text)
    assert english_speech(once) == once


def test_empty_and_plain_text_pass_through() -> None:
    assert english_speech("") == ""
    plain = "The lighthouse keeper climbed the spiral stairs and counted every step."
    assert english_speech(plain) == plain


def test_rewriting_stays_linear_on_long_runs_of_digits_and_cues() -> None:
    hostile = (
        " ".join(["in 1998"] * 20_000) + " call " + " ".join(["12"] * 5_000) + " £" + "1," * 50_000
        + " at " + "1:" * 50_000 + " Dr." * 20_000
    )  # fmt: skip
    started = time.perf_counter()
    english_speech(hostile)
    assert time.perf_counter() - started < 3.0


def test_only_english_voices_get_the_english_reading(services: Services) -> None:
    text = "Dr. Okafor paid £5 at 4:45 p.m. in 1998 the firm said."
    job = services.synthesis.job("kokoro:alpha", text, "sentence", 1.0)
    assert job.pieces[0].spoken == "Doctor Okafor paid 5 pounds at 4 45 PM in nineteen ninety-eight the firm said."
    english = services.engines.resolve("kokoro:alpha")
    french = dataclasses.replace(english, spec=dataclasses.replace(english.spec, language_code="fr-fr"))
    assert services.synthesis._spoken(text, french, None) == text
