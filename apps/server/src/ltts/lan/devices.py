# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Paired phones and tablets, and the short-lived codes that pair them.

Scope: A pairing code is eight characters from an alphabet without look-alikes (shown as XXXX-XXXX),
valid for five minutes, used once, and dropped after ten wrong guesses; guesses are also limited per
address. Pairing gives the device a random token (kept as an HttpOnly cookie on the device; only its
SHA-256 is stored, in ``lan_devices``), which identifies it until it is removed. Removing a device,
or all of them, takes effect on its next request.
Does NOT belong: Listening on the network (``listener.py``) or deciding what a device may do (``policy.py``).
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass, field

from ltts.common import ApiModel, new_id, utc_now
from ltts.db import Database
from ltts.errors import AppError, NotFoundError

ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # no 0/O, 1/I/L
CODE_LENGTH = 8
CODE_TTL_S = 300.0
MAX_WRONG_PER_CODE = 10
MAX_TRIES_PER_MINUTE = 5  # per address
MAX_DEVICES = 20
TOKEN_PREFIX = "ttsd_"  # noqa: S105 - a marker that makes a leaked device token recognisable


class PairingFailedError(AppError):
    status_code = 403
    code = "pairing_failed"


class DeviceOut(ApiModel):
    id: str
    name: str
    created_at: str
    last_seen_at: str | None


class PairingOut(ApiModel):
    code: str  # XXXX-XXXX
    expires_in_s: int


@dataclass
class _Pairing:
    code: str
    expires: float
    wrong: int = 0


@dataclass
class PairingCodes:
    """At most one live code at a time; a new one replaces it."""

    clock: object = time.monotonic
    _current: _Pairing | None = None
    _tries: dict[str, list[float]] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def _now(self) -> float:
        return float(self.clock())  # type: ignore[operator]

    def new(self) -> PairingOut:
        code = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
        with self._lock:
            self._current = _Pairing(code, self._now() + CODE_TTL_S)
        return PairingOut(code=f"{code[:4]}-{code[4:]}", expires_in_s=int(CODE_TTL_S))

    def current(self) -> PairingOut | None:
        with self._lock:
            pairing = self._current
            if pairing is None or pairing.expires <= self._now():
                return None
            return PairingOut(
                code=f"{pairing.code[:4]}-{pairing.code[4:]}", expires_in_s=int(pairing.expires - self._now())
            )

    def cancel(self) -> None:
        with self._lock:
            self._current = None

    def use(self, supplied: str, address: str) -> None:
        """Accept the live code once, or raise; wrong guesses count against the code and the address."""
        guess = "".join(char for char in supplied.upper() if char in ALPHABET)
        with self._lock:
            now = self._now()
            recent = [moment for moment in self._tries.get(address, []) if moment > now - 60]
            if len(recent) >= MAX_TRIES_PER_MINUTE:
                raise PairingFailedError("Too many tries. Wait a minute, then try again.", code="pairing_rate_limited")
            self._tries[address] = [*recent, now]
            pairing = self._current
            if pairing is None or pairing.expires <= now:
                raise PairingFailedError("That code has expired. Show a new one on the computer.")
            if not hmac.compare_digest(guess.encode(), pairing.code.encode()):
                pairing.wrong += 1
                if pairing.wrong >= MAX_WRONG_PER_CODE:
                    self._current = None
                raise PairingFailedError("That code isn't right. Check it on the computer and try again.")
            self._current = None  # used once


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class DeviceStore:
    def __init__(self, db: Database):
        self._db = db

    def add(self, name: str) -> tuple[DeviceOut, str]:
        """A new paired device and its token (returned once, never stored)."""
        if len(self.list_all()) >= MAX_DEVICES:
            raise PairingFailedError(
                f"Up to {MAX_DEVICES} devices can be paired. Remove one first.", code="device_limit"
            )
        token = TOKEN_PREFIX + secrets.token_urlsafe(32)
        device_id = new_id()
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO lan_devices (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)",
                (device_id, name, _hash(token), utc_now()),
            )
        return self.get(device_id), token

    def get(self, device_id: str) -> DeviceOut:
        with self._db.connect() as conn:
            row = conn.execute("SELECT * FROM lan_devices WHERE id = ?", (device_id,)).fetchone()
        if row is None:
            raise NotFoundError("That device isn't paired.", code="device_not_found")
        return _out(row)

    def list_all(self) -> list[DeviceOut]:
        with self._db.connect() as conn:
            rows = conn.execute("SELECT * FROM lan_devices ORDER BY created_at").fetchall()
        return [_out(row) for row in rows]

    def identify(self, token: str) -> DeviceOut | None:
        """The device a token belongs to (recording that it was seen), or None."""
        if not token.startswith(TOKEN_PREFIX) or len(token) > 100:
            return None
        with self._db.connect() as conn:
            row = conn.execute("SELECT * FROM lan_devices WHERE token_hash = ?", (_hash(token),)).fetchone()
            if row is None:
                return None
            conn.execute("UPDATE lan_devices SET last_seen_at = ? WHERE id = ?", (utc_now(), row["id"]))
        return _out(row)

    def remove(self, device_id: str) -> None:
        with self._db.connect() as conn:
            if conn.execute("DELETE FROM lan_devices WHERE id = ?", (device_id,)).rowcount == 0:
                raise NotFoundError("That device isn't paired.", code="device_not_found")

    def remove_all(self) -> None:
        with self._db.connect() as conn:
            conn.execute("DELETE FROM lan_devices")


def _out(row: sqlite3.Row) -> DeviceOut:
    return DeviceOut(id=row["id"], name=row["name"], created_at=row["created_at"], last_seen_at=row["last_seen_at"])
