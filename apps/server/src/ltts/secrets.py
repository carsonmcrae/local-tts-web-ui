# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Keep credentials for optional integrations (an Audiobookshelf API key) safely on this computer.

Scope: Stores each secret under ``data/secrets/<name>.bin``. On Windows it is encrypted with DPAPI
for the signed-in user (``CryptProtectData``, no extra dependency), so copying the file to another
account or machine reveals nothing. Elsewhere it is written readable by the owner only (mode 0600).
Secrets are never returned by the API, logged or included in errors; callers only learn whether
one is set.
Does NOT belong: Which integrations exist or how they use their secrets.
"""

from __future__ import annotations

import ctypes
import re
import sys
from pathlib import Path

from ltts.common import new_id

_NAME = re.compile("^[a-z0-9-]{1,40}$")
_UI_FORBIDDEN = 0x01


class _Blob(ctypes.Structure):
    _fields_ = [("size", ctypes.c_uint32), ("data", ctypes.POINTER(ctypes.c_char))]


def _dpapi(data: bytes, *, protect: bool) -> bytes:  # pragma: no cover - Windows only
    from ctypes import windll  # type: ignore[attr-defined, unused-ignore]

    buffer = ctypes.create_string_buffer(data, len(data))
    source = _Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))
    result = _Blob()
    call = windll.crypt32.CryptProtectData if protect else windll.crypt32.CryptUnprotectData
    if not call(ctypes.byref(source), None, None, None, None, _UI_FORBIDDEN, ctypes.byref(result)):
        raise OSError("The secret couldn't be read on this account.")
    try:
        return ctypes.string_at(result.data, result.size)
    finally:
        windll.kernel32.LocalFree(result.data)


class SecretStore:
    def __init__(self, folder: Path):
        self._folder = folder

    def _path(self, name: str) -> Path:
        if not _NAME.match(name):
            raise ValueError("invalid secret name")
        self._folder.mkdir(parents=True, exist_ok=True)
        return self._folder / f"{name}.bin"

    def set(self, name: str, value: str) -> None:
        data = value.encode("utf-8")
        blob = _dpapi(data, protect=True) if sys.platform == "win32" else data
        target = self._path(name)
        temporary = self._folder / f".{new_id()}.tmp"
        temporary.write_bytes(blob)
        if sys.platform != "win32":
            temporary.chmod(0o600)
        temporary.replace(target)

    def get(self, name: str) -> str | None:
        path = self._path(name)
        if not path.is_file():
            return None
        blob = path.read_bytes()
        try:
            data = _dpapi(blob, protect=False) if sys.platform == "win32" else blob
        except OSError:
            return None
        return data.decode("utf-8")

    def has(self, name: str) -> bool:
        return self._path(name).is_file()

    def delete(self, name: str) -> None:
        self._path(name).unlink(missing_ok=True)
