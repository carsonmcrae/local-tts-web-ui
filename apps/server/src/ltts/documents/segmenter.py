"""Purpose: Split extracted text into speech segments with stable, deterministic boundaries.

Scope: Rule-based sentence splitting (abbreviations, initials, decimals, closing quotes), splitting
of over-long sentences at clause punctuation then whitespace, and tagging each segment with the
boundary that follows it (sentence / paragraph / section) so synthesis can add natural pauses.
The same input always yields the same segments, which keeps audio cache keys stable.
Does NOT belong: Speech rewriting (``normalize.speech_text``) or engine phoneme limits.
"""

from __future__ import annotations

import re

from ltts.documents.structures import Block, Boundary, Extraction, SectionInfo, Segment

SEGMENTER_VERSION = 1
MAX_SEGMENT_CHARS = 360
_ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "inc", "ltd", "co",
    "no", "fig", "vol", "ch", "approx", "dept", "est", "gen", "gov", "lt", "col", "capt", "sgt",
    "mt", "ft", "rev", "u.s", "u.k", "a.m", "p.m", "jan", "feb", "mar", "apr", "jun", "jul", "aug",
    "sep", "sept", "oct", "nov", "dec",
}  # fmt: skip
# A run of sentence punctuation is only tried from its first character: a match can never start inside
# the run, and trying each later position would make a long run ("!!!!…") cost quadratic time.
_CANDIDATE = re.compile(r"(?<![.!?…])[.!?…]+[\"'”’)\]]*\s+")
_CLAUSE = re.compile(r"(?<=[;:,—])\s+")
_NON_SPACE = re.compile(r"\S")


def _is_word_char(char: str) -> bool:
    """Letters, digits and the underscore (the regex word class), plus the full stop inside "e.g"."""
    return char.isalnum() or char in "_."


def _word_before_full_stop(text: str, end: int) -> str | None:
    """The word that ends in a full stop just before ``end`` (trailing whitespace skipped), without the stop.

    Walks back from ``end`` instead of searching the whole text before it, so each call costs the length
    of that word: the same answer as searching ``text[:end].rstrip()`` for a word-and-dot run before a
    final full stop, without the quadratic backtracking such a search has on long runs.
    """
    stop = end
    while stop > 0 and text[stop - 1].isspace():
        stop -= 1
    if stop == 0 or text[stop - 1] != ".":
        return None
    start = stop - 1
    while start > 0 and _is_word_char(text[start - 1]):
        start -= 1
    return text[start : stop - 1] or None


def _is_false_break(text: str, end: int) -> bool:
    """True when the punctuation before ``end`` does not end a sentence."""
    following = _NON_SPACE.search(text, end)
    if following and following.group().islower():  # '"Really?" she asked.' / 'wait... then left'
        return True
    word = _word_before_full_stop(text, end)
    if word is None:
        return False
    word = word.lower()
    return word in _ABBREVIATIONS or bool(re.fullmatch(r"[a-z]", word))  # initials like "J. K. Rowling"


def split_sentences(paragraph: str) -> list[str]:
    sentences: list[str] = []
    start = 0
    for match in _CANDIDATE.finditer(paragraph):
        if _is_false_break(paragraph, match.end()):
            continue
        # Never empty: the slice always contains the matched punctuation.
        sentences.append(paragraph[start : match.end()].strip())
        start = match.end()
    tail = paragraph[start:].strip()
    if tail:
        sentences.append(tail)
    return sentences


def _hard_wrap(clause: str, limit: int) -> tuple[list[str], str]:
    """Cut a clause longer than ``limit`` at the last space before the limit (or at the limit itself).

    Returns the full pieces and the remainder, which is at most ``limit`` characters long.
    """
    pieces: list[str] = []
    rest = clause
    while len(rest) > limit:
        cut = rest.rfind(" ", 0, limit)
        cut = cut if cut > limit // 3 else limit
        pieces.append(rest[:cut].strip())
        rest = rest[cut:].strip()
    return pieces, rest


def _split_long(sentence: str, limit: int = MAX_SEGMENT_CHARS) -> list[str]:
    """Split an over-long sentence at clause punctuation, packing clauses up to ``limit`` characters."""
    if len(sentence) <= limit:
        return [sentence]
    pieces: list[str] = []
    current = ""
    for clause in _CLAUSE.split(sentence):
        candidate = f"{current} {clause}".strip()
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            pieces.append(current)
        wrapped, current = _hard_wrap(clause, limit)
        pieces.extend(wrapped)
    if current:
        pieces.append(current)
    return pieces


def _block_segments(
    block: Block, section_index: int, paragraph_index: int, first_index: int, last_boundary: Boundary
) -> list[Segment]:
    """One block's segments: sentence pauses inside it, then ``last_boundary`` after its last part."""
    pieces = [block.text] if block.kind == "heading" else split_sentences(block.text)
    parts = [part for sentence in pieces for part in _split_long(sentence)]
    return [
        Segment(
            first_index + i,
            section_index,
            paragraph_index,
            block.kind,
            last_boundary if i == len(parts) - 1 else "sentence",
            text,
        )
        for i, text in enumerate(parts)
    ]


def _renumber_sections(segments: list[Segment], sections: list[SectionInfo]) -> None:
    """Point each segment at its section's position in ``sections``, so empty sections never leave gaps."""
    remap = {info.start_segment: info.index for info in sections}
    current = 0
    for seg in segments:
        current = remap.get(seg.index, current)
        seg.section_index = current


def segment_extraction(extraction: Extraction) -> tuple[list[Segment], list[SectionInfo]]:
    segments: list[Segment] = []
    sections: list[SectionInfo] = []
    paragraph_index = 0
    for section_index, section in enumerate(extraction.sections):
        start = len(segments)
        for block_number, block in enumerate(section.blocks):
            last: Boundary = "section" if block_number == len(section.blocks) - 1 else "paragraph"
            segments += _block_segments(block, section_index, paragraph_index, len(segments), last)
            paragraph_index += 1
        if len(segments) > start:
            sections.append(SectionInfo(len(sections), section.title, start, len(segments) - start, section.page))
    _renumber_sections(segments, sections)
    return segments, sections
