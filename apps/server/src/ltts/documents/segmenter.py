"""Purpose: Split extracted text into speech segments with stable, deterministic boundaries.

Scope: Rule-based sentence splitting (abbreviations, initials, decimals, closing quotes), splitting
of over-long sentences at clause punctuation then whitespace, and tagging each segment with the
boundary that follows it (sentence / paragraph / section) so synthesis can add natural pauses.
The same input always yields the same segments, which keeps audio cache keys stable.
Does NOT belong: Speech rewriting (``normalize.speech_text``) or engine phoneme limits.
"""

from __future__ import annotations

import re

from ltts.documents.structures import Boundary, Extraction, SectionInfo, Segment

SEGMENTER_VERSION = 1
MAX_SEGMENT_CHARS = 360
_ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "inc", "ltd", "co",
    "no", "fig", "vol", "ch", "approx", "dept", "est", "gen", "gov", "lt", "col", "capt", "sgt",
    "mt", "ft", "rev", "u.s", "u.k", "a.m", "p.m", "jan", "feb", "mar", "apr", "jun", "jul", "aug",
    "sep", "sept", "oct", "nov", "dec",
}  # fmt: skip
_CANDIDATE = re.compile(r"[.!?…]+[\"'”’)\]]*\s+")
_CLAUSE = re.compile(r"(?<=[;:,—])\s+")


def _is_false_break(text: str, end: int) -> bool:
    """True when the punctuation before ``end`` does not end a sentence."""
    following = text[end:].lstrip()[:1]
    if following and following.islower():  # '"Really?" she asked.' / 'wait... then left'
        return True
    match = re.search(r"([\w.]+)[.]$", text[:end].rstrip())
    if not match:
        return False
    word = match.group(1).lower()
    return word in _ABBREVIATIONS or bool(re.fullmatch(r"[a-z]", word))  # initials like "J. K. Rowling"


def split_sentences(paragraph: str) -> list[str]:
    sentences: list[str] = []
    start = 0
    for match in _CANDIDATE.finditer(paragraph):
        if _is_false_break(paragraph, match.end()):
            continue
        piece = paragraph[start : match.end()].strip()
        if piece:
            sentences.append(piece)
        start = match.end()
    tail = paragraph[start:].strip()
    if tail:
        sentences.append(tail)
    return sentences


def _split_long(sentence: str, limit: int = MAX_SEGMENT_CHARS) -> list[str]:
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
        rest = clause
        while len(rest) > limit:
            cut = rest.rfind(" ", 0, limit)
            cut = cut if cut > limit // 3 else limit
            pieces.append(rest[:cut].strip())
            rest = rest[cut:].strip()
        current = rest
    if current:
        pieces.append(current)
    return pieces


def segment_extraction(extraction: Extraction) -> tuple[list[Segment], list[SectionInfo]]:
    segments: list[Segment] = []
    sections: list[SectionInfo] = []
    paragraph_index = 0
    for section_index, section in enumerate(extraction.sections):
        start = len(segments)
        for block_number, block in enumerate(section.blocks):
            pieces = [block.text] if block.kind == "heading" else split_sentences(block.text)
            parts = [part for sentence in pieces for part in _split_long(sentence)]
            last_block = block_number == len(section.blocks) - 1
            for i, text in enumerate(parts):
                boundary: Boundary = "sentence"
                if i == len(parts) - 1:
                    boundary = "section" if last_block else "paragraph"
                segments.append(Segment(len(segments), section_index, paragraph_index, block.kind, boundary, text))
            paragraph_index += 1
        if len(segments) > start:
            sections.append(SectionInfo(len(sections), section.title, start, len(segments) - start, section.page))
    # Re-number section indexes so empty sections never leave gaps.
    remap = {info.start_segment: info.index for info in sections}
    current = 0
    for seg in segments:
        current = remap.get(seg.index, current)
        seg.section_index = current
    return segments, sections
