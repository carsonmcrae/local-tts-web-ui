# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""
Purpose: Upgrade safety of the sound-effects migration: where it sits in the list and what survives it.
Scope: The migration is the last entry and the only one that creates its tables, every statement in
  it guarded; a database at each released version (1 for v2.0.0, 5 for the first desktop release,
  13 for the voices and LAN release, 16 for the literary library) and a fresh file upgrade to the current version with their
  documents, sentences, reading progress, voice profiles and preferences unchanged; upgrading again
  changes nothing; a development database that already has the tables keeps their rows.
Does NOT belong: The behaviour of the tables once they exist (test_sound_effects_api.py).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import pytest

from ltts.db import MIGRATIONS, Database

CURRENT = len(MIGRATIONS)
SOUND_EFFECTS = next(number for number, script in enumerate(MIGRATIONS, start=1) if "sound_effects" in script)
# The user_version of each build a reader may still be upgrading from.
RELEASED = {
    "v2.0.0": 1,
    "2.0.0 desktop (PR 37)": 5,
    "voices and LAN (PR 38)": 13,
    "literary library (PR 48)": 16,
}

# A reader's data as the first schema stored it: columns by name, so the rows fit every later version.
ROWS: dict[str, tuple[str, tuple[Any, ...]]] = {
    "documents": (
        "id, title, filename, file_type, size_bytes, char_count, word_count, page_count, segment_count,"
        " sections_json, warnings_json, source_sha256, created_at, last_opened_at",
        ("d1", "A story", None, "paste", 40, 40, 8, None, 2, "[]", "[]", "sha", "2026-10-01T00:00:00Z", None),
    ),
    "segments": (
        "document_id, idx, section_idx, paragraph_idx, kind, boundary, text",
        ("d1", 0, 0, 0, "sentence", "", "The door creaked open."),
    ),
    "progress": (
        "document_id, segment_idx, voice_id, updated_at",
        ("d1", 1, "kokoro:af_heart", "2026-10-02T00:00:00Z"),
    ),
    "voice_profiles": (
        "id, name, engine_id, duration_s, sample_rate, quality_json, consent_statement, consented_at, source, created_at",
        (
            "v1",
            "Sam",
            "chatterbox",
            12.5,
            24000,
            "{}",
            "I consent",
            "2026-10-01T00:00:00Z",
            "studio",
            "2026-10-01T00:00:00Z",
        ),
    ),
    "preferences": ("key, value_json", ("playback", '{"rate": 1.1, "voiceId": "kokoro:af_heart"}')),
}


def at_version(path: Path, version: int) -> None:
    """A database as a build with ``version`` migrations left it, holding a reader's data."""
    with sqlite3.connect(path) as conn:
        for number, script in enumerate(MIGRATIONS[:version], start=1):
            conn.executescript(f"BEGIN; {script}; PRAGMA user_version = {number}; COMMIT;")
        for table, (columns, values) in ROWS.items():
            marks = ", ".join("?" * len(values))
            conn.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", values)  # noqa: S608 - fixed names


def stored(path: Path) -> dict[str, list[Any]]:
    with sqlite3.connect(path) as conn:
        return {
            table: conn.execute(f"SELECT {columns} FROM {table}").fetchall()  # noqa: S608 - fixed names
            for table, (columns, _) in ROWS.items()
        }


def version_of(path: Path) -> int:
    with sqlite3.connect(path) as conn:
        return int(conn.execute("PRAGMA user_version").fetchone()[0])


def tables(path: Path) -> set[str]:
    with sqlite3.connect(path) as conn:
        return {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def test_the_migration_is_the_last_entry_and_the_only_one_with_its_tables() -> None:
    assert SOUND_EFFECTS == CURRENT, "the sound-effects migration must stay after every released one"
    earlier = "\n".join(MIGRATIONS[: SOUND_EFFECTS - 1])
    assert "sound_effects" not in earlier and "sound_analyses" not in earlier
    script = MIGRATIONS[SOUND_EFFECTS - 1]
    assert script.count("CREATE TABLE IF NOT EXISTS") == 2 and script.count("CREATE INDEX IF NOT EXISTS") == 1
    unguarded = script.replace("CREATE TABLE IF NOT EXISTS", "").replace("CREATE INDEX IF NOT EXISTS", "")
    assert "CREATE " not in unguarded and "ALTER " not in unguarded


@pytest.mark.parametrize(("release", "version"), list(RELEASED.items()), ids=list(RELEASED))
def test_a_released_database_upgrades_with_its_data_unchanged(tmp_path: Path, release: str, version: int) -> None:
    path = tmp_path / "ltts.sqlite3"
    at_version(path, version)
    before = stored(path)
    assert version_of(path) == version and "sound_effects" not in tables(path)
    Database(path).migrate()
    assert version_of(path) == CURRENT, release
    assert stored(path) == before, release
    assert {"sound_effects", "sound_analyses"} <= tables(path)
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM sound_effects").fetchone()[0] == 0
    Database(path).migrate()  # once more: nothing to do, nothing changed
    assert version_of(path) == CURRENT and stored(path) == before


def test_a_fresh_database_is_created_at_the_current_version(tmp_path: Path) -> None:
    path = tmp_path / "new" / "ltts.sqlite3"
    Database(path).migrate()
    assert version_of(path) == CURRENT
    expected = {"documents", "segments", "progress", "voice_profiles", "preferences", "sound_effects", "sound_analyses"}
    assert expected <= tables(path)


def test_a_development_database_that_already_has_the_tables_keeps_its_rows(tmp_path: Path) -> None:
    """A build before the renumbering created the tables early; the guarded script leaves them be."""
    path = tmp_path / "ltts.sqlite3"
    at_version(path, SOUND_EFFECTS - 1)
    with sqlite3.connect(path) as conn:
        conn.executescript(MIGRATIONS[SOUND_EFFECTS - 1])
        conn.execute("INSERT INTO sound_analyses VALUES ('d1', 0, 'rules-1', 'balanced', 2, 1, '2026-10-03T00:00:00Z')")
    Database(path).migrate()
    assert version_of(path) == CURRENT
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT detector FROM sound_analyses").fetchall() == [("rules-1",)]
