# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Content-addressed, size-bounded cache of synthesised segment audio.

Scope: Keys are SHA-256 over everything that affects the sound (engine revision, voice + its
revision, pace, boundary pause, exact spoken text, pipeline version), so changing any of them can
never serve stale audio. Files are written atomically; least-recently-used entries are evicted
past the configured limit; entries can be purged per voice (used when a voice is deleted).
Does NOT belong: Deciding what to synthesise (``service.py``).
"""

from __future__ import annotations

import hashlib
import json
import threading
from dataclasses import dataclass
from pathlib import Path

from ltts.common import new_id, utc_now
from ltts.db import Database

PIPELINE_VERSION = 1


@dataclass(frozen=True, slots=True)
class CachedAudio:
    key: str
    path: Path
    duration_s: float


def cache_key(**parts: object) -> str:
    payload = json.dumps({**parts, "pipeline": PIPELINE_VERSION}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class AudioCache:
    def __init__(self, root: Path, db: Database, max_bytes: int):
        self.root = root
        self._db = db
        self._max_bytes = max_bytes
        self._evict_lock = threading.Lock()

    def _path(self, key: str) -> Path:
        return self.root / key[:2] / f"{key}.wav"

    def get(self, key: str) -> CachedAudio | None:
        with self._db.connect() as conn:
            row = conn.execute("SELECT duration_s FROM audio_cache WHERE key = ?", (key,)).fetchone()
            if row is None:
                return None
            path = self._path(key)
            if not path.is_file():
                conn.execute("DELETE FROM audio_cache WHERE key = ?", (key,))
                return None
            conn.execute("UPDATE audio_cache SET last_used_at = ? WHERE key = ?", (utc_now(), key))
        return CachedAudio(key, path, row["duration_s"])

    def put(self, key: str, wav: bytes, duration_s: float, engine_id: str, voice_id: str) -> CachedAudio:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f"{path.name}.{new_id()}.tmp")
        tmp.write_bytes(wav)
        tmp.replace(path)
        now = utc_now()
        with self._db.connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO audio_cache VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (key, path.name, len(wav), duration_s, engine_id, voice_id, now, now),
            )
        self.evict()
        return CachedAudio(key, path, duration_s)

    def total_bytes(self) -> int:
        with self._db.connect() as conn:
            return int(conn.execute("SELECT COALESCE(SUM(size_bytes), 0) FROM audio_cache").fetchone()[0])

    def stats(self) -> dict[str, int]:
        with self._db.connect() as conn:
            row = conn.execute("SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM audio_cache").fetchone()
        return {"entries": int(row[0]), "bytes": int(row[1]), "limitBytes": self._max_bytes}

    def evict(self) -> int:
        removed = 0
        with self._evict_lock:
            excess = self.total_bytes() - self._max_bytes
            if excess <= 0:
                return 0
            with self._db.connect() as conn:
                rows = conn.execute("SELECT key, size_bytes FROM audio_cache ORDER BY last_used_at ASC").fetchall()
            for row in rows:
                if excess <= 0:
                    break
                self._delete(row["key"])
                excess -= row["size_bytes"]
                removed += 1
        return removed

    def _delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)
        with self._db.connect() as conn:
            conn.execute("DELETE FROM audio_cache WHERE key = ?", (key,))

    def purge_voice(self, voice_id: str) -> int:
        with self._db.connect() as conn:
            keys = [r[0] for r in conn.execute("SELECT key FROM audio_cache WHERE voice_id = ?", (voice_id,))]
        for key in keys:
            self._delete(key)
        return len(keys)

    def clear(self) -> int:
        with self._db.connect() as conn:
            keys = [r[0] for r in conn.execute("SELECT key FROM audio_cache")]
        for key in keys:
            self._delete(key)
        return len(keys)
