# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the bundled literary catalog: what ships, its rights records, and opening a work.

Scope: Every work's file and cover match the catalog's checksums and the app's own EPUB extractor reads
it without warnings, with the recorded chapters, a title, an author, verse that keeps its lines and no
address pointing anywhere; every rights record names its evidence, a date and whether it holds
worldwide; covers are JPEGs. The API lists the works, opens one through the ordinary pipeline (once:
opening it again returns the same document), links it, fills in author, description, cover, type and
genres, hides and shows a work, serves covers and credits, refuses unknown works and a tampered file,
and deleting the document unlinks the work. A paired device's open counts as costly work.
Does NOT belong: Organising the library (test_library_organization.py) or immersive presets.
"""

from __future__ import annotations

import io
import json
import re
import shutil
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine
from ltts.config import Settings
from ltts.container import Services, build_services
from ltts.documents.extract_epub import extract_epub_file
from ltts.documents.structures import ExtractionLimits
from ltts.lan.policy import costly
from ltts.library import catalog as catalog_module
from ltts.library.catalog import CHARS_PER_WORD, Catalog, LibraryStores, load_catalog, shipped_files

LIMITS = ExtractionLimits(10_000_000, 10_000, 10_000, 200 * 1024 * 1024, 500)
ALICE = "alices-adventures-in-wonderland"
POE_POEMS = "poe-selected-poems"
WORKS = catalog_module.load_catalog()[1]
PACKAGE = catalog_module._package()  # the tests read the shipped data directly


def test_the_catalog_is_complete_and_every_file_matches() -> None:
    version, works = load_catalog()
    assert version >= 1 and 15 <= len(works) <= 25
    assert len({w.work_id for w in works}) == len(works)
    shipped = {path.name for path in shipped_files()}
    for work in works:
        assert Path(work.file).name in shipped
        assert work.authors and work.title and work.sort_title and work.first_published < 1930
        assert work.rights.evidence and re.fullmatch(r"\d{4}-\d{2}-\d{2}", work.rights.verified_on)
        rights = work.rights
        assert rights.scope.startswith("Public domain in the United States") and "95 years" in rights.us_basis
        deaths = [p.died for p in [*work.authors, *work.contributors] if p.died]
        if rights.cleared_term_years == 100:  # clear of the longest term in force: nothing left unresolved
            assert rights.latest_death == max(deaths) and rights.latest_death + 100 < 2026 and rights.caveat is None
        elif rights.cleared_term_years == 70:  # clear of the common term: longer ones are named
            assert rights.latest_death == max(deaths) and rights.latest_death + 70 < 2026 and "Mexico" in rights.caveat
        else:  # someone died too recently or has no dates: the United States only, and it says why
            assert rights.scope == "Public domain in the United States." and rights.caveat
        if work.cover:
            assert work.cover["rights"] and ("died" in work.cover["rights"] or "unknown artist" in work.cover["rights"])
        assert work.edition["source_url"].startswith("https://") and work.edition["source_sha256"]
        if work.cover:
            assert PACKAGE.joinpath(*work.cover["file"].split("/")).read_bytes()[:3] == b"\xff\xd8\xff"
        else:
            assert work.cover_note
    total = sum(path.stat().st_size for path in shipped_files())
    assert total < 8 * 1024 * 1024, f"the catalog has grown to {total / 1024 / 1024:.1f} MB"


@pytest.mark.parametrize("work", WORKS, ids=[w.work_id for w in WORKS])
def test_every_shipped_book_reads_cleanly(work: catalog_module.CatalogWork, tmp_path: Path) -> None:
    path = Path(str(PACKAGE.joinpath(*work.file.split("/"))))
    extraction = extract_epub_file(path, None, LIMITS)
    assert extraction.warnings == []
    assert extraction.title == work.title
    assert [s.title for s in extraction.sections] == [c["title"] for c in work.chapters]
    text = " ".join(block.text for section in extraction.sections for block in section.blocks)
    assert "Standard Ebooks" not in text and "Project Gutenberg" not in text and "Gutenberg" not in text
    with zipfile.ZipFile(path) as book:
        for name in book.namelist():
            if name.endswith(".xhtml"):
                page = book.read(name).decode("utf-8")
                assert "<img" not in page and "<script" not in page and 'href="http' not in page, name
    assert work.word_count > 1000


def test_verse_keeps_its_lines_in_the_poetry_editions() -> None:
    work = next(w for w in WORKS if w.work_id == POE_POEMS)
    extraction = extract_epub_file(Path(str(PACKAGE.joinpath(*work.file.split("/")))), None, LIMITS)
    raven = next(s for s in extraction.sections if s.title == "The Raven")
    assert raven.blocks[0].kind == "heading" and raven.blocks[0].text == "The Raven"
    assert raven.blocks[1].text == "Once upon a midnight dreary, while I pondered, weak and weary,"
    assert raven.blocks[1].line_break and raven.blocks[2].line_break and not raven.blocks[6].line_break
    assert raven.blocks[6].text.endswith("Only this and nothing more.”")


def catalog_of(services: Services) -> Catalog:
    return services.catalog


def test_opening_a_work_reads_it_through_the_pipeline_once(client: TestClient, services: Services) -> None:
    listed = {w["workId"]: w for w in client.get("/api/library/works").json()}
    alice = listed[ALICE]
    assert alice["documentId"] is None and not alice["hidden"] and alice["hasCover"]
    assert alice["chapterCount"] == 13 and alice["estimatedSeconds"] == round(alice["wordCount"] * CHARS_PER_WORD / 15)
    opened = client.post(f"/api/library/works/{ALICE}/open")
    assert opened.status_code == 201, opened.text
    doc = opened.json()
    assert doc["title"] == "Alice’s Adventures in Wonderland" and doc["fileType"] == "epub"
    assert doc["author"] == "Lewis Carroll" and doc["hasCover"] is True
    assert doc["shelf"]["documentType"] == "novel" and doc["shelf"]["genres"] == ["childrens", "fantasy"]
    assert [s["title"] for s in doc["sections"]][:2] == [
        "All in the Golden Afternoon",
        "Chapter 1: Down the Rabbit-Hole",
    ]
    assert client.get(f"/api/documents/{doc['id']}/details").json()["description"].startswith("A young girl")
    again = client.post(f"/api/library/works/{ALICE}/open")
    assert again.status_code == 201 and again.json()["id"] == doc["id"]
    assert len(client.get("/api/documents").json()) == 1
    assert client.get("/api/library/works").json()
    assert {w["workId"]: w["documentId"] for w in client.get("/api/library/works").json()}[ALICE] == doc["id"]
    assert client.get("/api/documents").json()[0]["bundledWorkId"] == ALICE
    # The reader deletes the document like any other; the work is simply not in the library any more.
    assert client.delete(f"/api/documents/{doc['id']}").status_code == 204
    assert catalog_of(services).document_for(ALICE) is None
    reopened = client.post(f"/api/library/works/{ALICE}/open").json()
    assert reopened["id"] != doc["id"]
    assert not list((services.settings.resolved_data_dir / "tmp").glob("*.upload"))


def test_hiding_covers_credits_and_unknown_works(client: TestClient) -> None:
    hidden = client.put(f"/api/library/works/{ALICE}/hidden", json={"hidden": True}).json()
    assert hidden["hidden"] is True
    assert client.put(f"/api/library/works/{ALICE}/hidden", json={"hidden": True}).json()["hidden"] is True
    assert next(w for w in client.get("/api/library/works").json() if w["workId"] == ALICE)["hidden"]
    assert client.put(f"/api/library/works/{ALICE}/hidden", json={"hidden": False}).json()["hidden"] is False
    cover = client.get(f"/api/library/works/{ALICE}/cover")
    assert cover.status_code == 200 and cover.headers["content-type"] == "image/jpeg"
    assert cover.content[:3] == b"\xff\xd8\xff"
    plain = next(w["workId"] for w in client.get("/api/library/works").json() if not w["hasCover"])
    assert client.get(f"/api/library/works/{plain}/cover").json()["error"]["code"] == "cover_not_found"
    assert client.get("/api/library/works/credits").text.startswith("# Credits for the bundled books")
    assert client.post("/api/library/works/not-a-work/open").json()["error"]["code"] == "work_not_found"
    assert client.get("/api/library/works/BAD_ID/cover").status_code == 422
    assert costly("POST", f"/api/library/works/{ALICE}/open") and not costly("GET", "/api/library/works")


def test_a_tampered_or_missing_file_leaves_the_work_out(
    tmp_path: Path, settings: Settings, engines: dict[str, FakeEngine]
) -> None:
    folder = tmp_path / "catalog"
    folder.mkdir()
    catalog_module.copy_to(folder)
    works = json.loads((folder / "catalog.json").read_text("utf-8"))["works"]
    (folder / "works" / f"{ALICE}.epub").write_bytes(b"not the book")
    (folder / "covers" / "the-time-machine.jpg").unlink()
    (folder / "works" / "the-wonderful-wizard-of-oz.epub").unlink()
    services = build_services(settings, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines.values()))
    tampered = Catalog(settings, services.db, LibraryStores(services.document_service, services.document_repo,
                                                           services.details, services.shelf), package=folder)  # fmt: skip
    kept = {w.work_id for w in tampered.works}
    assert ALICE not in kept and "the-time-machine" not in kept and "the-wonderful-wizard-of-oz" not in kept
    assert len(kept) == len(works) - 3
    with pytest.raises(catalog_module.NotFoundError):
        tampered.work(ALICE)
    # A work without a cover opens without one, and its plain-cover note explains why.
    willows = tampered.open("the-wind-in-the-willows")
    assert willows.has_cover is False and willows.author == "Kenneth Grahame"
    assert next(w for w in tampered.list_all() if w.work_id == "the-wind-in-the-willows").cover_note
    shutil.rmtree(folder)


def test_the_library_limit_applies_to_bundled_books(
    client: TestClient, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(services.settings, "max_documents", 1)
    client.post("/api/documents/text", json={"text": "One. Two.", "title": "Mine"})
    refused = client.post(f"/api/library/works/{ALICE}/open")
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "document_limit"
    assert services.catalog.document_for(ALICE) is None


def test_credits_name_every_work_and_its_cover() -> None:
    text = PACKAGE.joinpath("CREDITS.md").read_text("utf-8")
    for work in WORKS:
        assert work.title in text
        if work.cover:
            assert work.cover["artwork"].split(",")[0] in text
    archive = io.BytesIO(PACKAGE.joinpath(*WORKS[0].file.split("/")).read_bytes())
    with zipfile.ZipFile(archive) as book:
        assert book.infolist()[0].filename == "mimetype" and book.infolist()[0].compress_type == zipfile.ZIP_STORED
