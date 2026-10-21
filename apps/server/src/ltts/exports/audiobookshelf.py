# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Optionally send a finished audiobook to the user's own Audiobookshelf server.

Scope: Keeps the server address, library and folder in ``integrations`` and the API key in the
secret store (never returned, logged or put in an error). "Test connection" lists the libraries and
folders the key can see. Sending uploads the finished audio file (and the cover, as Audiobookshelf
expects, as ``cover.jpg``/``cover.png``) with the title and author through ``POST /api/upload``, as
a background job. Requests go only to the configured server, with no redirects, no proxy or netrc
from the environment, and timeouts. Ordinary exports never depend on any of this.
Does NOT belong: Building the audiobook (``service.py``) or storing secrets (``ltts.secrets``).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx
from pydantic import Field

from ltts.common import ApiModel
from ltts.db import Database
from ltts.errors import AppError, ConflictError
from ltts.secrets import SecretStore

log = logging.getLogger("ltts.audiobookshelf")
SECRET_NAME = "audiobookshelf-key"  # noqa: S105 - the name the key is stored under, not the key
NAME = "audiobookshelf"
TIMEOUT = httpx.Timeout(20.0, read=600.0, write=600.0)  # an hour-long book is a large upload


class IntegrationError(AppError):
    status_code = 502
    code = "audiobookshelf_error"


class AbsSettingsIn(ApiModel):
    url: str = Field(min_length=8, max_length=300)
    api_key: str | None = Field(default=None, min_length=8, max_length=4_000)  # None keeps the saved key
    library_id: str | None = Field(default=None, max_length=100, pattern=r"^[A-Za-z0-9_\-]+$")
    folder_id: str | None = Field(default=None, max_length=100, pattern=r"^[A-Za-z0-9_\-]+$")


class AbsSettingsOut(ApiModel):
    configured: bool
    url: str | None = None
    library_id: str | None = None
    folder_id: str | None = None
    has_key: bool = False


class AbsFolder(ApiModel):
    id: str
    path: str


class AbsLibrary(ApiModel):
    id: str
    name: str
    folders: list[AbsFolder]


def _base(url: str) -> str:
    parts = urlsplit(url.strip())
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
        raise ConflictError("Enter the server's address, such as http://192.168.1.20:13378.", code="invalid_url")
    return f"{parts.scheme}://{parts.netloc}{parts.path.rstrip('/')}"


class Audiobookshelf:
    def __init__(self, db: Database, secrets: SecretStore, transport: httpx.BaseTransport | None = None):
        self._db = db
        self._secrets = secrets
        self._transport = transport  # tests replace the network

    def settings(self) -> AbsSettingsOut:
        with self._db.connect() as conn:
            row = conn.execute("SELECT config_json FROM integrations WHERE name = ?", (NAME,)).fetchone()
        if row is None:
            return AbsSettingsOut(configured=False, has_key=self._secrets.has(SECRET_NAME))
        config = json.loads(row["config_json"])
        return AbsSettingsOut(configured=True, has_key=self._secrets.has(SECRET_NAME), **config)

    def save(self, update: AbsSettingsIn) -> AbsSettingsOut:
        config = {"url": _base(update.url), "library_id": update.library_id, "folder_id": update.folder_id}
        if update.api_key:
            self._secrets.set(SECRET_NAME, update.api_key.strip())
        with self._db.connect() as conn:
            conn.execute(
                "INSERT INTO integrations (name, config_json) VALUES (?, ?) "
                "ON CONFLICT(name) DO UPDATE SET config_json = excluded.config_json",
                (NAME, json.dumps(config)),
            )
        return self.settings()

    def forget(self) -> None:
        self._secrets.delete(SECRET_NAME)
        with self._db.connect() as conn:
            conn.execute("DELETE FROM integrations WHERE name = ?", (NAME,))

    def _client(self) -> tuple[httpx.Client, str]:
        current = self.settings()
        key = self._secrets.get(SECRET_NAME)
        if not current.configured or not current.url or not key:
            raise ConflictError("Set up Audiobookshelf in Settings first.", code="audiobookshelf_not_set_up")
        client = httpx.Client(
            base_url=current.url,
            headers={"Authorization": f"Bearer {key}"},
            timeout=TIMEOUT,
            follow_redirects=False,
            trust_env=False,
            transport=self._transport,
        )
        return client, current.url

    def libraries(self) -> list[AbsLibrary]:
        """The libraries and folders the key can upload to (also tests the connection)."""
        client, url = self._client()
        with client:
            data = self._json(client, "GET", "/api/libraries", url)
        raw = data.get("libraries", data) if isinstance(data, dict) else data
        libraries: list[AbsLibrary] = []
        for item in raw if isinstance(raw, list) else []:
            folders = [
                AbsFolder(id=str(f.get("id", "")), path=str(f.get("fullPath", "")))
                for f in item.get("folders", []) if isinstance(f, dict)
            ]  # fmt: skip
            libraries.append(AbsLibrary(id=str(item.get("id", "")), name=str(item.get("name", "")), folders=folders))
        return libraries

    def ready(self) -> None:
        """Raise a clear error unless an address, a key, a library and a folder are all set."""
        current = self.settings()
        if not current.configured or not current.has_key:
            raise ConflictError("Set up Audiobookshelf in Settings first.", code="audiobookshelf_not_set_up")
        if not current.library_id or not current.folder_id:
            raise ConflictError(
                "Choose the Audiobookshelf library and folder in Settings.", code="audiobookshelf_folder"
            )

    def upload(self, files: list[Path], title: str, author: str | None) -> None:
        self.ready()
        current = self.settings()
        client, url = self._client()
        fields = {"title": title, "author": author or "", "library": current.library_id, "folder": current.folder_id}
        handles = [path.open("rb") for path in files]
        try:
            uploads = [
                (str(n), (path.name, handle)) for n, (path, handle) in enumerate(zip(files, handles, strict=True))
            ]
            with client:
                self._json(client, "POST", "/api/upload", url, data=fields, files=uploads)
        finally:
            for handle in handles:
                handle.close()
        log.info("sent to audiobookshelf", extra={"files": len(files)})

    @staticmethod
    def _json(client: httpx.Client, method: str, path: str, url: str, **kwargs: Any) -> Any:
        try:
            response = client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise IntegrationError(f"Couldn't reach Audiobookshelf at {url}. Check the address.") from exc
        if response.status_code in (401, 403):
            raise IntegrationError("Audiobookshelf refused the API key, or it can't upload to that library.")
        if response.status_code in (301, 302, 303, 307, 308):
            raise IntegrationError("Audiobookshelf redirected the request. Use the server's exact address.")
        if response.status_code >= 400:
            raise IntegrationError(f"Audiobookshelf answered with an error ({response.status_code}).")
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError:
            return {}
