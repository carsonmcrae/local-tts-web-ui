"""Purpose: Text clean-up for display, and a separate speech-oriented rewrite for synthesis.

Scope: ``clean_text`` makes extracted text safe and tidy for reading (Unicode NFC, control and
zero-width characters removed, whitespace collapsed). ``speech_text`` rewrites a display string
into what the voice engine should actually say (typographic punctuation, URLs, footnote markers).
Does NOT belong: Sentence segmentation (``segmenter.py``) or engine-specific phonemisation.
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
_FOOTNOTE = re.compile(r"\[(?:\d{1,3}|[a-z])\]|(?<=[a-z.,;])\^\d{1,3}")
_REPEAT_PUNCT = re.compile(r"([!?])\1+")
_DASH_BETWEEN_NUMBERS = re.compile(r"(?<=\d)\s*[\N{EN DASH}\N{EM DASH}]\s*(?=\d)")
_DASH_PAUSE = re.compile(r"\s*[\N{EM DASH}\N{HORIZONTAL BAR}]\s*|\s+[\N{EN DASH}-]\s+")
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


def speech_text(text: str) -> str:
    """Rewrite display text into the string sent to the TTS engine."""
    spoken = _URL.sub(" link ", text)
    spoken = _FOOTNOTE.sub("", spoken)
    spoken = _DASH_BETWEEN_NUMBERS.sub(" to ", spoken)
    spoken = spoken.translate(_TRANSLATE)
    spoken = _DASH_PAUSE.sub(", ", spoken)
    spoken = _MARKUP_LEFTOVERS.sub(" ", spoken)
    spoken = _REPEAT_PUNCT.sub(r"\1", spoken)
    spoken = _SPACES.sub(" ", spoken).strip()
    return re.sub(r"\s+([,.;:!?])", r"\1", spoken)


def word_count(text: str) -> int:
    return len(re.findall(r"\w+", text))
