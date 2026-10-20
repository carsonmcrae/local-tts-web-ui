# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP-level tests for documents, audio, voices, jobs, preferences and system endpoints.

Scope: Uploads of every supported format through the real raw-body endpoint, validation errors and
limits, library/detail/section/progress/delete, segment audio and previews (fake engine), engine
listing/installation/updates, preferences round-trip, health/system info and cache clearing.
Does NOT belong: Middleware security tests (test_security.py) or real inference.
"""

from __future__ import annotations

import io
import time
from pathlib import Path
from typing import Any

import soundfile as sf
from fastapi.testclient import TestClient

from builders import make_docx, make_epub, make_pdf
from conftest import FakeEngine
from ltts.config import Settings


def upload(client: TestClient, name: str, data: bytes):  # type: ignore[no-untyped-def]
    return client.post("/api/documents/upload", params={"filename": name}, content=data)


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok", "version": "2.0.0"}


def test_upload_each_format_and_read_back(client: TestClient, tmp_path: Path) -> None:
    files = {
        "story.txt": b"Chapter 1\n\nOnce upon a time. The end.",
        "notes.md": b"# Notes\n\nA *short* note.",
        "paper.pdf": make_pdf([["A real PDF sentence lives here."]]),
        "letter.docx": make_docx(
            tmp_path / "l.docx", [("Heading 1", "Dear reader"), ("Normal", "Thanks for listening.")]
        ).read_bytes(),
        "book.epub": make_epub([("One", "<p>EPUB text is here.</p>")]),
    }
    for name, data in files.items():
        response = upload(client, name, data)
        assert response.status_code == 201, (name, response.text)
        detail = response.json()
        assert detail["segmentCount"] > 0 and detail["sections"], name
        section = client.get(f"/api/documents/{detail['id']}/sections/0").json()
        assert section["segments"][0]["text"], name
    assert len(client.get("/api/documents").json()) == len(files)


def test_upload_errors_are_specific(client: TestClient) -> None:
    assert upload(client, "virus.exe", b"MZ").json()["error"]["code"] == "unsupported_file_type"
    assert upload(client, "fake.pdf", b"hello").json()["error"]["code"] == "content_mismatch"
    scanned = upload(client, "scan.pdf", make_pdf([[]], image_only=True))
    assert scanned.status_code == 422 and scanned.json()["error"]["code"] == "scanned_pdf"


def test_upload_size_limit_is_enforced_server_side(settings: Settings, engines: dict[str, FakeEngine]) -> None:
    from ltts.app import create_app
    from ltts.container import build_services

    small = settings.model_copy(update={"max_upload_mb": 1})
    services = build_services(small, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines.values()))
    with TestClient(create_app(small, services=services), headers={"X-LTTS-Client": "web"}) as client:
        response = upload(client, "big.txt", b"a" * (1024 * 1024 + 10))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"
    assert not list((settings.resolved_data_dir / "tmp").glob("*.upload"))


def test_paste_progress_and_delete(client: TestClient) -> None:
    doc = client.post(
        "/api/documents/text", json={"text": "First sentence. Second one. Third.", "title": "Pasted"}
    ).json()
    assert doc["title"] == "Pasted" and doc["segmentCount"] == 3
    assert (
        client.put(
            f"/api/documents/{doc['id']}/progress", json={"segmentIndex": 2, "voiceId": "kokoro:alpha"}
        ).status_code
        == 204
    )
    listed = client.get("/api/documents").json()[0]
    assert listed["progress"]["segmentIndex"] == 2 and listed["progress"]["percent"] == 100.0
    assert client.delete(f"/api/documents/{doc['id']}").status_code == 204
    assert client.get(f"/api/documents/{doc['id']}").status_code == 404


def test_invalid_ids_and_bodies_are_rejected(client: TestClient) -> None:
    assert client.get("/api/documents/not-a-hex-id").status_code == 422
    assert client.post("/api/documents/text", json={"text": ""}).status_code == 422
    assert client.put("/api/preferences", json={"unknownKey": 1}).status_code == 422


def test_segment_audio_is_cached_and_keyed_by_voice_and_pace(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    doc = client.post("/api/documents/text", json={"text": "Hello there. General Kenobi."}).json()
    url = f"/api/documents/{doc['id']}/segments/0/audio"
    first = client.get(url, params={"voice": "kokoro:alpha"})
    assert first.status_code == 200 and first.headers["content-type"] == "audio/wav"
    assert float(first.headers["x-audio-duration"]) > 0.2
    data, rate = sf.read(io.BytesIO(first.content))
    assert rate == 24_000 and len(data) > 0
    client.get(url, params={"voice": "kokoro:alpha"})
    assert len(engines["kokoro"].calls) == 1  # second request served from cache
    client.get(url, params={"voice": "kokoro:alpha", "pace": 1.25})
    assert len(engines["kokoro"].calls) == 2  # pace change invalidates
    assert client.get(url, params={"voice": "kokoro:missing"}).json()["error"]["code"] == "voice_not_found"
    assert (
        client.get(f"/api/documents/{doc['id']}/segments/99/audio", params={"voice": "kokoro:alpha"}).status_code == 404
    )


def test_uninstalled_engine_reports_actionable_error(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    engines["kokoro"].ready = False
    doc = client.post("/api/documents/text", json={"text": "Hi."}).json()
    response = client.get(f"/api/documents/{doc['id']}/segments/0/audio", params={"voice": "kokoro:alpha"})
    assert response.status_code == 503 and response.json()["error"]["code"] == "engine_not_installed"


def test_voice_preview_and_listing(client: TestClient) -> None:
    voices = client.get("/api/voices").json()
    assert {v["id"] for v in voices} >= {"kokoro:alpha", "chatterbox:alpha"}
    preview = client.post("/api/voices/kokoro:alpha/preview", json={"text": "Short preview."})
    assert preview.status_code == 200 and preview.headers["content-type"] == "audio/wav"
    assert client.post("/api/voices/kokoro:alpha/preview", json={"text": "x" * 500}).status_code == 422


def test_engine_install_job_runs(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    engines["chatterbox"].ready = False
    job = client.post("/api/engines/chatterbox/install", json={"option": "cpu"}).json()
    for _ in range(50):
        state = client.get(f"/api/jobs/{job['id']}").json()
        if state["status"] == "succeeded":
            break
        time.sleep(0.05)
    assert state["status"] == "succeeded" and state["result"] == {"option": "cpu"}
    assert next(e for e in client.get("/api/engines").json() if e["id"] == "chatterbox")["status"] == "ready"


def test_engine_update_job_runs_only_when_offered(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    def chatterbox() -> dict[str, Any]:
        return next(e for e in client.get("/api/engines").json() if e["id"] == "chatterbox")

    assert chatterbox()["updateAvailable"] is False
    refused = client.post("/api/engines/chatterbox/update")
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "no_update"
    engines["chatterbox"].update_available = True
    assert chatterbox()["updateAvailable"] is True
    job = client.post("/api/engines/chatterbox/update").json()
    assert job["kind"] == "install" and job["payload"]["update"] is True
    for _ in range(50):
        state = client.get(f"/api/jobs/{job['id']}").json()
        if state["status"] == "succeeded":
            break
        time.sleep(0.05)
    assert state["status"] == "succeeded" and chatterbox()["updateAvailable"] is False


def test_preferences_round_trip(client: TestClient) -> None:
    prefs = client.get("/api/preferences").json()
    assert prefs["defaultVoiceId"] == "kokoro:af_heart"
    updated = {**prefs, "playbackRate": 1.5, "exportFormat": "wav"}
    assert client.put("/api/preferences", json=updated).json()["playbackRate"] == 1.5
    assert client.get("/api/preferences").json()["exportFormat"] == "wav"


def test_system_info_and_cache_clear(client: TestClient) -> None:
    doc = client.post("/api/documents/text", json={"text": "Cache me."}).json()
    client.get(f"/api/documents/{doc['id']}/segments/0/audio", params={"voice": "kokoro:alpha"})
    info = client.get("/api/system").json()
    assert info["telemetry"] is False and info["networkExposed"] is False
    assert info["storage"]["audioCacheBytes"] > 0
    assert client.post("/api/system/cache/clear").json()["removedEntries"] == 1


def test_document_limit(settings: Settings, engines: dict[str, FakeEngine]) -> None:
    from ltts.app import create_app
    from ltts.container import build_services

    limited = settings.model_copy(update={"max_documents": 1})
    services = build_services(limited, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines.values()))
    with TestClient(create_app(limited, services=services), headers={"X-LTTS-Client": "web"}) as client:
        assert client.post("/api/documents/text", json={"text": "One."}).status_code == 201
        second = client.post("/api/documents/text", json={"text": "Two."})
    assert second.status_code == 409 and second.json()["error"]["code"] == "document_limit"


def test_audio_is_playable_from_a_direct_url(client: TestClient) -> None:
    preview = client.post("/api/voices/kokoro:alpha/preview", json={"text": "Direct URL check."})
    url = preview.headers["x-audio-url"]
    assert url.startswith("/api/audio/") and len(url.rsplit("/", 1)[1]) == 64
    direct = client.get(url)
    assert direct.status_code == 200 and direct.content == preview.content
    partial = client.get(url, headers={"Range": "bytes=0-99"})
    assert partial.status_code == 206 and len(partial.content) == 100  # media elements use ranges
    assert client.get("/api/audio/" + "0" * 64).json()["error"]["code"] == "audio_not_cached"
