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
