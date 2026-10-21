# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: How English voices read money, times, numbers, years, chapter numerals and abbreviations.

Scope: Every rule of ``synthesis/english.py`` on the text it is for and on look-alikes it must leave alone,
and that the synthesis service applies it to English voices only.
Does NOT belong: The engine-neutral rewrite (``test_text_processing.py``) or pronunciations.
"""

from __future__ import annotations

import dataclasses
import time

import pytest

from ltts.container import Services
from ltts.synthesis.english import english_speech


@pytest.mark.parametrize(
    ("text", "spoken"),
    [
        # Money: the amount first, then the unit; minor units after; scales; singular; no amount before the point.
        ("came to £1,284.50, half of it £642.25", "came to 1,284 pounds 50, half of it 642 pounds 25"),
        ("roughly $1,500 or 1,300 euros", "roughly 1,500 dollars or 1,300 euros"),
        ("$1 each, £1.00 each, ¥500 each, $2.5 more", "1 dollar each, 1 pound each, 500 yen each, 2.5 dollars more"),
        ("just €0.99 or $.50", "just 99 cents or 50 cents"),  # "$.50" has no digits before the point
        (
            "£5m, $3bn, €2.5 million, $40k",
            "5 million pounds, 3 billion dollars, 2.5 million euros, 40 thousand dollars",
        ),
        ("$ 12 with a space", "12 dollars with a space"),
        ("version 2.50 is not money", "version 2.50 is not money"),
        # Clock times.
        ("at 4:45 p.m. and 9:00 a.m.", "at 4 45 PM and 9 AM"),
        ("at 4:05 pm, 9:00, 14:00 and 12:30", "at 4 oh 5 pm, 9 o'clock, 14 hundred and 12 30"),
        ("the ratio 3:2 and timestamp 01:02:03", "the ratio 3:2 and timestamp 01:02:03"),
        ("P.M. and A.M. and the word pm", "PM and AM and the word pm"),
        # Phone and account numbers: digit by digit, with pauses between the groups.
        ("call 020 7946 0321 now", "call 0 2 0, 7 9 4 6, 0 3 2 1 now"),
        ("account 0047-3391-2", "account 0 0 4 7, 3 3 9 1, 2"),
        ("from +44 20 7946 0321", "from plus 4 4, 2 0, 7 9 4 6, 0 3 2 1"),
        ("(555) 123-4567 or 555-123-4567", "5 5 5, 1 2 3, 4 5 6 7 or 5 5 5, 1 2 3, 4 5 6 7"),
        ("on 2024-10-21 and 21-10-2024 and 15 06 2021", "on 2024-10-21 and 21-10-2024 and 15 06 2021"),  # dates
        ("items 1 2 3 and page 12-15", "items 1 2 3 and page 12-15"),  # too few digits to be a number
        ("ISBN 978 0 596 52068 7", "ISBN 9 7 8, 0, 5 9 6, 5 2 0 6 8, 7"),
        # Years, only after a cue word, a month or an opening bracket.
        (
            "In 1998 and since 1066, by 1905, in 1000",
            "In nineteen ninety-eight and since ten sixty-six, by nineteen oh five, in 1000",
        ),
        ("the 1980s and the 1900s, in 1900", "the nineteen eighties and the nineteen hundreds, in nineteen hundred"),
        (
            "born 4 July 1776, Dickens (1812 to 1870)",
            "born 4 July seventeen seventy-six, Dickens (eighteen twelve to eighteen seventy)",
        ),
        ("from 1990 to 1995", "from nineteen ninety to nineteen ninety-five"),
        ("1024 bytes and in 1024 bytes", "1024 bytes and in ten twenty-four bytes"),  # the cue decides
        ("in 2019 and in 1998.5 and in 1998%", "in 2019 and in 1998.5 and in 1998%"),
        ("the 1,500 cases", "the 1,500 cases"),
        # Chapter numerals.
        ("Chapter IV: Part I, Act III, Book XII.", "Chapter 4: Part 1, Act 3, Book 12."),
        ("Chapter XLIX and Volume MCMXC", "Chapter 49 and Volume 1990"),
        ("Section C and Part M and Chapter Iv", "Section C and Part M and Chapter Iv"),  # letters, not numerals
        ("Chapter IVX", "Chapter IVX"),  # not a numeral
        # Titles before a capitalised word, saints and streets, places, months.
        (
            "Dr. Amara and Mr. and Mrs. Lindqvist, Ms. Petrova",
            "Doctor Amara and Mister and Missus Lindqvist, Miz Petrova",
        ),
        (
            "Lt. Col. Haines (ret.) and the Rev. T. J. Abernathy",
            "Lieutenant Colonel Haines (retired) and the Reverend T. J. Abernathy",
        ),
        (
            "Prof. Okafor, Capt. Lee, Sgt. Ng, Gen. Ko, Gov. Li, Hon. Wu",
            "Professor Okafor, Captain Lee, Sergeant Ng, General Ko, Governor Li, Honourable Wu",
        ),
        ("Pres. Xi, Sen. Ro, Rep. Mo", "President Xi, Senator Ro, Representative Mo"),
        ("Gen. 3:1 and the dr. who", "Gen. 3:1 and the dr. who"),  # no capitalised word follows
        (
            "St. John's Ave. and 221 Marlowe St. and Mt. Pleasant Rd.",
            "Saint John's Avenue and 221 Marlowe Street and Mount Pleasant Road",
        ),
        ("Sunset Blvd., Trafalgar Sq.", "Sunset Boulevard, Trafalgar Square"),
        ("the 1st St. and St. at the start", "the 1st Street and Street at the start"),
        ("St. at the start", "St. at the start"),  # neither a saint (no capital after) nor a street (no word before)
        ("on 3 Jan. 2019, Sept. 4, Dec. 25 and Mar. 1", "on 3 January 2019, September 4, December 25 and March 1"),
        ("Jan. and Dec. without a date", "Jan. and Dec. without a date"),
        # Everyday abbreviations.
        (
            "approx. 9, the IT dept., the govt., ref. no. 5, fig. 2, vol. 3, ch. 4, pp. 12, p. 7",
            "approximately 9, the IT department, the government, reference number 5, figure 2, volume 3, chapter 4, pages 12, page 7",
        ),
        ("No. 5, Fig. 1, Vol. 2, Ch. 3", "number 5, figure 1, volume 2, chapter 3"),
        (
            "Ali vs. Frazier, Ali vs Frazier; e.g. this, i.e. that",
            "Ali versus Frazier, Ali versus Frazier; for example this, that is that",
        ),
        ("6 ft. tall, 12 lb., 3 lbs. and 8 oz.", "6 feet tall, 12 pounds, 3 pounds and 8 ounces"),
        ("25°C, 77 °F and 90° turn", "25 degrees Celsius, 77 degrees Fahrenheit and 90 degrees turn"),
        ("", ""),
    ],
)
def test_english_narration_rewrites(text: str, spoken: str) -> None:
    assert english_speech(text) == spoken


def test_rewriting_stays_linear_on_long_runs_of_digits_and_cues() -> None:
    hostile = " ".join(["1998"] * 20_000) + " in " + "9" * 100_000 + " £" + "1," * 50_000
    started = time.perf_counter()
    english_speech(hostile)
    assert time.perf_counter() - started < 2.0


def test_only_english_voices_get_the_english_reading(services: Services) -> None:
    """The fake engine's voice speaks US English; a French voice must hear the text as it is."""
    text = "Dr. Okafor paid £5 at 4:45 p.m. in 1998."
    job = services.synthesis.job("kokoro:alpha", text, "sentence", 1.0)
    assert job.pieces[0].spoken == "Doctor Okafor paid 5 pounds at 4 45 PM in nineteen ninety-eight."
    english = services.engines.resolve("kokoro:alpha")
    french = dataclasses.replace(english, spec=dataclasses.replace(english.spec, language_code="fr-fr"))
    assert services.synthesis._spoken(text, french, None) == "Dr. Okafor paid £5 at 4:45 p.m. in 1998."
