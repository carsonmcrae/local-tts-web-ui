# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Find the sentences of a shipped book and print their durable anchors, for writing presets.

Scope: Reads a work's EPUB from the server package exactly as the app does (the EPUB extractor and the
segmenter), then either lists a chapter's sentences with their indexes and hashes, or searches every
chapter for sentences containing the given words and prints each as a ready-made anchor (chapter,
hash, quote, occurrence) together with the dialogue analysis's speaker, so a preset's speaker and
effect annotations point at real sentences.
Usage: ``... python -I ../../scripts/library/anchor_tool.py <work_id> --chapter chapter-1`` or
``... python -I ../../scripts/library/anchor_tool.py <work_id> --find "I shall be late" --find "Off with"``.
Does NOT belong: Writing presets (by hand, in ltts/library/presets/*.json) or validating them (tests).
"""

from __future__ import annotations

import argparse
import json
import sys
from importlib import resources
from pathlib import Path

from ltts.documents.delivery import Sentence, analyse
from ltts.documents.extract_epub import extract_epub_file
from ltts.documents.segmenter import segment_extraction
from ltts.documents.structures import ExtractionLimits
from ltts.library.presets import make_anchor, sentence_hash

LIMITS = ExtractionLimits(10_000_000, 10_000, 10_000, 200 * 1024 * 1024, 500)


def load(work_id: str) -> tuple[list[tuple[str, int, int, str, str | None]], dict[int, str]]:
    """Every sentence as (chapter id, section index, segment index, text, tagged speaker), and chapter ids."""
    root = resources.files("ltts.library")
    catalog = json.loads(root.joinpath("catalog.json").read_text("utf-8"))
    work = next(w for w in catalog["works"] if w["work_id"] == work_id)
    path = Path(str(root.joinpath(*work["file"].split("/"))))
    segments, sections = segment_extraction(extract_epub_file(path, None, LIMITS))
    chapters = {section.index: work["chapters"][section.index]["id"] for section in sections}
    lines = analyse([Sentence(s.index, s.paragraph_index, s.kind, s.text) for s in segments])
    rows = [(chapters[s.section_index], s.section_index, s.index, s.text, lines[s.index].speaker) for s in segments]
    return rows, chapters


def main() -> None:
    parser = argparse.ArgumentParser(description="Anchors for a shipped book's sentences.")
    parser.add_argument("work_id")
    parser.add_argument("--chapter", help="list this chapter's sentences (its id, such as chapter-1)")
    parser.add_argument("--find", action="append", default=[], help="print anchors for sentences containing this text")
    parser.add_argument("--speakers", action="store_true", help="count the speakers the dialogue analysis finds")
    args = parser.parse_args()
    rows, chapters = load(args.work_id)
    if args.speakers:
        counts: dict[str, int] = {}
        for _, _, _, _, speaker in rows:
            if speaker:
                counts[speaker] = counts.get(speaker, 0) + 1
        for name, count in sorted(counts.items(), key=lambda item: -item[1]):
            print(f"{count:4d}  {name}")
        return
    if args.chapter:
        for chapter, _, index, text, speaker in rows:
            if chapter == args.chapter:
                print(f"{index:5d} {sentence_hash(text)} {('[' + speaker + '] ') if speaker else ''}{text}")
        return
    for wanted in args.find:
        matches = [(chapter, index, text, speaker) for chapter, _, index, text, speaker in rows if wanted in text]
        seen: dict[str, int] = {}
        for chapter, index, text, speaker in matches:
            key = sentence_hash(text)
            seen[key] = seen.get(key, 0) + 1
            anchor = make_anchor(chapter, text, seen[key])
            print(json.dumps({"index": index, "speaker": speaker, "anchor": anchor.model_dump()}, ensure_ascii=False))
        if not matches:
            print(f"no sentence contains {wanted!r}", file=sys.stderr)
    print(f"{len(rows)} sentences in {len(chapters)} chapters", file=sys.stderr)


if __name__ == "__main__":
    main()
