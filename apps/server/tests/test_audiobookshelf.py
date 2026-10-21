# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the optional Audiobookshelf integration and the secret store behind it.

Scope: The API key is saved encrypted (or owner-only), never returned or sent to anyone but the
configured server; settings validate the address; "test connection" lists libraries and folders;
sending a finished M4B uploads it with its cover, title and author through a background job; a ZIP
is refused; refused keys, redirects and unreachable servers fail with clear messages and never echo
the key; forgetting removes the key.
Does NOT belong: Building the audiobook (test_audiobook_formats.py).
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from conftest import wait_job
from ltts.container import Services
from ltts.secrets import SecretStore

KEY = "abs-test-key-0123456789"
PNG = bytes.fromhex("89504e470d0a1a0a") + b"\x00" * 32


def test_the_secret_store_never_keeps_plain_text_on_windows(tmp_path: Path) -> None:
    store = SecretStore(tmp_path / "secrets")
    store.set("demo", KEY)
    assert store.get("demo") == KEY and store.has("demo")
    raw = (tmp_path / "secrets" / "demo.bin").read_bytes()
    if sys.platform == "win32":
        assert KEY.encode() not in raw  # DPAPI-encrypted for this account
    store.delete("demo")
    assert store.get("demo") is None and not store.has("demo")
    with pytest.raises(ValueError, match="invalid"):
        store.set("../escape", "x")


class FakeShelf:
    """A stand-in Audiobookshelf server that records what it received."""

    def __init__(self, status: int = 200):
        self.status = status
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.status != 200:
            return httpx.Response(self.status)
        if request.url.path == "/api/libraries":
            folder = {"id": "fol_1", "fullPath": "/audiobooks"}
            return httpx.Response(200, json={"libraries": [{"id": "lib_1", "name": "Books", "folders": [folder]}]})
        return httpx.Response(200)


@pytest.fixture
def shelf(services: Services) -> FakeShelf:
    fake = FakeShelf()
    services.audiobookshelf._transport = httpx.MockTransport(fake)
    return fake


def configure(client: TestClient, **extra: Any) -> Any:
    body = {"url": "http://192.168.1.20:13378/", "apiKey": KEY, "libraryId": "lib_1", "folderId": "fol_1", **extra}
    return client.put("/api/integrations/audiobookshelf", json=body)


def test_settings_keep_the_key_secret(client: TestClient, shelf: FakeShelf) -> None:
    assert client.get("/api/integrations/audiobookshelf").json()["configured"] is False
    saved = configure(client).json()
    assert saved == {"configured": True, "url": "http://192.168.1.20:13378", "libraryId": "lib_1",
                     "folderId": "fol_1", "hasKey": True}  # fmt: skip
    assert KEY not in client.get("/api/integrations/audiobookshelf").text
    assert configure(client, url="ftp://server/").json()["error"]["code"] == "invalid_url"
    assert configure(client, url="http://user:pass@server/").json()["error"]["code"] == "invalid_url"
    libraries = client.post("/api/integrations/audiobookshelf/test").json()
    assert libraries == [{"id": "lib_1", "name": "Books", "folders": [{"id": "fol_1", "path": "/audiobooks"}]}]
    assert shelf.requests[-1].headers["authorization"] == f"Bearer {KEY}"
    assert str(shelf.requests[-1].url) == "http://192.168.1.20:13378/api/libraries"
    assert configure(client, apiKey=None).json()["hasKey"] is True  # leaving the key out keeps it
    assert client.delete("/api/integrations/audiobookshelf").status_code == 204
    assert client.get("/api/integrations/audiobookshelf").json() == {"configured": False, "url": None,
                                                                     "libraryId": None, "folderId": None,
                                                                     "hasKey": False}  # fmt: skip


def finished_export(client: TestClient, fmt: str, monkeypatch: pytest.MonkeyPatch) -> tuple[str, str]:
    doc_id = client.post("/api/documents/text", json={"text": "One. Two.", "title": "Short"}).json()["id"]
    client.put(f"/api/documents/{doc_id}/details", json={"author": "A. Writer"})
    client.put(f"/api/documents/{doc_id}/cover", content=PNG)
    job = wait_job(client, client.post("/api/exports", json={"documentId": doc_id, "voiceId": "kokoro:alpha",
                                                            "format": fmt}).json()["id"])  # fmt: skip
    assert job["status"] == "succeeded"
    return job["id"], doc_id


def test_sending_a_finished_export_uploads_it_with_its_cover(
    client: TestClient, shelf: FakeShelf, monkeypatch: pytest.MonkeyPatch
) -> None:
    configure(client)
    export_id, _ = finished_export(client, "mp3", monkeypatch)
    sent = client.post(f"/api/exports/{export_id}/audiobookshelf").json()
    assert wait_job(client, sent["id"])["status"] == "succeeded"
    upload = shelf.requests[-1]
    assert upload.url.path == "/api/upload" and upload.method == "POST"
    body = upload.read()
    for field in (b'name="title"', b"Short", b'name="author"', b"A. Writer", b"lib_1", b"fol_1",
                  b'filename="Short.mp3"', b'filename="cover.png"'):  # fmt: skip
        assert field in body


def test_failures_are_clear_and_never_echo_the_key(
    client: TestClient, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    configure(client)
    for status, words in [(401, "refused the API key"), (302, "redirected"), (500, "error (500)")]:
        services.audiobookshelf._transport = httpx.MockTransport(FakeShelf(status))
        response = client.post("/api/integrations/audiobookshelf/test")
        assert response.status_code == 502 and words in response.json()["error"]["message"]
        assert KEY not in response.text

    def unreachable(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route")

    services.audiobookshelf._transport = httpx.MockTransport(unreachable)
    assert "Couldn't reach" in client.post("/api/integrations/audiobookshelf/test").json()["error"]["message"]
    export_id, _ = finished_export(client, "wav", monkeypatch)
    client.put("/api/integrations/audiobookshelf", json={"url": "http://192.168.1.20:13378"})  # no folder chosen
    assert client.post(f"/api/exports/{export_id}/audiobookshelf").json()["error"]["code"] == "audiobookshelf_folder"


def test_only_single_audio_files_can_be_sent(client: TestClient, shelf: FakeShelf) -> None:
    configure(client)
    doc_id = client.post("/api/documents/text", json={"text": "One. Two.", "title": "Short"}).json()["id"]
    body = {"documentId": doc_id, "voiceId": "kokoro:alpha", "format": "mp3", "captions": True}
    job = wait_job(client, client.post("/api/exports", json=body).json()["id"])
    assert client.post(f"/api/exports/{job['id']}/audiobookshelf").json()["error"]["code"] == "audiobookshelf_format"
    assert client.post("/api/integrations/audiobookshelf/test").status_code == 200


def test_sending_needs_setting_up_first(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    export_id, _ = finished_export(client, "mp3", monkeypatch)
    sent = client.post(f"/api/exports/{export_id}/audiobookshelf")
    assert sent.status_code == 409 and sent.json()["error"]["code"] == "audiobookshelf_not_set_up"
