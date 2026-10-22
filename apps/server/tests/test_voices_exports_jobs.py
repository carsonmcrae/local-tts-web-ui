# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for voice profiles, quality checks, exports and background jobs.

Scope: Reference-quality analysis (pass, too short, too quiet, clipping, noisy), profile creation
with/without consent and permanent deletion (files, cache, progress references), custom voice
synthesis routing to the cloning engine with the reference file, exports (WAV, MP3, per-chapter ZIP,
range, resume) and job failure/cancel/recovery semantics, including the job manager's guards: a job the
database refuses frees its lane place, a restart keeps one place and the new stop switch, a failing
cleanup is logged, and a running job can't be forgotten.
Does NOT belong: Real cloning inference (test_inference.py).
"""

from __future__ import annotations

import io
import logging
import sqlite3
import threading
import time
import zipfile

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import FakeEngine, speech_like, wait_job, wav_bytes
from export_support import until
from ltts.container import Services
from ltts.errors import AppError, ConflictError
from ltts.exports.capacity import EXPORT_LANE, KIND
from ltts.jobs import JobContext, JobManager, JobStatus
from ltts.voices.quality import analyze


def test_quality_analysis_rules() -> None:
    rate = 24_000
    assert analyze(speech_like(12), rate).ok
    codes = lambda s: {i.code for i in analyze(s, rate).issues if i.severity == "error"}  # noqa: E731
    assert "too_short" in codes(speech_like(3))
    assert "too_quiet" in codes(speech_like(12, level=0.004, noise=0.0))
    assert "clipping" in codes(np.clip(speech_like(12, level=3.0), -1, 1))
    assert "noisy" in codes(speech_like(12, level=0.05, noise=0.05))


def test_profile_lifecycle(client: TestClient, services: Services, engines: dict[str, FakeEngine]) -> None:
    data = wav_bytes(speech_like(12))
    denied = client.post("/api/voice-profiles", params={"name": "Me", "consent": "false"}, content=data)
    assert denied.status_code == 409 and denied.json()["error"]["code"] == "consent_required"

    profile = client.post(
        "/api/voice-profiles", params={"name": "Me", "consent": "true", "source": "recording"}, content=data
    ).json()
    assert profile["voiceId"] == f"custom:{profile['id']}" and "No model is trained" in profile["stores"]
    assert client.get(f"/api/voice-profiles/{profile['id']}/reference").headers["content-type"] == "audio/wav"
    assert any(v["id"] == profile["voiceId"] for v in client.get("/api/voices").json())

    preview = client.post(f"/api/voices/{profile['voiceId']}/preview", json={"text": "Hello in my voice."})
    assert preview.status_code == 200
    _text, key, _, reference = engines["chatterbox"].calls[-1]
    assert key == f"profile:{profile['id']}" and reference is not None and reference.name == "reference.wav"

    doc = client.post("/api/documents/text", json={"text": "Progress here."}).json()
    client.put(f"/api/documents/{doc['id']}/progress", json={"segmentIndex": 0, "voiceId": profile["voiceId"]})
    assert client.delete(f"/api/voice-profiles/{profile['id']}").status_code == 204
    assert not (services.voices.root / profile["id"]).exists()
    assert services.audio_cache.stats()["entries"] == 0  # generated audio purged
    assert client.get("/api/documents").json()[0]["progress"]["voiceId"] is None
    assert client.post(f"/api/voices/{profile['voiceId']}/preview", json={}).status_code == 404


def test_profile_rejects_bad_audio(client: TestClient) -> None:
    short = client.post(
        "/api/voice-profiles", params={"name": "x", "consent": "true"}, content=wav_bytes(speech_like(2))
    )
    assert short.status_code == 422 and short.json()["error"]["code"] == "reference_quality"
    garbage = client.post("/api/voice-profiles", params={"name": "x", "consent": "true"}, content=b"not audio at all")
    assert garbage.json()["error"]["code"] == "unsupported_audio"
    checked = client.post("/api/voice-profiles/analyze", content=wav_bytes(speech_like(12))).json()
    assert checked["report"]["ok"] is True and checked["report"]["speechS"] > 6 and checked["suggested"] is None


def test_export_formats_and_chapters(client: TestClient) -> None:
    doc = client.post("/api/documents/text", json={"text": "Chapter 1\n\nOne. Two.\n\nChapter 2\n\nThree."}).json()
    for fmt in ("wav", "mp3"):
        job = wait_job(
            client,
            client.post(
                "/api/exports", json={"documentId": doc["id"], "voiceId": "kokoro:alpha", "format": fmt}
            ).json()["id"],
        )
        assert job["status"] == "succeeded", job
        download = client.get(f"/api/exports/{job['id']}/download")
        assert download.status_code == 200 and "attachment" in download.headers["content-disposition"]
        audio, rate = sf.read(io.BytesIO(download.content))
        assert rate == 24_000 and len(audio) / rate > 1.0

    chapters = wait_job(
        client,
        client.post(
            "/api/exports",
            json={"documentId": doc["id"], "voiceId": "kokoro:alpha", "format": "wav", "layout": "chapters"},
        ).json()["id"],
    )
    names = zipfile.ZipFile(io.BytesIO(client.get(f"/api/exports/{chapters['id']}/download").content)).namelist()
    assert sorted(names)[:2] == ["01 - Chapter 1.wav", "02 - Chapter 2.wav"] and any(n.endswith(".m3u") for n in names)

    ranged = wait_job(
        client,
        client.post(
            "/api/exports",
            json={
                "documentId": doc["id"],
                "voiceId": "kokoro:alpha",
                "format": "wav",
                "firstSection": 1,
                "lastSection": 1,
            },
        ).json()["id"],
    )
    assert ranged["status"] == "succeeded" and ranged["result"]["durationS"] < chapters["result"]["durationS"]


def test_export_resume_reuses_cached_audio(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    doc = client.post("/api/documents/text", json={"text": "Alpha. Beta. Gamma."}).json()
    body = {"documentId": doc["id"], "voiceId": "kokoro:alpha", "format": "wav"}
    first = wait_job(client, client.post("/api/exports", json=body).json()["id"])
    calls = len(engines["kokoro"].calls)
    assert client.post(f"/api/exports/{first['id']}/resume").status_code == 409  # only stopped exports resume
    second = wait_job(client, client.post("/api/exports", json=body).json()["id"])
    assert second["status"] == "succeeded" and len(engines["kokoro"].calls) == calls  # all from cache


def test_jobs_fail_cancel_and_recover(services: Services) -> None:
    jobs: JobManager = services.jobs

    def boom(_ctx):  # type: ignore[no-untyped-def]
        raise AppError("Nope.", code="custom_failure")

    failed = jobs.submit("test", {}, boom)
    for _ in range(100):
        if jobs.get(failed.id).status == JobStatus.FAILED:
            break
        time.sleep(0.02)
    assert jobs.get(failed.id).error_code == "custom_failure"

    def slow(ctx):  # type: ignore[no-untyped-def]
        while True:
            ctx.check()
            time.sleep(0.01)

    running = jobs.submit("test", {}, slow, key="k")
    assert jobs.submit("test", {}, slow, key="k").id == running.id  # de-duplicated
    jobs.cancel(running.id)
    for _ in range(100):
        if jobs.get(running.id).status == JobStatus.CANCELED:
            break
        time.sleep(0.02)
    assert jobs.get(running.id).status == JobStatus.CANCELED

    with services.db.connect() as conn:
        conn.execute("UPDATE jobs SET status = 'running' WHERE id = ?", (failed.id,))
    assert jobs.recover() == 1 and jobs.get(failed.id).status == JobStatus.INTERRUPTED


def test_a_job_the_database_refuses_frees_its_place_and_a_running_one_cannot_be_forgotten(
    services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    jobs: JobManager = services.jobs

    def refuse() -> None:
        raise sqlite3.OperationalError("database is locked")

    with monkeypatch.context() as patch:
        patch.setattr(services.db, "connect", refuse)
        with pytest.raises(sqlite3.OperationalError):
            jobs.submit(KIND, {}, lambda _ctx: None)
    assert jobs.occupancy(EXPORT_LANE) == (0, 0)  # its place in the export lane is free again
    release = threading.Event()

    def hold(ctx: JobContext) -> None:
        release.wait(5)
        ctx.check()

    running = jobs.submit(KIND, {}, hold)
    until(lambda: jobs.get(running.id).status == JobStatus.RUNNING)
    with pytest.raises(ConflictError) as busy:
        jobs.forget(running.id)
    assert busy.value.code == "job_running"
    assert jobs.restart(running.id, lambda _ctx: None).status == JobStatus.RUNNING  # only a stopped job restarts
    release.set()
    until(lambda: jobs.get(running.id).status == JobStatus.SUCCEEDED)
    jobs.forget(running.id)
    assert all(job.id != running.id for job in jobs.list_recent())


def test_a_job_restarted_while_its_last_run_still_finishes_keeps_one_place_and_the_new_stop_switch(
    services: Services,
) -> None:
    """After an unclean recovery a job can show as interrupted while its thread is still finishing."""
    jobs: JobManager = services.jobs
    release_first, second_started = threading.Event(), threading.Event()

    def first(_ctx: JobContext) -> None:
        release_first.wait(5)

    def second(ctx: JobContext) -> None:
        second_started.set()
        while True:
            ctx.check()
            time.sleep(0.01)

    job = jobs.submit(KIND, {}, first)
    until(lambda: jobs.get(job.id).status == JobStatus.RUNNING)
    assert jobs.recover() == 1  # as at start-up: the run looks interrupted, though its thread is alive
    assert jobs.restart(job.id, second).status in (JobStatus.QUEUED, JobStatus.RUNNING)
    assert second_started.wait(5) and jobs.occupancy(EXPORT_LANE) == (1, 0)  # both runs share the one place
    release_first.set()
    until(lambda: jobs.get(job.id).status == JobStatus.SUCCEEDED)  # the first run wrote its ending
    jobs.cancel(job.id)  # reaches the run that is still going
    until(lambda: jobs.get(job.id).status == JobStatus.CANCELED)
    assert jobs.occupancy(EXPORT_LANE) == (0, 0)


def test_a_cleanup_that_fails_after_a_cancel_is_logged_and_the_job_still_ends(
    services: Services, caplog: pytest.LogCaptureFixture
) -> None:
    jobs: JobManager = services.jobs

    def broken_cleanup(_job_id: str) -> None:
        raise OSError("folder in use")

    jobs.when_canceled("tidy", broken_cleanup)

    def wait_to_be_stopped(ctx: JobContext) -> None:
        while True:
            ctx.check()
            time.sleep(0.01)

    job = jobs.submit("tidy", {}, wait_to_be_stopped)
    with caplog.at_level(logging.WARNING, logger="ltts.jobs"):
        jobs.cancel(job.id)
        until(lambda: jobs.get(job.id).status == JobStatus.CANCELED)
    assert any(record.getMessage() == "cleanup after a cancel failed" for record in caplog.records)
