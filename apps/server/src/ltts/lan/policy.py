# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: What a phone or tablet on the network may do, and what stays on this computer.

Scope: A device that isn't paired may only load the app itself and pair (or ask whether it is
paired). A paired device may use only what is listed here (anything new stays on this computer until
it is added): read, listen, control playback, change reading preferences and pronunciations, add and
edit documents, organise the library (folders, collections, tags), style sentences, place sound
effects, and start, pause, resume and download exports. Sensitive operations
stay on this computer: LAN, speech API and integration settings, voices and their recordings,
engines, this computer's jobs, the system, importing web pages, and anything that throws work away
or uses this computer's accounts (deleting documents, exports or saved casts, cancelling an export,
sending one to Audiobookshelf). Starting costly work (exports, uploads) and short synthesis (voice
previews, another take of a sentence) are each limited per device.
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
    (_ANY, "/api/library"),  # folders, collections, tags and organising; nothing here deletes a document
    (_ANY, "/api/cast-presets"),  # except removing one (_ON_THE_COMPUTER)
    (_READ, "/api/audio"),
    (_ANY, "/api/voices"),  # the voice list and previews
    (_READ, "/api/engines"),
    (_READ, "/api/jobs"),
    (_ANY, "/api/exports"),  # except what _ON_THE_COMPUTER keeps here
    (_ANY, "/api/preferences"),
    (_ANY, "/api/pronunciations"),
    (_READ, "/api/sound-effects"),  # the bundled sound library (effects themselves live under documents)
)
_EXACT_READS = {"/api/voice-profiles", "/api/voice-profiles/blends", "/api/voice-profiles/consent"}
# Sensitive operations under an allowed prefix, which a paired device must still do on the computer.
_ON_THE_COMPUTER: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("POST", re.compile(r"^/api/documents/url/?$")),  # the server would fetch the page from the internet
    ("DELETE", re.compile(r"^/api/documents/[^/]+/?$")),  # a document and everything made from it
    ("DELETE", re.compile(r"^/api/exports/[^/]+/?$")),  # an export's files: minutes or hours of synthesis
    ("POST", re.compile(r"^/api/exports/[^/]+/cancel/?$")),  # throws away the sentences it has saved
    ("POST", re.compile(r"^/api/exports/[^/]+/audiobookshelf/?$")),  # this computer's account, another server
    ("DELETE", re.compile(r"^/api/cast-presets/[^/]+/?$")),  # a saved cast: the person's work assigning voices
)
_ID = r"[0-9a-f]{32}"
# Starting work that costs minutes of synthesis or stores files.
_COSTLY = re.compile(
    rf"^/api/(exports|exports/{_ID}/resume|documents/(upload|text)|documents/{_ID}/cover|library/works/[a-z0-9-]+/open)/?$"
)
COSTLY_PER_WINDOW = 20
COSTLY_WINDOW_S = 600.0
# Seconds of synthesis each, asked for freely in moderation: a voice's preview, or another take of one sentence.
_BRIEF = re.compile(rf"^/api/(voices/[^/]+/preview|documents/{_ID}/segments/[0-9]+/takes)/?$")
BRIEF_PER_WINDOW = 60


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


def brief(method: str, path: str) -> bool:
    """A voice preview or another take of a sentence: seconds of synthesis each, limited per device."""
    return method == "POST" and bool(_BRIEF.match(path))


class WorkBudget:
    """At most ``limit`` requests per device in any ``COSTLY_WINDOW_S`` seconds (``COSTLY_PER_WINDOW`` by default)."""

    def __init__(self, limit: int = COSTLY_PER_WINDOW, clock: Callable[[], float] = time.monotonic):
        self._limit = limit
        self._clock = clock
        self._used: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, device_id: str) -> bool:
        with self._lock:
            now = self._clock()
            self._used = {key: kept for key, used in self._used.items() if (kept := self._recent(used, now))}
            recent = self._used.get(device_id, [])
            if len(recent) >= self._limit:
                return False
            self._used[device_id] = [*recent, now]
            return True

    @staticmethod
    def _recent(used: list[float], now: float) -> list[float]:
        return [moment for moment in used if moment > now - COSTLY_WINDOW_S]
