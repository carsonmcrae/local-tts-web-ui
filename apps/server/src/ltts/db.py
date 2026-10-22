# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: SQLite persistence primitives: connections and forward-only schema migrations.

Scope: Short-lived connections (safe across request and worker threads) with WAL, foreign keys and
a busy timeout; ordered migrations tracked by ``PRAGMA user_version``.
Does NOT belong: Domain queries — each feature owns its repository module.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

MIGRATIONS: tuple[str, ...] = (
    # 1: initial schema
    """
    CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        filename TEXT,
        file_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        char_count INTEGER NOT NULL,
        word_count INTEGER NOT NULL,
        page_count INTEGER,
        segment_count INTEGER NOT NULL,
        sections_json TEXT NOT NULL,
        warnings_json TEXT NOT NULL,
        source_sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_opened_at TEXT
    );
    CREATE TABLE segments (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        idx INTEGER NOT NULL,
        section_idx INTEGER NOT NULL,
        paragraph_idx INTEGER NOT NULL,
        kind TEXT NOT NULL,
        boundary TEXT NOT NULL,
        text TEXT NOT NULL,
        PRIMARY KEY (document_id, idx)
    );
    CREATE TABLE progress (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        segment_idx INTEGER NOT NULL,
        voice_id TEXT,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE voice_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        engine_id TEXT NOT NULL,
        duration_s REAL NOT NULL,
        sample_rate INTEGER NOT NULL,
        quality_json TEXT NOT NULL,
        consent_statement TEXT NOT NULL,
        consented_at TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE audio_cache (
        key TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        duration_s REAL NOT NULL,
        engine_id TEXT NOT NULL,
        voice_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL
    );
    CREATE INDEX audio_cache_voice ON audio_cache(voice_id);
    CREATE INDEX audio_cache_lru ON audio_cache(last_used_at);
    CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL NOT NULL,
        message TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        result_json TEXT,
        error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE preferences (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
    );
    """,
    # 2: studio voices (a built voice file and a delivery per profile) and draft recording sessions
    """
    ALTER TABLE voice_profiles ADD COLUMN kind TEXT NOT NULL DEFAULT 'quick';
    ALTER TABLE voice_profiles ADD COLUMN delivery TEXT NOT NULL DEFAULT 'natural';
    ALTER TABLE voice_profiles ADD COLUMN voice_file TEXT;
    CREATE TABLE voice_sessions (
        id TEXT PRIMARY KEY,
        candidates_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE voice_takes (
        session_id TEXT NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        prompt_id TEXT,
        source TEXT NOT NULL,
        duration_s REAL NOT NULL,
        quality_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (session_id, number)
    );
    """,
    # 3: a studio session's tone correction for a bright or thin microphone
    """
    ALTER TABLE voice_sessions ADD COLUMN tone_json TEXT;
    """,
    # 4: the tone correction grew into a full cleanup (noise reduction, rumble filter and tone)
    """
    ALTER TABLE voice_sessions RENAME COLUMN tone_json TO cleanup_json;
    """,
    # 5: the pronunciation dictionary, and bookmarks with notes
    """
    CREATE TABLE pronunciations (
        id TEXT PRIMARY KEY,
        word TEXT NOT NULL,
        say_as TEXT NOT NULL,
        match_case INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    CREATE TABLE bookmarks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        segment_idx INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE (document_id, segment_idx)
    );
    """,
    """
    CREATE TABLE segment_styles (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        segment_idx INTEGER NOT NULL,
        voice_id TEXT,
        effect TEXT,
        sound TEXT,
        PRIMARY KEY (document_id, segment_idx)
    );
    CREATE TABLE document_cast (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        dialogue_voice_id TEXT
    );
    """,
    """
    CREATE TABLE document_details (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        author TEXT,
        narrator TEXT,
        description TEXT
    );
    CREATE TABLE integrations (
        name TEXT PRIMARY KEY,
        config_json TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE segment_annotations (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        segment_idx INTEGER NOT NULL,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (document_id, segment_idx, kind)
    );
    INSERT INTO segment_annotations SELECT document_id, segment_idx, 'voice', voice_id
        FROM segment_styles WHERE voice_id IS NOT NULL;
    INSERT INTO segment_annotations SELECT document_id, segment_idx, 'effect', effect
        FROM segment_styles WHERE effect IS NOT NULL;
    INSERT INTO segment_annotations SELECT document_id, segment_idx, 'sound', sound
        FROM segment_styles WHERE sound IS NOT NULL;
    DROP TABLE segment_styles;
    ALTER TABLE document_cast ADD COLUMN split_dialogue INTEGER NOT NULL DEFAULT 1;
    CREATE TABLE document_characters (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        voice_id TEXT NOT NULL,
        PRIMARY KEY (document_id, name)
    );
    CREATE TABLE cast_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mapping_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """,
    # a take recorded again keeps the one it replaced, to compare them and restore the old one
    """
    ALTER TABLE voice_takes ADD COLUMN previous_json TEXT;
    """,
    # voice blends: a voice mixed from built-in Kokoro voices
    """
    CREATE TABLE voice_blends (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parts_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """,
    # phones and tablets paired for LAN mode (only a hash of each device's token)
    """
    CREATE TABLE lan_devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_seen_at TEXT
    );
    """,
    # a paired device's cookie works only from the address it paired from; other attempts are kept
    """
    ALTER TABLE lan_devices ADD COLUMN address TEXT;
    ALTER TABLE lan_devices ADD COLUMN refused_address TEXT;
    ALTER TABLE lan_devices ADD COLUMN refused_at TEXT;
    """,
    # a pronunciation can be for one document instead of every one (deleted with that document)
    """
    ALTER TABLE pronunciations ADD COLUMN document_id TEXT REFERENCES documents(id) ON DELETE CASCADE;
    CREATE INDEX pronunciations_by_document ON pronunciations(document_id);
    """,
    # 14: how the library is organised (ADR-24): folders, a document's shelf entry (folder, type,
    # favourite), its genres and tags, and collections. IF NOT EXISTS: branches that add migrations in
    # parallel can be merged in either order. Nothing that exists is touched.
    """
    CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS folders_by_parent ON folders(parent_id);
    CREATE TABLE IF NOT EXISTS document_shelf (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
        document_type TEXT,
        favorite INTEGER NOT NULL DEFAULT 0,
        favorited_at TEXT
    );
    CREATE INDEX IF NOT EXISTS document_shelf_by_folder ON document_shelf(folder_id);
    CREATE TABLE IF NOT EXISTS document_genres (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        genre TEXT NOT NULL,
        PRIMARY KEY (document_id, genre)
    );
    CREATE TABLE IF NOT EXISTS document_tags (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        tag_key TEXT NOT NULL,
        PRIMARY KEY (document_id, tag_key)
    );
    CREATE INDEX IF NOT EXISTS document_tags_by_key ON document_tags(tag_key);
    CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collection_documents (
        collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        added_at TEXT NOT NULL,
        PRIMARY KEY (collection_id, document_id)
    );
    CREATE INDEX IF NOT EXISTS collection_documents_by_document ON collection_documents(document_id);
    """,
    # 15: the bundled literary catalog (ADR-25): which document a bundled work became, and the works a
    # reader hid from Explore. A work's document is deleted like any other; the link goes with it.
    """
    CREATE TABLE IF NOT EXISTS bundled_documents (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        work_id TEXT NOT NULL UNIQUE,
        edition_id TEXT NOT NULL,
        content_sha256 TEXT NOT NULL,
        catalog_version INTEGER NOT NULL,
        text_version INTEGER NOT NULL,
        added_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hidden_works (
        work_id TEXT PRIMARY KEY,
        hidden_at TEXT NOT NULL
    );
    """,
    # 16: which immersive preset a bundled document applied and exactly what it wrote (character voices
    # and sentence annotations), so taking it out again leaves the reader's own choices alone.
    """
    CREATE TABLE IF NOT EXISTS document_presets (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        preset_id TEXT NOT NULL,
        preset_version INTEGER NOT NULL,
        components_json TEXT NOT NULL,
        applied_at TEXT NOT NULL
    );
    """,
)


def _configure(conn: sqlite3.Connection) -> None:
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")


class Database:
    """Opens a fresh connection per unit of work; SQLite handles cross-thread locking."""

    def __init__(self, path: Path):
        self.path = path

    def migrate(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.path) as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            for number, script in enumerate(MIGRATIONS[version:], start=version + 1):
                conn.executescript(f"BEGIN; {script}; PRAGMA user_version = {number}; COMMIT;")

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=5.0)
        _configure(conn)
        try:
            with conn:
                yield conn
        finally:
            conn.close()
