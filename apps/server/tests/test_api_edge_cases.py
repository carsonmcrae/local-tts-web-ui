# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP-level tests for error paths and less common routes across the API.

Scope: Missing documents, sections and jobs; engine uninstall and the guards while an install job
runs; unknown engines and custom voices without a profile store; unexpected job failures; export
resume, readiness, removal and empty ranges; Voice Studio consent, listing, renaming, format,
length and count limits and a missing reference recording; storage totals; listeners who leave
before audio is ready; and the security middleware's loopback and body-size helpers.
Does NOT belong: Happy-path flows (test_api.py, test_voices_exports_jobs.py) or Host/CSRF/token
checks (test_security.py).
"""

from __future__ import annotations

import asyncio
import threading
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine, speech_like, wait_job, wav_bytes
from ltts.app import create_app
from ltts.config import Settings
from ltts.container import Services, build_services
from ltts.engines.registry import EngineRegistry
from ltts.errors import NotFoundError
from ltts.jobs import JobCanceledError, JobContext
from ltts.security import _is_loopback, _limited
from ltts.synthesis.service import ClientGoneError

MISSING_ID = "f" * 32


def custom_client(settings: Settings, engines: list[FakeEngine], **overrides: Any) -> TestClient:
    custom = settings.model_copy(update=overrides)
    services = build_services(custom, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines))
    return TestClient(create_app(custom, services=services), headers={"X-LTTS-Client": "web"})


def test_missing_documents_sections_and_jobs_are_404(client: TestClient) -> None:
    assert client.get(f"/api/documents/{MISSING_ID}/sections/0").json()["error"]["code"] == "section_not_found"
    assert client.delete(f"/api/documents/{MISSING_ID}").json()["error"]["code"] == "document_not_found"
    progress = client.put(f"/api/documents/{MISSING_ID}/progress", json={"segmentIndex": 0})
    assert progress.status_code == 404 and progress.json()["error"]["code"] == "document_not_found"
    assert client.get(f"/api/jobs/{MISSING_ID}").json()["error"]["code"] == "job_not_found"
    assert client.post("/api/engines/nosuch/install", json={}).json()["error"]["code"] == "engine_not_found"


def test_uninstalling_an_engine_clears_generated_audio(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    doc = client.post("/api/documents/text", json={"text": "Cached words."}).json()
    client.get(f"/api/documents/{doc['id']}/segments/0/audio", params={"voice": "kokoro:alpha"})
    assert client.delete("/api/engines/kokoro").status_code == 204
    assert engines["kokoro"].ready is False
    assert client.get("/api/system").json()["storage"]["audioCacheBytes"] == 0


class SlowInstall(FakeEngine):
    def __init__(self, engine_id: str) -> None:
        super().__init__(engine_id, ready=False)
        self.release = threading.Event()

    def install(self, context: JobContext, option: str | None) -> dict[str, Any]:
        self.release.wait(10)
        return super().install(context, option)


@pytest.fixture
def slow_engine(settings: Settings) -> Iterator[tuple[TestClient, SlowInstall]]:
    engine = SlowInstall("chatterbox")
    with custom_client(settings, [FakeEngine("kokoro"), engine]) as client:
        yield client, engine
        engine.release.set()


def test_a_running_install_shows_and_guards_the_engine(slow_engine: tuple[TestClient, SlowInstall]) -> None:
    client, engine = slow_engine
    job = client.post("/api/engines/chatterbox/install", json={"option": "cpu"}).json()
    info = next(e for e in client.get("/api/engines").json() if e["id"] == "chatterbox")
    assert info["status"] == "installing" and info["installJobId"] == job["id"]
    assert client.post("/api/engines/chatterbox/update").json()["id"] == job["id"]  # the running job is reused
    refused = client.delete("/api/engines/chatterbox")
    assert refused.status_code == 503 and refused.json()["error"]["code"] == "install_running"
    assert any(j["id"] == job["id"] for j in client.get("/api/jobs").json())
    engine.release.set()
    assert wait_job(client, job["id"])["status"] == "succeeded"
    assert client.post(f"/api/jobs/{job['id']}/cancel").json()["status"] == "succeeded"  # too late to cancel


def test_registry_without_custom_voices(services: Services) -> None:
    registry = EngineRegistry([FakeEngine("kokoro")], services.jobs)
    assert [v.id for v in registry.voices()] == ["kokoro:alpha"]
    with pytest.raises(NotFoundError) as error:
        registry.resolve("custom:abc")
    assert error.value.code == "voice_not_found"


def test_unexpected_job_errors_are_recorded_safely(client: TestClient, services: Services) -> None:
    def broken(_ctx: JobContext) -> None:
        raise RuntimeError("disk on fire")

    job = wait_job(client, services.jobs.submit("test", {}, broken).id)
    assert job["status"] == "failed" and job["errorCode"] == "internal_error"
    assert job["message"] == "The job failed unexpectedly."


def test_export_resume_readiness_removal_and_empty_ranges(client: TestClient, services: Services) -> None:
    doc = client.post("/api/documents/text", json={"text": "One. Two."}).json()
    body = {"documentId": doc["id"], "voiceId": "kokoro:alpha", "format": "wav"}

    def canceled(_ctx: JobContext) -> None:
        raise JobCanceledError

    stopped = wait_job(client, services.jobs.submit("export", body, canceled).id)
    assert stopped["status"] == "canceled"
    assert client.get(f"/api/exports/{stopped['id']}/download").json()["error"]["code"] == "export_not_ready"
    resumed = client.post(f"/api/exports/{stopped['id']}/resume")
    assert resumed.status_code == 202 and resumed.json()["id"] == stopped["id"]  # the same export carries on
    finished = wait_job(client, resumed.json()["id"])
    assert finished["status"] == "succeeded"
    assert client.get(f"/api/exports/{finished['id']}/download").status_code == 200
    assert client.post(f"/api/exports/{finished['id']}/resume").json()["error"]["code"] == "not_resumable"
    assert client.delete(f"/api/exports/{finished['id']}").status_code == 204
    assert client.get(f"/api/exports/{finished['id']}/download").json()["error"]["code"] == "export_missing"

    empty = wait_job(client, client.post("/api/exports", json={**body, "firstSection": 5}).json()["id"])
    assert empty["status"] == "failed" and empty["errorCode"] == "empty_export"


def test_voice_studio_consent_listing_and_renaming(client: TestClient) -> None:
    statement = client.get("/api/voice-profiles/consent").json()["statement"]
    assert "explicit permission" in statement and "parent's or guardian's" in statement and "estate's" in statement
    assert "pass generated speech off as a real recording" in statement
    params = {"name": "Narrator", "consent": "true"}
    profile = client.post("/api/voice-profiles", params=params, content=wav_bytes(speech_like(12))).json()
    renamed = client.patch(f"/api/voice-profiles/{profile['id']}", json={"name": "  Storyteller  "})
    assert renamed.json()["name"] == "Storyteller"
    assert [p["name"] for p in client.get("/api/voice-profiles").json()] == ["Storyteller"]
    missing = client.patch(f"/api/voice-profiles/{MISSING_ID}", json={"name": "Ghost"})
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "voice_not_found"


def test_voice_recordings_must_fit_format_length_and_count_limits(settings: Settings) -> None:
    with custom_client(settings, [FakeEngine("chatterbox", cloning=True)], max_voice_profiles=1) as client:
        params = {"name": "Me", "consent": "true"}
        low_rate = client.post(
            "/api/voice-profiles", params=params, content=wav_bytes(speech_like(4, rate=8_000), 8_000)
        )
        assert low_rate.json()["error"]["code"] == "unsupported_audio"
        too_long = client.post(
            "/api/voice-profiles", params=params, content=wav_bytes(speech_like(61, rate=16_000), 16_000)
        )
        assert too_long.json()["error"]["code"] == "too_long"
        assert client.post("/api/voice-profiles", params=params, content=wav_bytes(speech_like(12))).status_code == 201
        limit = client.post("/api/voice-profiles", params=params, content=wav_bytes(speech_like(12)))
        assert limit.status_code == 409 and limit.json()["error"]["code"] == "voice_limit"


def test_a_profile_whose_recording_is_missing_cannot_speak(client: TestClient, services: Services) -> None:
    params = {"name": "Me", "consent": "true"}
    profile = client.post("/api/voice-profiles", params=params, content=wav_bytes(speech_like(12))).json()
    services.voices.reference_path(profile["id"]).unlink()
    preview = client.post(f"/api/voices/{profile['voiceId']}/preview", json={"text": "Hello."})
    assert preview.status_code == 404 and preview.json()["error"]["code"] == "voice_not_found"


def test_storage_totals_count_model_files(client: TestClient, settings: Settings) -> None:
    models = settings.resolved_models_dir / "kokoro-v1.0"
    models.mkdir(parents=True)
    (models / "weights.bin").write_bytes(b"0" * 2_048)
    assert client.get("/api/system").json()["storage"]["modelsBytes"] == 2_048


def test_listeners_who_leave_get_no_audio(
    client: TestClient, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def gone(*_: object) -> None:
        raise ClientGoneError

    monkeypatch.setattr(services.synthesis, "segment_audio", gone)
    monkeypatch.setattr(services.synthesis, "render", gone)
    doc = client.post("/api/documents/text", json={"text": "Hello."}).json()
    assert (
        client.get(f"/api/documents/{doc['id']}/segments/0/audio", params={"voice": "kokoro:alpha"}).status_code == 499
    )
    assert client.post("/api/voices/kokoro:alpha/preview", json={}).status_code == 499


@pytest.mark.parametrize(
    ("host", "loopback"),
    [(None, False), ("", False), ("127.0.0.1", True), ("::1", True), ("localhost", True), ("example.org", False)],
)
def test_loopback_client_detection(host: str | None, loopback: bool) -> None:
    assert _is_loopback(host) is loopback


def test_request_bodies_over_the_limit_are_cut_off() -> None:
    messages = iter(
        [
            {"type": "http.request", "body": b"x" * 10, "more_body": True},
            {"type": "http.disconnect"},
            {"type": "http.request", "body": b"y" * 10},
        ]
    )

    async def receive() -> dict[str, Any]:
        return next(messages)

    async def drain() -> list[str]:
        limited = _limited(receive, 15)
        return [(await limited())["type"] for _ in range(3)]

    assert asyncio.run(drain()) == ["http.request", "http.disconnect", "http.disconnect"]
