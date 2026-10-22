# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Build the bundled literary catalog from checked source files, reproducibly.

Scope: Reads scripts/library/sources.json and the downloaded sources (``--sources <dir>``), checks
each file's SHA-256, rewrites every edition into the text-only EPUB that ships (epub_rewrite.py, or
gutenberg_dickinson.py for the Project Gutenberg text), scales each cover with ffmpeg, reads every
shipped book back through the app's own EPUB extractor to count words and chapters and to refuse any
external reference, and writes apps/server/src/ltts/library/{catalog.json,works,covers,CREDITS.md}.
Usage: ``node scripts/uv-run.mjs --cwd apps/server run --frozen python -I ../../scripts/library/build_catalog.py --sources <dir> [--only <work_id>]``.
Does NOT belong: Downloading anything (sources are fetched by hand and recorded), choosing works
(sources.json) or serving the catalog (ltts/library/catalog.py).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from epub_rewrite import choose_chapters, external_references, read_source, source_cover, write_epub  # noqa: E402
from gutenberg_dickinson import dickinson_chapters  # noqa: E402

from ltts.documents.extract_epub import extract_epub_file  # noqa: E402
from ltts.documents.normalize import word_count  # noqa: E402
from ltts.documents.structures import ExtractionLimits  # noqa: E402

