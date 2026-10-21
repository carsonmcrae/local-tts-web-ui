# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: What a phone or tablet on the network may do, and what stays on this computer.

Scope: A device that isn't paired may only load the app itself and pair (or ask whether it is
paired). A paired device may use only what is listed here (anything new stays on this computer until
it is added): read, listen, control playback, change reading preferences and pronunciations, add and
edit documents, style sentences, and start, pause, resume and download exports. Sensitive operations
stay on this computer: LAN, speech API and integration settings, voices and their recordings,
engines, this computer's jobs, the system, importing web pages, and anything that throws work away
or uses this computer's accounts (deleting documents or exports, cancelling an export, sending one to
Audiobookshelf). Starting costly work (exports, uploads) is limited per device.
Does NOT belong: Checking tokens or hosts (``security.py``) or pairing (``devices.py``).
"""

from __future__ import annotations

import re
import threading
import time
from collections.abc import Callable

PAIRING = {("POST", "/api/lan/pair"), ("GET", "/api/lan/device")}
LOCAL_ONLY = "Do this on the computer running TTSNative."
_READ = frozenset({"GET", "HEAD"})
_ANY = frozenset({"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"})
# Everything a paired device may reach, by method and path (a prefix covers the paths under it).
_ALLOWED: tuple[tuple[frozenset[str], str], ...] = (
    (_READ, "/api/health"),
    (_READ, "/api/system"),  # versions and storage sizes; the data folder's path is hidden
    (_ANY, "/api/documents"),  # except what _ON_THE_COMPUTER keeps here
    (_ANY, "/api/cast-presets"),
    (_READ, "/api/audio"),
    (_ANY, "/api/voices"),  # the voice list and previews
    (_READ, "/api/engines"),
    (_READ, "/api/jobs"),
    (_ANY, "/api/exports"),  # except what _ON_THE_COMPUTER keeps here
    (_ANY, "/api/preferences"),
    (_ANY, "/api/pronunciations"),
)
_EXACT_READS = {"/api/voice-profiles", "/api/voice-profiles/blends", "/api/voice-profiles/consent"}
# Sensitive operations under an allowed prefix, which a paired device must still do on the computer.
_ON_THE_COMPUTER: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("POST", re.compile(r"^/api/documents/url/?$")),  # the server would fetch the page from the internet
    ("DELETE", re.compile(r"^/api/documents/[^/]+/?$")),  # a document and everything made from it
    ("DELETE", re.compile(r"^/api/exports/[^/]+/?$")),  # an export's files: minutes or hours of synthesis
    ("POST", re.compile(r"^/api/exports/[^/]+/cancel/?$")),  # throws away the sentences it has saved
    ("POST", re.compile(r"^/api/exports/[^/]+/audiobookshelf/?$")),  # this computer's account, another server
)
_ID = r"[0-9a-f]{32}"
# Starting work that costs minutes of synthesis or stores files.
_COSTLY = re.compile(rf"^/api/(exports|exports/{_ID}/resume|documents/(upload|text)|documents/{_ID}/cover)/?$")
COSTLY_PER_WINDOW = 20
COSTLY_WINDOW_S = 600.0


def _under(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(f"{prefix}/")


def open_to_unpaired(method: str, path: str) -> bool:
    """The app itself (not the API) and pairing are all a device may reach before it is paired."""
    if (method, path) in PAIRING:
        return True
    api = path.startswith(("/api/", "/v1/")) or path in ("/api", "/docs", "/redoc", "/openapi.json")
    return method in _READ and not api


def refused_remotely(method: str, path: str) -> bool:
    """Whether a paired device must do this on the computer instead."""
    if (method, path) in PAIRING:
        return False
    if not path.startswith("/api/") and path != "/api":
        return method not in _READ  # the app's own pages
    if any(method == kept and pattern.match(path) for kept, pattern in _ON_THE_COMPUTER):
        return True
    if method in _READ and path in _EXACT_READS:
        return False
    return not any(method in methods and _under(path, prefix) for methods, prefix in _ALLOWED)


def costly(method: str, path: str) -> bool:
    """Starting or resuming an export, or adding a document or cover (limited per device)."""
    return method in ("POST", "PUT") and bool(_COSTLY.match(path))


class WorkBudget:
    """At most ``COSTLY_PER_WINDOW`` costly requests per device in any ``COSTLY_WINDOW_S`` seconds."""

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._used: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, device_id: str) -> bool:
        with self._lock:
            now = self._clock()
            self._used = {key: kept for key, used in self._used.items() if (kept := self._recent(used, now))}
            recent = self._used.get(device_id, [])
            if len(recent) >= COSTLY_PER_WINDOW:
                return False
            self._used[device_id] = [*recent, now]
            return True

    @staticmethod
    def _recent(used: list[float], now: float) -> list[float]:
        return [moment for moment in used if moment > now - COSTLY_WINDOW_S]
