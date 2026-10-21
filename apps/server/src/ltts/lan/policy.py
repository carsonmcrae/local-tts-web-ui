# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: What a phone or tablet on the network may do, and what stays on this computer.

Scope: A device that isn't paired may only load the app itself and pair (or ask whether it is
paired). A paired device may read, listen, control playback, change reading preferences, add
documents, style sentences and run exports, but never: change LAN, speech API or integration
settings, record or build voices, create, import, share or delete voices, install or remove
engines, import web pages (the server would fetch them), change the system, or delete documents.
Those need the person at this computer.
Does NOT belong: Checking tokens or hosts (``security.py``) or pairing (``devices.py``).
"""

from __future__ import annotations

import re

WRITE = {"POST", "PUT", "PATCH", "DELETE"}
PAIRING = {("POST", "/api/lan/pair"), ("GET", "/api/lan/device")}
_EVERY_METHOD = ("/api/lan", "/api/speech-api", "/api/integrations", "/api/voice-sessions", "/api/documents/url")
_WRITES = ("/api/engines", "/api/voice-profiles", "/api/system")
_DOCUMENT = re.compile(r"^/api/documents/[0-9a-f]{32}/?$")
_VOICE_EXPORT = re.compile(r"^/api/voice-profiles/[0-9a-f]{32}/export$")
LOCAL_ONLY = "Do this on the computer running TTSNative."


def _under(path: str, prefixes: tuple[str, ...]) -> bool:
    return any(path == prefix or path.startswith(f"{prefix}/") for prefix in prefixes)


def open_to_unpaired(method: str, path: str) -> bool:
    """The app itself (not the API) and pairing are all a device may reach before it is paired."""
    if (method, path) in PAIRING:
        return True
    api = path.startswith(("/api/", "/v1/")) or path in ("/api", "/docs", "/redoc", "/openapi.json")
    return method in ("GET", "HEAD") and not api


def refused_remotely(method: str, path: str) -> bool:
    """Whether a paired device must do this on the computer instead."""
    if (method, path) in PAIRING:
        return False
    if _under(path, _EVERY_METHOD) or _VOICE_EXPORT.match(path):
        return True
    if method in WRITE and _under(path, _WRITES):
        return True
    return method == "DELETE" and bool(_DOCUMENT.match(path))
