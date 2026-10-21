# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: What the owner allowed for the local speech API, and its access token.

Scope: Keeps the on/off switch (off by default), the "other devices on my network" permission (off
by default), the custom voices allowed for the API (none by default) and a SHA-256 hash of the token
in the ``integrations`` table. A new token is made here and returned once; only its hash is stored,
so it can never be read back, and a supplied token is checked by comparing hashes in constant time.
Revoking deletes the hash. Allowed custom voices that were deleted are dropped.
Does NOT belong: Serving requests (``router.py``, ``service.py``) or rate limits (``guard.py``).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import threading
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, replace

from ltts.common import utc_now
from ltts.db import Database
from ltts.errors import NotFoundError

NAME = "speech-api"
TOKEN_PREFIX = "ttsn_"  # noqa: S105 - a prefix that makes a leaked token easy to recognise, not a token


def hash_token(token: str) -> str:
    """The token is 256 random bits, so a plain SHA-256 (no slow KDF) can't be reversed or guessed."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class SpeechApiConfig:
    enabled: bool = False
    allow_network: bool = False
    allowed_voices: tuple[str, ...] = ()
    token_hash: str | None = None
    token_created_at: str | None = None

    def accepts(self, supplied: str | None) -> bool:
        """Whether ``supplied`` is the current token (the hashes are compared in constant time)."""
        if not self.token_hash or not supplied:
            return False
        return hmac.compare_digest(hash_token(supplied), self.token_hash)


class SpeechApiStore:
    def __init__(self, db: Database, custom_voices: Callable[[], set[str]]):
        self._db = db
        self._custom_voices = custom_voices  # the ids of the custom voices that exist now
        self._lock = threading.Lock()  # each change reads, then rewrites, the one settings row

    def config(self) -> SpeechApiConfig:
        with self._db.connect() as conn:
            row = conn.execute("SELECT config_json FROM integrations WHERE name = ?", (NAME,)).fetchone()
        if row is None:
            return SpeechApiConfig()
        stored = json.loads(row["config_json"])
        return SpeechApiConfig(
            enabled=stored["enabled"],
            allow_network=stored["allow_network"],
            allowed_voices=tuple(stored["allowed_voices"]),
            token_hash=stored["token_hash"],
            token_created_at=stored["token_created_at"],
        )

    def _write(self, config: SpeechApiConfig) -> SpeechApiConfig:
        data = {**asdict(config), "allowed_voices": list(config.allowed_voices)}
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO integrations (name, config_json) VALUES (?, ?) "
                "ON CONFLICT(name) DO UPDATE SET config_json = excluded.config_json",
                (NAME, json.dumps(data)),
            )
        return config

    def save(self, *, enabled: bool, allow_network: bool, allowed_voices: Sequence[str]) -> SpeechApiConfig:
        wanted = tuple(dict.fromkeys(allowed_voices))
        if wanted and not set(wanted) <= self._custom_voices():
            raise NotFoundError("One of those custom voices no longer exists.", code="voice_not_found")
        with self._lock:
            current = self.config()
            return self._write(replace(current, enabled=enabled, allow_network=allow_network, allowed_voices=wanted))

    def new_token(self) -> tuple[str, SpeechApiConfig]:
        """Replace the token; the new one is returned here and never again."""
        token = TOKEN_PREFIX + secrets.token_urlsafe(32)
        with self._lock:
            current = self.config()
            config = self._write(replace(current, token_hash=hash_token(token), token_created_at=utc_now()))
        return token, config

    def revoke(self) -> SpeechApiConfig:
        with self._lock:
            return self._write(replace(self.config(), token_hash=None, token_created_at=None))

    def prune_voices(self) -> SpeechApiConfig:
        """Forget the permission of custom voices that were deleted."""
        with self._lock:
            current = self.config()
            if not current.allowed_voices:
                return current
            existing = self._custom_voices()
            kept = tuple(voice for voice in current.allowed_voices if voice in existing)
            if kept == current.allowed_voices:
                return current
            return self._write(replace(current, allowed_voices=kept))