REPO = HERE.parents[1]
PACKAGE = REPO / "apps" / "server" / "src" / "ltts" / "library"
LIMITS = ExtractionLimits(10_000_000, 10_000, 10_000, 200 * 1024 * 1024, 500)
COVER_WIDTH = 480
RIGHTS_TEXT = (
    "The text of this work is in the public domain in the United States. The edition's markup, metadata and "
    "the changes made for this reader are dedicated to the public domain under the CC0 1.0 Universal Public "
    "Domain Dedication by their contributors."
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_checked(sources: Path, relative: str, expected: str) -> bytes:
    data = (sources / relative).read_bytes()
    digest = sha256(data)
    if digest != expected:
        raise SystemExit(f"{relative}: SHA-256 {digest} does not match sources.json ({expected})")
    return data


def scale_cover(ffmpeg: str, original: bytes, out: Path) -> None:
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / "cover.jpg"
        source.write_bytes(original)
        subprocess.run(  # noqa: S603 - fixed arguments, a tool we looked up by name
            [ffmpeg, "-y", "-v", "error", "-i", str(source), "-vf", f"scale={COVER_WIDTH}:-2", "-q:v", "5",
             "-map_metadata", "-1", str(out)],
            check=True,
        )  # fmt: skip


def measure(epub_path: Path) -> tuple[int, list[dict[str, str]], list[str]]:
    """Words, chapters and warnings as the app itself reads the shipped book."""
    extraction = extract_epub_file(epub_path, None, LIMITS)
    words = sum(word_count(block.text) for section in extraction.sections for block in section.blocks)
    chapters = [{"title": section.title} for section in extraction.sections]
    return words, chapters, list(extraction.warnings)


def _edition(entry: dict[str, Any], config: dict[str, Any], source_meta: dict[str, Any], raw: bytes) -> dict[str, Any]:
    source = entry["source"]
    if source["kind"] == "standardebooks":
        base = config["standard_ebooks"]
        return {
            "edition_id": f"standardebooks:{source['path']}@{source_meta['revision']}",
            "source": "Standard Ebooks",
            "source_url": base["base_url"] + source["path"],
            "source_revision": source_meta["revision"],
            "source_released": source_meta["modified"],
            "source_file": source["file"],
            "source_sha256": source["sha256"],
            "source_bytes": len(raw),
            "transcription": source_meta["transcriptions"],
            "changes": base["changes"]
            + (
                [f"Only part of the collection ships: {', '.join(entry['selection'])}."]
                if entry.get("selection")
                else []
            ),
            "selection": {"from": source_meta["title"], "items": entry["selection"]}
            if entry.get("selection")
            else None,
        }
    return {
        "edition_id": f"gutenberg:{source['number']}@{source['sha256'][:12]}",
        "source": "Project Gutenberg (text taken as public domain, with its licence and trademark removed)",
        "source_url": source["url"],
        "source_revision": source["sha256"][:12],
        "source_released": None,
        "source_file": source["file"],
        "source_sha256": source["sha256"],
        "source_bytes": len(raw),
        "transcription": [source["mirror"]],
        "changes": entry["changes"],
        "selection": None,
    }


LONGEST_TERM = 100  # years after death: Mexico, the longest general term in force
COMMON_TERM = 70  # the European Union, the United Kingdom, Brazil, Australia and most other countries
LONGER_TERMS = "Mexico (100 years) or Colombia (80 years)"


def _scope(year: int, people: list[dict[str, Any]], built_for: str) -> dict[str, Any]:
    """Where the text is known to be public domain, from the year it appeared and when its contributors died.

    United States: anything first published before 1930 (more than 95 years ago). Elsewhere copyright
    runs from an author's death, so the latest death among the people whose work is in the shipped text
    decides: 100 years clear covers the longest term in force, 70 years the common one, and anyone who
    died later, or whose dates are unknown, leaves other countries unresolved.
    """
    counted = [p for p in people if p.get("affects_text", True)]
    undated = [p["name"] for p in counted if not p.get("died")]
    latest = max((p["died"] for p in counted if p.get("died")), default=None)
    this_year = int(built_for[:4])
    scope = "Public domain in the United States."
    caveat: str | None = None
    cleared: int | None = None
    if undated:
        caveat = f"Rights elsewhere depend on {', '.join(undated)}, whose dates are not recorded."
    elif latest is not None and latest + LONGEST_TERM < this_year:
        cleared = LONGEST_TERM
        scope = (
            "Public domain in the United States, and everywhere copyright ends up to 100 years after death, "
            f"the longest term in force: the last contributor died {latest}."
        )
    elif latest is not None and latest + COMMON_TERM < this_year:
        cleared = COMMON_TERM
        scope = (
            "Public domain in the United States, and wherever copyright ends 70 years or less after death: "
            f"the last contributor died {latest}."
        )
        caveat = f"Not yet free where the term is longer, such as {LONGER_TERMS}."
    elif latest is not None:
        late = [p for p in counted if p.get("died") == latest]
        who = " and ".join(f"{p['name']} ({p.get('role', 'author')}, died {p['died']})" for p in late)
        caveat = (
            f"Outside the United States, the work of {who} may be protected until {latest + COMMON_TERM + 1} "
            "where copyright lasts 70 years after death."
        )
        authors = [p for p in counted if p not in late and p.get("died")]
        if authors and all(p["died"] + LONGEST_TERM < this_year for p in authors):
            names = ", ".join(f"{p['name']} (died {p['died']})" for p in authors)
            caveat += f" The author's own text is beyond every term: {names}."
    return {
        "us_basis": f"First published {year}, more than 95 years ago, so public domain in the United States.",
        "latest_death": latest,
        "cleared_term_years": cleared,
        "scope": scope,
        "caveat": caveat,
    }


def _cover_rights(cover: dict[str, Any], built_for: str) -> str:
    """Where the cover painting is known to be public domain (same rules as the text)."""
    died = cover.get("artist_died")
    this_year = int(built_for[:4])
    if died is None:
        match = re.search(r"\((?:c\. )?(\d{4})\)", cover["artwork"])
        if "unknown artist" not in cover["artwork"] or not match or int(match.group(1)) + 120 > this_year:
            raise SystemExit(f"cover {cover['artwork']!r}: record the artist's death year or leave the cover out")
        return f"By an unknown artist, about {match.group(1)}: beyond every copyright term."
    if died + LONGEST_TERM < this_year:
        return f"The painter died {died}: public domain everywhere (terms run up to 100 years after death)."
    if died + COMMON_TERM < this_year:
        return (
            f"The painter died {died}: public domain in the United States and wherever copyright ends 70 years or "
            f"less after death; not yet free where the term is longer, such as {LONGER_TERMS}."
        )
    raise SystemExit(f"cover {cover['artwork']!r}: the painter died {died}, too recently to ship")


def _rights(entry: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    people = [*entry["authors"], *entry["contributors"]]
    base = config["standard_ebooks"]["licence"] if entry["source"]["kind"] == "standardebooks" else None
    evidence = base["evidence"] if base else entry["rights_evidence"]
    basis = "; ".join(
        f"{p['name']} died {p['died']}" if p.get("died") else f"{p['name']}: dates not recorded" for p in people
    )
    return {
        "status": "public-domain-us",
        **_scope(entry["first_published"], people, config["built_for"]),
        "basis": f"First published {entry['first_published']}. {basis}.",
        "licence": base["name"]
        if base
        else "Public domain (United States); Project Gutenberg text with its licence removed",
        "licence_url": base["url"] if base else "https://www.gutenberg.org/policy/license.html",
        "evidence": evidence,
        "verified_on": config["built_for"],
        "permits": {"redistribution": True, "modification": True, "commercial": True, "performance": True},
        "attribution_required": False,
        "attribution": "Edition prepared by Standard Ebooks volunteers (a courtesy credit, not a requirement)."
        if base
        else "Transcription from Project Gutenberg (a courtesy credit; the trademark is not used).",
        "trademark_note": "The publisher's name and logo do not appear in the shipped file; see CREDITS.md."
        if base
        else "The Project Gutenberg name and licence were removed as its licence allows for stripped text.",
    }


def build_work(entry: dict[str, Any], config: dict[str, Any], sources: Path, ffmpeg: str | None) -> dict[str, Any]:
    work_id = entry["work_id"]
    raw = read_checked(sources, entry["source"]["file"], entry["source"]["sha256"])
    if entry["source"]["kind"] == "standardebooks":
        source = read_source(str(sources / entry["source"]["file"]))
        chapters = choose_chapters(source, entry.get("selection"))
        title = entry.get("title") or source.title
        description = entry.get("description") or source.abstract
        source_meta = {
            "revision": source.revision,
            "modified": source.modified,
            "transcriptions": source.transcriptions,
            "title": source.title,
        }
        language = source.language
        cover_bytes = source_cover(source) if entry["cover"]["use"] else None
    else:
        chapters = dickinson_chapters(raw.decode("utf-8"))
        title, description, language, cover_bytes = entry["title"], entry["description"], "en-US", None
        source_meta = {}
    meta = {
        "work_id": work_id, "title": title, "language": language, "description": description,
        "creators": [a["name"] for a in entry["authors"]],
        "contributors": [f"{c['name']} ({c['role']})" for c in entry["contributors"]],
        "sources": [_edition(entry, config, source_meta, raw)["source_url"], *source_meta.get("transcriptions", [])],
        "rights": RIGHTS_TEXT,
    }  # fmt: skip
    epub = write_epub(meta, chapters)
    stray = external_references(epub)
    if stray:
        raise SystemExit(f"{work_id}: external references remain: {stray[:5]}")
    out = PACKAGE / "works" / f"{work_id}.epub"
    out.write_bytes(epub)
    words, read_chapters, warnings = measure(out)
    if warnings:
        print(f"  ! {work_id}: the extractor warned: {warnings}")
    cover: dict[str, Any] | None = None
    if cover_bytes is not None and ffmpeg:
        cover_path = PACKAGE / "covers" / f"{work_id}.jpg"
        scale_cover(ffmpeg, cover_bytes, cover_path)
        cover = {"file": f"covers/{work_id}.jpg", "bytes": cover_path.stat().st_size, "sha256": sha256(cover_path.read_bytes()),
                 "artwork": entry["cover"]["artwork"], "artist_died": entry["cover"].get("artist_died"),
                 "rights": _cover_rights(entry["cover"], config["built_for"]),
                 "design": "Standard Ebooks cover composition (CC0), scaled for the library"}  # fmt: skip
    record = {
        "work_id": work_id, "title": title, "sort_title": entry["sort_title"], "authors": entry["authors"],
        "contributors": entry["contributors"], "first_published": entry["first_published"], "language": language,
        "document_type": entry["document_type"], "genres": entry["genres"], "description": description,
        "content_notes": entry["content_notes"], "word_count": words,
        "chapters": [{"id": c.stem, "title": c.title} for c in chapters],
        "chapters_read": len(read_chapters), "edition": _edition(entry, config, source_meta, raw),
        "file": f"works/{work_id}.epub", "bytes": len(epub), "sha256": sha256(epub), "text_version": 1,
        "cover": cover, "cover_note": entry["cover"].get("reason"), "rights": _rights(entry, config),
        "featured": entry["featured"], "preset_version": None,
    }  # fmt: skip
    if len(read_chapters) != len(chapters):
        raise SystemExit(f"{work_id}: wrote {len(chapters)} chapters but the extractor read {len(read_chapters)}")
    print(
        f"  {work_id}: {len(chapters)} chapters, {words:,} words, {len(epub) / 1024:.0f} KB"
        + (f", cover {cover['bytes'] / 1024:.0f} KB" if cover else "")
    )
    return record


def credits(records: list[dict[str, Any]]) -> str:
    lines = [
        "# Credits for the bundled books",
        "",
        "Every work here is in the public domain in the United States (first published before 1930). Where",
        "else it is free depends on when its author and contributors died; each entry says so, with the",
        "countries where the term is longer. Each entry also says where its text came",
        "from, what changed, and whose painting is on the cover. Standard Ebooks and Project Gutenberg are",
        "credited as sources out of courtesy; neither name is used as a publisher of these files, and their",
        "own pages, logos and licences were removed from what ships. The changes and this file are",
        "dedicated to the public domain (CC0 1.0).",
        "",
    ]
    for r in sorted(records, key=lambda r: r["sort_title"]):
        authors = ", ".join(a["name"] for a in r["authors"])
        lines += [f"## {r['title']} — {authors} ({r['first_published']})", ""]
        lines.append(
            f"- Source: {r['edition']['source']}, {r['edition']['source_url']} (revision {r['edition']['source_revision']})."
        )
        for url in r["edition"]["transcription"]:
            lines.append(f"- Transcription: {url}")
        for c in r["contributors"]:
            lines.append(f"- {c['role'].capitalize()}: {c['name']}" + (f" ({c['note']})" if c.get("note") else ""))
        if r["cover"]:
            lines.append(f"- Cover: {r['cover']['artwork']}. {r['cover']['rights']} {r['cover']['design']}.")
        elif r.get("cover_note"):
            lines.append(f"- Cover: none. {r['cover_note']}")
        rights = r["rights"]
        lines.append(
            f"- Rights: {rights['basis']} {rights['scope']}" + (f" {rights['caveat']}" if rights["caveat"] else "")
        )
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the bundled literary catalog.")
    parser.add_argument("--sources", required=True, help="folder holding the downloaded source files")
    parser.add_argument("--only", help="build one work (for checking a change)")
    args = parser.parse_args()
    config = json.loads((HERE / "sources.json").read_text("utf-8"))
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("! ffmpeg not found: covers are not built")
    (PACKAGE / "works").mkdir(parents=True, exist_ok=True)
    (PACKAGE / "covers").mkdir(parents=True, exist_ok=True)
    records = []
    for entry in config["works"]:
        if args.only and entry["work_id"] != args.only:
            continue
        records.append(build_work(entry, config, Path(args.sources), ffmpeg))
    if args.only:
        return
    catalog = {
        "schema": "ttsnative.literary-catalog/1",
        "catalog_version": config["catalog_version"],
        "built_for": config["built_for"],
        "works": records,
    }
    text = json.dumps(catalog, indent=2, ensure_ascii=False) + "\n"
    (PACKAGE / "catalog.json").write_text(text, encoding="utf-8", newline="\n")
    (PACKAGE / "CREDITS.md").write_text(credits(records) + "\n", encoding="utf-8", newline="\n")
    total = sum(r["bytes"] for r in records) + sum(r["cover"]["bytes"] for r in records if r["cover"])
    print(f"{len(records)} works, {total / 1024 / 1024:.2f} MB of books and covers")


if __name__ == "__main__":
    main()
