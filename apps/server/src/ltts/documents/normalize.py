# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Text clean-up for display, and a separate speech-oriented rewrite for synthesis.

Scope: ``clean_text`` makes extracted text safe and tidy for reading (Unicode NFC, control and
zero-width characters removed, whitespace collapsed). ``speech_text`` rewrites a display string
into what the voice engine should actually say (typographic punctuation, URLs, dashes, markup); it
leaves numbers in brackets alone, so ``array[3]`` and ``[0, 1]`` are read as written.
Does NOT belong: Sentence segmentation (``segmenter.py``), engine-specific phonemisation, or footnote
and citation markers, which the document cleanup leaves unread where it can be undone (``cleanup.py``).
"""

from __future__ import annotations

import re
import unicodedata

# Soft hyphen, zero-width space/non-joiner/joiner, word joiner, byte-order mark, and the U+FFFE/U+FFFF
# noncharacters PDFium emits where it has joined a hyphenated line break.
_INVISIBLE = dict.fromkeys([0x00AD, 0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0xFFFE, 0xFFFF])
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")
# Space, tab, no-break space, the en-quad..hair-space block, narrow/medium/ideographic spaces.
_SPACE_CHARS = " \t" + "".join(map(chr, [0x00A0, *range(0x2000, 0x200B), 0x202F, 0x205F, 0x3000]))
_SPACES = re.compile(f"[{re.escape(_SPACE_CHARS)}]+")
_URL = re.compile(r"\b(?:https?://|www\.)\S+", re.IGNORECASE)
_REPEAT_PUNCT = re.compile(r"([!?])\1+")
# The leading digit is consumed (and written back) rather than looked behind, so a match can only start at
# a digit and a long run of whitespace is scanned once instead of once per starting position.
_DASH_BETWEEN_NUMBERS = re.compile(r"(\d)\s*[\N{EN DASH}\N{EM DASH}]\s*(?=\d)")
_WHITESPACE_RUN = re.compile(r"(\s+)")
_PAUSE_DASHES = frozenset("\N{EM DASH}\N{HORIZONTAL BAR}")
_SPACED_DASHES = frozenset("\N{EN DASH}-")
_PAUSE_TABLE = str.maketrans(dict.fromkeys(_PAUSE_DASHES, ", "))
_CLOSING_PUNCTUATION = frozenset(",.;:!?")
_MARKUP_LEFTOVERS = re.compile(r"(?<!\w)[*_#`~]+|[*_`~]+(?!\w)")
_TRANSLATE = str.maketrans(
    {
        "\N{LEFT SINGLE QUOTATION MARK}": "'",
        "\N{RIGHT SINGLE QUOTATION MARK}": "'",
        "\N{SINGLE LOW-9 QUOTATION MARK}": "'",
        "\N{SINGLE HIGH-REVERSED-9 QUOTATION MARK}": "'",
        "\N{PRIME}": "'",
        "\N{LEFT DOUBLE QUOTATION MARK}": '"',
        "\N{RIGHT DOUBLE QUOTATION MARK}": '"',
        "\N{DOUBLE LOW-9 QUOTATION MARK}": '"',
        "\N{DOUBLE PRIME}": '"',
        "\N{LEFT-POINTING DOUBLE ANGLE QUOTATION MARK}": '"',
        "\N{RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK}": '"',
        "\N{HORIZONTAL ELLIPSIS}": "...",
        "\N{BULLET}": " ",
        "\N{BLACK CIRCLE}": " ",
        "\N{MIDDLE DOT}": " ",
        "&": " and ",
    }
)


def clean_text(text: str) -> str:
    """Normalise a block of extracted text for display, preserving paragraph breaks."""
    text = unicodedata.normalize("NFC", text).translate(_INVISIBLE)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL.sub("", text)
    lines = [_SPACES.sub(" ", line).strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def clean_inline(text: str) -> str:
    """Collapse a block into a single display line (used for paragraphs and headings)."""
    return _SPACES.sub(" ", clean_text(text).replace("\n", " ")).strip()


def _dash_pauses(text: str) -> str:
    """Read dashes used as pauses as commas, together with the whitespace around them.

    Every em dash or horizontal bar becomes ", " and takes the whitespace directly before and after it;
    an en dash or hyphen does so only when it stands alone between whitespace ("a - b"), so hyphenated
    words keep their hyphen. Whitespace already taken by one dash is not available to the next.
    Working on whitespace-delimited words keeps this linear; a regex that starts with optional whitespace
    would retry the same whitespace run from every position inside it.
    """
    parts = _WHITESPACE_RUN.split(text)  # words at even indexes, the whitespace between them at odd ones
    out: list[str] = []
    space_taken = False  # the whitespace before the current word already belongs to a dash
    for index in range(0, len(parts), 2):
        word = parts[index]
        space_before = index > 0 and not space_taken
        space_after = index + 1 < len(parts)
        if word in _SPACED_DASHES and space_before and space_after:
            out.append(", ")
            space_taken = True
            continue
        if space_before and word[:1] not in _PAUSE_DASHES:
            out.append(parts[index - 1])
        out.append(word.translate(_PAUSE_TABLE))
        space_taken = space_after and word[-1:] in _PAUSE_DASHES
    return "".join(out)


def _attach_punctuation(text: str) -> str:
    """Drop whitespace directly before closing punctuation ("word ," becomes "word,")."""
    parts = _WHITESPACE_RUN.split(text)  # odd indexes hold whitespace and are always followed by a word
    return "".join(
        part for index, part in enumerate(parts) if index % 2 == 0 or parts[index + 1][:1] not in _CLOSING_PUNCTUATION
    )


def speech_text(text: str) -> str:
    """Rewrite display text into the string sent to the TTS engine."""
    spoken = _URL.sub(" link ", text)
    spoken = _DASH_BETWEEN_NUMBERS.sub(r"\1 to ", spoken)
    spoken = spoken.translate(_TRANSLATE)
    spoken = _dash_pauses(spoken)
    spoken = _MARKUP_LEFTOVERS.sub(" ", spoken)
    spoken = _REPEAT_PUNCT.sub(r"\1", spoken)
    spoken = _SPACES.sub(" ", spoken).strip()
    return _attach_punctuation(spoken)


def word_count(text: str) -> int:
    return len(re.findall(r"\w+", text))
