# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the migration registry and for upgrading databases people already have.
Scope: The registry has exactly the agreed entries (1–13 from main, 14–16 from the literary library; the
sound-effects work takes 17 next, see docs/architecture/literary-library.md section 2) and each of 14–16
creates the tables it owns and no others. A database left at version 1 (v2.0.0), 5 (the first desktop
build) or 13 (main) upgrades to the current version with every document, segment, reading position,
bookmark, pronunciation, voice profile and preference unchanged, the app then lists those documents with
default shelf facets, and migrating again changes nothing. A fresh database reaches the same version
with a sound schema.
Does NOT belong: What the new tables mean (test_library_organization.py, test_library_catalog.py).
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine
from ltts.app import create_app
from ltts.config import Settings
from ltts.container import build_services
from ltts.db import MIGRATIONS, Database

CURRENT = 16
OWNED = {
    14: {"folders", "document_shelf", "document_genres", "document_tags", "collections", "collection_documents"},
    15: {"bundled_documents", "hidden_works"},
    16: {"document_presets"},
}
DOC = "d" * 32
NOW = "2026-10-01T00:00:00+00:00"


def tables_created(script: str) -> set[str]:
    return set(re.findall(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)", script))


def test_the_registry_has_the_agreed_entries() -> None:
    assert len(MIGRATIONS) == CURRENT  # the sound-effects migration becomes 17 when that branch merges
    for number, tables in OWNED.items():
        assert tables_created(MIGRATIONS[number - 1]) == tables
        earlier = {table for script in MIGRATIONS[: number - 1] for table in tables_created(script)}
        assert not tables & earlier
    assert all("IF NOT EXISTS" in MIGRATIONS[number - 1] for number in OWNED)


def _at_version(path: Path, version: int) -> None:
    """A database as a build with ``version`` migrations left it, with the rows a person would have."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        for number, script in enumerate(MIGRATIONS[:version], start=1):
            conn.executescript(f"BEGIN; {script}; PRAGMA user_version = {number}; COMMIT;")
        conn.execute(
            "INSERT INTO documents (id, title, filename, file_type, size_bytes, char_count, word_count, page_count, "
            "segment_count, sections_json, warnings_json, source_sha256, created_at, last_opened_at) "
            "VALUES (?, 'Old Book', 'old.txt', 'txt', 20, 20, 4, NULL, 2, ?, '[]', ?, ?, NULL)",
            (
                DOC,
                json.dumps([{"index": 0, "title": "Old Book", "start_segment": 0, "segment_count": 2}]),
                "0" * 64,
                NOW,
            ),
        )
        conn.executemany(
            "INSERT INTO segments (document_id, idx, section_idx, paragraph_idx, kind, boundary, text) "
            "VALUES (?, ?, 0, 0, 'paragraph', 'sentence', ?)",
            [(DOC, 0, "First sentence."), (DOC, 1, "Second one.")],
        )
        conn.execute(
            "INSERT INTO progress (document_id, segment_idx, voice_id, updated_at) VALUES (?, 1, 'kokoro:alpha', ?)",
            (DOC, NOW),
        )
        conn.execute("INSERT INTO preferences (key, value_json) VALUES ('playback_rate', '1.25')")
        conn.execute(
            "INSERT INTO voice_profiles (id, name, engine_id, duration_s, sample_rate, quality_json, consent_statement, "
            "consented_at, source, created_at) VALUES (?, 'Mine', 'chatterbox', 12.0, 24000, '{}', 'I consent', ?, "
            "'recording', ?)",
            ("c" * 32, NOW, NOW),
        )
        if version >= 5:
            conn.execute(
                "INSERT INTO bookmarks (id, document_id, segment_idx, note, created_at) VALUES (?, ?, 1, 'note', ?)",
                ("b" * 32, DOC, NOW),
            )
            conn.execute(
                "INSERT INTO pronunciations (id, word, say_as, match_case, created_at) VALUES (?, 'Kael', 'Kale', 0, ?)",
                ("e" * 32, NOW),
            )
        if version >= 8:
            conn.execute(
                "INSERT INTO document_characters (document_id, name, voice_id) VALUES (?, 'Ann', 'kokoro:alpha')",
                (DOC,),
            )
        conn.commit()


def _rows(path: Path) -> dict[str, list[tuple[object, ...]]]:
    with sqlite3.connect(path) as conn:
        tables = [
            r[0]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        ]
        rows = {}
        for table in sorted(tables):  # names come from sqlite_master, not from input
            rows[table] = conn.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()  # noqa: S608
        return rows


@pytest.mark.parametrize("version", [1, 5, 13])
def test_a_database_people_already_have_upgrades_with_its_rows_intact(
    version: int, tmp_path: Path, engines: dict[str, FakeEngine]
) -> None:
    settings = Settings(
        env="test", data_dir=tmp_path / "data", models_dir=tmp_path / "models", warm_up_engines=False,
        extra_allowed_hosts=["testserver"],
    )  # fmt: skip
    settings.path()
    _at_version(settings.database_path, version)
    before = _rows(settings.database_path)
    assert sqlite3.connect(settings.database_path).execute("PRAGMA user_version").fetchone()[0] == version

    Database(settings.database_path).migrate()
    after = _rows(settings.database_path)
    with sqlite3.connect(settings.database_path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == CURRENT
        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    for table, rows in before.items():
        # Every row is still there with every value it had; later migrations only append columns with defaults.
        assert [row[: len(rows[0])] if rows else row for row in after[table]] == rows, table
    for table in OWNED[14] | OWNED[15] | OWNED[16]:
        assert after[table] == []  # nothing is organised or bundled on a person's behalf

    # The app opens the upgraded database and shows the same document with default facets.
    services = build_services(settings, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines.values()))
    with TestClient(create_app(settings, services=services), headers={"X-LTTS-Client": "web"}) as client:
        [doc] = client.get("/api/documents").json()
        assert doc["id"] == DOC and doc["title"] == "Old Book" and doc["progress"]["segmentIndex"] == 1
        assert doc["shelf"] == {
            "folderId": None, "favorite": False, "documentType": None, "genres": [], "tags": [], "collectionIds": [],
        }  # fmt: skip
        assert doc["bundledWorkId"] is None
        assert client.get("/api/library/folders").json() == [] and client.get("/api/library/works").status_code == 200
        if version >= 5:
            assert [b["note"] for b in client.get(f"/api/documents/{DOC}/bookmarks").json()] == ["note"]
            assert [p["word"] for p in client.get("/api/pronunciations").json()] == ["Kael"]
        if version >= 8:
            voices = {c["name"]: c["voiceId"] for c in client.get(f"/api/documents/{DOC}/characters").json()}
            assert voices["Ann"] == "kokoro:alpha"
    # Migrating again (the same list, or a merge that re-runs it) is a no-op; the app's own first-run
    # bookkeeping on the documents table is kept apart from what the migrations do.
    settled = _rows(settings.database_path)
    Database(settings.database_path).migrate()
    assert _rows(settings.database_path) == settled


def test_a_fresh_database_is_at_the_current_version(tmp_path: Path) -> None:
    database = Database(tmp_path / "fresh.sqlite3")
    database.migrate()
    with sqlite3.connect(database.path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == CURRENT
        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert OWNED[14] | OWNED[15] | OWNED[16] <= tables
