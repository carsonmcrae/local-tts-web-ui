# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: What a phone or tablet on the network may do, and what stays on this computer.

Scope: A device that isn't paired may only load the app itself and pair (or ask whether it is
paired). A paired device may use only what is listed here (anything new stays on this computer until
it is added): read, listen, control playback, change reading preferences and pronunciations, add and
edit documents, style sentences and run exports. It may never change LAN, speech API or integration
settings, record, build, import, export, share or delete voices, play a voice's recording, install
or remove engines, cancel this computer's jobs, import web pages (the server would fetch them),
change the system or delete documents. Starting costly work (exports, uploads) is limited per device.
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
    (_ANY, "/api/documents"),  # except the two below
    (_ANY, "/api/cast-presets"),
    (_READ, "/api/audio"),
    (_ANY, "/api/voices"),  # the voice list and previews
    (_READ, "/api/engines"),
    (_READ, "/api/jobs"),
    (_ANY, "/api/exports"),
    (_ANY, "/api/preferences"),
    (_ANY, "/api/pronunciations"),
)
_EXACT_READS = {"/api/voice-profiles", "/api/voice-profiles/blends", "/api/voice-profiles/consent"}
_DOCUMENT = re.compile(r"^/api/documents/[0-9a-f]{32}/?$")
_ID = r"[0-9a-f]{32}"
# Starting work that costs minutes of synthesis or stores files.
_COSTLY = re.compile(
    rf"^/api/(exports|exports/{_ID}/(resume|audiobookshelf)|documents/(upload|text)|documents/{_ID}/cover)/?$"
)
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
    if (method, path) == ("POST", "/api/documents/url") or (method == "DELETE" and _DOCUMENT.match(path)):
        return True
    if method in _READ and path in _EXACT_READS:
        return False
    return not any(method in methods and _under(path, prefix) for methods, prefix in _ALLOWED)


def costly(method: str, path: str) -> bool:
    """Starting an export, sending one on, or adding a document or cover (limited per device)."""
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
