# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Per-request checks and live counters for the local speech API.

Scope: Recognising a request from a browser page (it carries ``Origin`` or ``Sec-Fetch-*`` headers)
or from another device (a client address that isn't loopback), reading a bearer token, the port a
request arrived on, a sliding-window rate limit with the seconds to wait, and in-memory usage
(requests served, when, with which voice, and whether one is being made now) for the Settings status
and the in-use indicator. Nothing here is persisted or logged.
Does NOT belong: Stored settings (``store.py``) or synthesis (``service.py``).
"""

from __future__ import annotations

import ipaddress
import math
import threading
import time
from collections import deque
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from ltts.common import utc_now

# Browsers add these to every request a page makes; scripts and command-line tools don't.
BROWSER_HEADERS = ("origin", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest")
ACTIVE_WINDOW_S = 10.0  # the app shows "in use" this long after the last request
WINDOW_S = 60.0


def from_browser(headers: Mapping[str, str]) -> bool:
    return any(name in headers for name in BROWSER_HEADERS)


def is_local(host: str | None) -> bool:
    """Whether a client address is this computer (IPv4 or IPv6 loopback, also IPv4 mapped into IPv6)."""
    try:
        address = ipaddress.ip_address(host or "")
    except ValueError:
        return False
    mapped = address.ipv4_mapped if isinstance(address, ipaddress.IPv6Address) else None
    return (mapped or address).is_loopback


def server_port(scope: Mapping[str, Any]) -> int | None:
    """The port of the server socket a request arrived on, which is where programs must connect.

    Not the ``Host`` header: under ``npm run dev`` the page comes from the web dev server's port, and its
    proxy passes that header on unchanged.
    """
    server = scope.get("server")
    return int(server[1]) if server and len(server) > 1 and server[1] else None


def bearer(header: str | None) -> str | None:
    """The token in ``Authorization: Bearer <token>``, or None."""
    scheme, _, value = (header or "").partition(" ")
    return (value.strip() or None) if scheme.lower() == "bearer" else None


class RateLimiter:
    """At most ``per_minute`` requests in any 60 seconds, counted for the current token only."""

    def __init__(self, per_minute: int, clock: Callable[[], float] = time.monotonic):
        self._limit = per_minute
        self._clock = clock
        self._key = ""
        self._window: deque[float] = deque()
        self._lock = threading.Lock()

    def hit(self, key: str) -> int | None:
        """Count a request; when the limit is reached, return the whole seconds to wait instead."""
        now = self._clock()
        with self._lock:
            if key != self._key:  # a new token starts with an empty window
                self._key, self._window = key, deque()
            while self._window and now - self._window[0] >= WINDOW_S:
                self._window.popleft()
            if len(self._window) >= self._limit:
                return max(1, math.ceil(WINDOW_S - (now - self._window[0])))
            self._window.append(now)
            return None


@dataclass(frozen=True, slots=True)
class UsageSnapshot:
    requests: int
    last_used_at: str | None
    last_voice_id: str | None
    in_progress: bool
    active: bool


class Usage:
    """Counts since the server started; kept in memory only."""

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._lock = threading.Lock()
        self._requests = 0
        self._running = 0
        self._last_at: str | None = None
        self._last_seen: float | None = None
        self._last_voice: str | None = None

    def started(self) -> None:
        with self._lock:
            self._running += 1

    def finished(self, voice_id: str | None) -> None:
        """A request ended; ``voice_id`` is the voice it was served with, or None when it failed."""
        with self._lock:
            self._running -= 1
            if voice_id is not None:
                self._requests += 1
                self._last_at, self._last_seen, self._last_voice = utc_now(), self._clock(), voice_id

    def snapshot(self) -> UsageSnapshot:
        with self._lock:
            recent = self._last_seen is not None and self._clock() - self._last_seen <= ACTIVE_WINDOW_S
            return UsageSnapshot(
                requests=self._requests,
                last_used_at=self._last_at,
                last_voice_id=self._last_voice,
                in_progress=self._running > 0,
                active=self._running > 0 or recent,
            )
