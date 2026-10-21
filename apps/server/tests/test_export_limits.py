# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the global limits on background work and what stopping it releases.

Scope: Exports wait their turn in order and say their place, more are refused (from a paired phone
too), and a waiting export pauses or cancels at once; pausing or canceling a running export drops
its queued sentence, records a stop rather than a failure, and tidies or removes its files; only one
studio voice job runs at a time, uploads queue too; on-demand renders are capped per engine (for any
device) with room kept for playback, and abandoned requests don't pile up; an export needs room on
the disk to start, resume and carry on; startup tidies what a crash left, keeps resumable work and
notes the exports left for weeks, and leaves running and recently stopped exports (and files that
aren't an export's folder) alone.
Does NOT belong: Resuming itself (test_resumable_exports.py) or the per-device LAN budget
(test_lan_security.py).
"""

from __future__ import annotations

import errno
import logging
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine, wait_job
from export_support import document, hook, paused_export, request, until
from lan_support import FakeListener, paired
from ltts.common import MB
from ltts.container import Services
from ltts.errors import BusyError
from ltts.exports import capacity
from ltts.exports import service as service_module
from ltts.exports.capacity import UPLOAD_KIND
from ltts.exports.workspace import ExportWorkspace
from ltts.jobs import VOICE_LANE, JobContext, JobStatus
from ltts.synthesis import scheduler as scheduler_module
from ltts.synthesis.scheduler import (
    PRIORITY_EXPORT,
    PRIORITY_PLAYBACK,
    PRIORITY_PREFETCH,
    PRIORITY_PREVIEW,
    EngineScheduler,
    SynthesisQueueFullError,
)
from ltts.voices.sessions import BUILD_JOB
from ltts.voices.studio import STYLES_JOB
from ltts.voices.tuning import TUNE_JOB


def busy(scheduler: EngineScheduler) -> threading.Event:
    """Keep the engine reading something aloud until the returned event is set."""
    done, reading = threading.Event(), threading.Event()
    scheduler.submit("reading", PRIORITY_PLAYBACK, lambda: (reading.set(), done.wait(10)))
    assert reading.wait(5)
    return done


def from_a_phone(client: TestClient, services: Services) -> TestClient:
    services.lan.listener = FakeListener()  # type: ignore[assignment]
    return paired(client, services)


def refused(response: Any, status: int, code: str) -> bool:
    return bool(response.status_code == status and response.json()["error"]["code"] == code)


# -- the export queue ---------------------------------------------------------------------------
def test_exports_wait_their_turn_and_a_full_queue_refuses_more_from_anyone(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    doc_id = document(client)
    gate = threading.Event()
    hook(engines["kokoro"], lambda n, _t: gate.wait(10) if n == 1 else None)
    first = client.post("/api/exports", json=request(doc_id)).json()
    until(lambda: services.jobs.get(first["id"]).status == JobStatus.RUNNING)
    waiting = [client.post("/api/exports", json=request(doc_id, pace=1 + n / 10)).json() for n in range(1, 5)]
    until(lambda: all("ahead" in services.jobs.get(job["id"]).message for job in waiting))
    listed = {item["job"]["id"]: item for item in client.get("/api/exports").json()}
    assert [listed[job["id"]]["queuePosition"] for job in waiting] == [1, 2, 3, 4]
    assert listed[first["id"]]["job"]["status"] == "running" and listed[first["id"]]["queuePosition"] is None
    assert {listed[job["id"]]["job"]["status"] for job in waiting} == {"queued"}
    assert services.jobs.get(waiting[1]["id"]).message == "Waiting its turn (2 exports ahead)…"
    queue = client.get("/api/exports/queue").json()
    assert (queue["running"], queue["waiting"], queue["maxWaiting"], queue["blocked"]) == (1, 4, 4, "queue_full")
    assert refused(client.post("/api/exports", json=request(doc_id)), 429, "export_queue_full")
    phone = from_a_phone(client, services)
    assert refused(phone.post("/api/exports", json=request(doc_id)), 429, "export_queue_full")
    # Waiting exports stop at once (they never reached the engine), and the next ones move up.
    assert client.post(f"/api/exports/{waiting[0]['id']}/pause").status_code == 202
    assert wait_job(client, waiting[0]["id"])["status"] == "paused"
    client.post(f"/api/jobs/{waiting[1]['id']}/cancel")  # the general jobs endpoint stops it the same way
    assert wait_job(client, waiting[1]["id"])["status"] == "canceled"
    until(lambda: services.jobs.get(waiting[2]["id"]).message == "Waiting its turn (1 export ahead)…")
    late = phone.post("/api/exports", json=request(doc_id))
    assert late.status_code == 202  # a place is free again, for anyone
    gate.set()
    for job in [first, *waiting[2:], late.json()]:
        assert wait_job(client, job["id"])["status"] == "succeeded"


def test_pausing_a_running_export_drops_its_queued_sentence_and_records_a_pause(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    scheduler = services.synthesis._scheduler("kokoro")
    done = busy(scheduler)
    started = client.post("/api/exports", json=request(document(client))).json()
    until(lambda: scheduler.pending() == 1)  # its first sentence waits for the engine
    client.post(f"/api/exports/{started['id']}/pause")
    assert wait_job(client, started["id"])["status"] == "paused"  # a stop, not a failure
    done.set()
    scheduler.submit("after", PRIORITY_EXPORT, lambda: None).result(5)
    assert engines["kokoro"].calls == []  # the dropped sentence never reached the engine


def test_a_stop_while_the_audiobook_is_built_tidies_or_removes_its_files(
    client: TestClient, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    stop = {"with": services.exports.pause}

    def assemble(_rows: Any, _audio: Any, folder: Path, _layout: Any, check: Any) -> None:
        (folder / "Trains.wav").write_bytes(b"half-built")
        stop["with"](folder.name)  # the folder is named after the export
        check()
        raise AssertionError("the export should have stopped")

    monkeypatch.setattr(service_module, "assemble", assemble)
    started = client.post("/api/exports", json=request(document(client))).json()
    assert wait_job(client, started["id"])["status"] == "paused"
    folder = services.exports.folder(started["id"])
    assert [path.name for path in folder.iterdir()] == ["parts"]  # the half-built file went, the sentences stay
    assert len(list((folder / "parts").glob("*.flac"))) == 8
    stop["with"] = services.exports.cancel
    client.post(f"/api/exports/{started['id']}/resume")
    assert wait_job(client, started["id"])["status"] == "canceled"
    assert not folder.exists()  # nothing is left once it has stopped


# -- other kinds of job ---------------------------------------------------------------------------
def test_one_studio_voice_job_runs_at_a_time_and_uploads_wait_their_turn(
    client: TestClient, services: Services
) -> None:
    assert {BUILD_JOB, STYLES_JOB, TUNE_JOB} == VOICE_LANE.kinds  # the kinds the voice services start
    release = threading.Event()

    def hold(_ctx: JobContext) -> None:
        release.wait(10)

    build = services.jobs.submit(BUILD_JOB, {}, hold, key="session")
    until(lambda: services.jobs.get(build.id).status == JobStatus.RUNNING)
    with pytest.raises(BusyError) as voice_busy:
        services.jobs.submit(TUNE_JOB, {}, hold, key="voice")
    assert voice_busy.value.code == "voice_job_running" and voice_busy.value.status_code == 429
    assert services.jobs.submit(BUILD_JOB, {}, hold, key="session").id == build.id  # the same build, not refused
    assert client.get("/api/exports/queue").json()["voiceJobRunning"] is True
    exported = client.post("/api/exports", json=request(document(client))).json()  # one export runs beside it
    assert wait_job(client, exported["id"])["status"] == "succeeded"
    uploads = [services.jobs.submit(UPLOAD_KIND, {}, hold, key=str(n)) for n in range(5)]
    with pytest.raises(BusyError) as upload_busy:
        services.jobs.submit(UPLOAD_KIND, {}, hold, key="one too many")
    assert upload_busy.value.code == "upload_queue_full"
    release.set()
    assert all(wait_job(client, job.id)["status"] == "succeeded" for job in [build, *uploads])
    tune = services.jobs.submit(TUNE_JOB, {}, lambda _ctx: None, key="voice")
    assert wait_job(client, tune.id)["status"] == "succeeded"


# -- the engines' on-demand queues ----------------------------------------------------------------
def test_on_demand_renders_are_capped_per_engine_with_room_kept_for_playback() -> None:
    scheduler = EngineScheduler("cap", max_queued=3, reserve=1)
    done = busy(scheduler)
    ahead = scheduler.submit("next", PRIORITY_PREFETCH, lambda: "next")
    scheduler.submit("preview", PRIORITY_PREVIEW, lambda: "preview")
    with pytest.raises(SynthesisQueueFullError) as full:
        scheduler.submit("after next", PRIORITY_PREFETCH, lambda: "after next")
    assert full.value.status_code == 429 and full.value.headers == {"Retry-After": "2"}
    played = scheduler.submit("now", PRIORITY_PLAYBACK, lambda: "now")  # the last place is playback's
    with pytest.raises(SynthesisQueueFullError):
        scheduler.submit("later", PRIORITY_PLAYBACK, lambda: "later")
    assert scheduler.submit("next", PRIORITY_PREFETCH, lambda: "next") is ahead  # joining is never refused
    exported = scheduler.submit("chapter", PRIORITY_EXPORT, lambda: "export")  # bounded by the export queue
    assert scheduler.queued() == 3
    scheduler.release("preview")
    later = scheduler.submit("later", PRIORITY_PLAYBACK, lambda: "later")  # a released place is free again
    done.set()
    assert [future.result(5) for future in (played, later, exported)] == ["now", "later", "export"]


def test_requests_abandoned_while_the_engine_is_busy_dont_pile_up() -> None:
    scheduler = EngineScheduler("abandoned")
    done = busy(scheduler)
    for number in range(500):
        scheduler.submit(f"skipped {number}", PRIORITY_PREFETCH, lambda: None)
        scheduler.release(f"skipped {number}")
    assert scheduler.queued() == 0 and scheduler.pending() <= 70
    done.set()


def test_a_full_engine_queue_refuses_previews_whoever_asks(
    client: TestClient, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(scheduler_module, "MAX_QUEUED", 2)
    monkeypatch.setattr(scheduler_module, "PLAYBACK_RESERVE", 1)
    scheduler = services.synthesis._scheduler("kokoro")
    done = busy(scheduler)
    scheduler.submit("next", PRIORITY_PREFETCH, lambda: None)  # the one place left is playback's
    preview = {"text": "Hello there."}
    answer = client.post("/api/voices/kokoro:alpha/preview", json=preview)
    assert refused(answer, 429, "synthesis_queue_full") and answer.headers["Retry-After"] == "2"
    phone = from_a_phone(client, services)
    assert refused(phone.post("/api/voices/kokoro:alpha/preview", json=preview), 429, "synthesis_queue_full")
    done.set()


# -- disk space ------------------------------------------------------------------------------------
def test_an_export_needs_room_on_the_disk_to_start_resume_and_carry_on(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    reserve, plenty = services.settings.min_free_disk_mb * MB, 100_000 * MB
    free = {"bytes": reserve + 100_000}  # a little over the space the app always keeps free
    monkeypatch.setattr(capacity, "free_space", lambda _folder: free["bytes"])
    doc_id = document(client)
    short = client.post("/api/exports", json=request(doc_id))
    assert refused(short, 507, "insufficient_disk_space")
    assert short.json()["error"]["message"].startswith("Not enough free disk space for this export")
    assert client.get("/api/exports/queue").json()["blocked"] == "low_disk"

    def disk_fills_up(*_args: object) -> None:
        free["bytes"] = reserve - 1
        raise OSError(errno.ENOSPC, "No space left on device")

    free["bytes"] = plenty
    with monkeypatch.context() as patch:
        patch.setattr(ExportWorkspace, "save", disk_fills_up)
        broken = wait_job(client, client.post("/api/exports", json=request(doc_id)).json()["id"])
    assert broken["status"] == "failed" and broken["errorCode"] == "insufficient_disk_space"
    # While an export runs it checks the space every few sentences and stops, resumable, when it runs out.
    free["bytes"] = plenty
    monkeypatch.setattr(capacity, "CHECK_EVERY", 2)
    hook(engines["kokoro"], lambda n, _t: free.update(bytes=reserve - 1) if n == 3 else None)
    started = client.post("/api/exports", json=request(doc_id, pace=1.2)).json()
    stopped = wait_job(client, started["id"])
    assert stopped["status"] == "failed" and stopped["errorCode"] == "insufficient_disk_space"
    assert "press Resume" in stopped["message"]
    assert client.get(f"/api/exports/{started['id']}").json()["savedSentences"] == 4
    assert refused(client.post(f"/api/exports/{started['id']}/resume"), 507, "insufficient_disk_space")
    free["bytes"] = plenty
    client.post(f"/api/exports/{started['id']}/resume")
    assert wait_job(client, started["id"])["status"] == "succeeded"


# -- startup after a crash --------------------------------------------------------------------------
def test_startup_tidies_what_a_crash_left_and_keeps_resumable_work(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], caplog: pytest.LogCaptureFixture
) -> None:
    _, job_id = paused_export(client, services, engines["kokoro"], after=4)
    services.jobs.mark(job_id, JobStatus.INTERRUPTED, "Stopped when the app shut down.")
    weeks_ago = (datetime.now(UTC) - timedelta(days=30)).isoformat(timespec="seconds")
    with services.db.connect() as conn:
        conn.execute("UPDATE jobs SET updated_at = ? WHERE id = ?", (weeks_ago, job_id))
    folder = services.exports.folder(job_id)
    parts = sorted((folder / "parts").glob("*.flac"))
    for leftover in ("parts/.half-saved.tmp", "Trains.wav", "Trains.partial.m4b"):
        (folder / leftover).write_bytes(b"left by the crash")
    finished = wait_job(client, client.post("/api/exports", json=request(document(client))).json()["id"])
    done = services.exports.folder(finished["id"])
    (done / "parts").mkdir()
    (done / "parts" / "000001-0123456789abcdef.flac").write_bytes(b"no longer needed")
    upload = wait_job(client, services.jobs.submit(UPLOAD_KIND, {}, lambda _ctx: None).id)
    for stray in (services.exports.folder("f" * 32), services.exports.folder(upload["id"])):
        stray.mkdir()
        (stray / "cover.png").write_bytes(b"not an export")
    with caplog.at_level(logging.WARNING, logger="ltts.exports"):
        assert services.exports.clean_orphans() == 2  # the unknown folder and the upload's
    assert sorted((folder / "parts").glob("*.flac")) == parts and [p.name for p in folder.iterdir()] == ["parts"]
    assert not (folder / "parts" / ".half-saved.tmp").exists()
    assert [p.name for p in done.iterdir()] == ["Trains.wav"]  # the finished file stays
    noted = [record for record in caplog.records if record.name == "ltts.exports"]
    assert [record.exports for record in noted] == [1]  # type: ignore[attr-defined]
    listed = {item["job"]["id"]: item for item in client.get("/api/exports").json()}
    assert listed[job_id]["stale"] is True and listed[finished["id"]]["stale"] is False
    client.post(f"/api/exports/{job_id}/resume")
    assert wait_job(client, job_id)["status"] == "succeeded"


def test_startup_leaves_running_and_recently_stopped_exports_alone(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], caplog: pytest.LogCaptureFixture
) -> None:
    doc_id, paused = paused_export(client, services, engines["kokoro"], after=2)  # stopped just now: not stale
    root = services.settings.resolved_data_dir / "exports"
    (root / "notes.txt").write_text("not an export's folder", encoding="utf-8")
    release = threading.Event()
    hook(engines["kokoro"], lambda n, _t: release.wait(5) if n == 2 else None)
    running = client.post("/api/exports", json=request(doc_id, pace=1.3)).json()
    until(lambda: client.get(f"/api/exports/{running['id']}").json()["savedSentences"] == 1)
    with caplog.at_level(logging.WARNING, logger="ltts.exports"):
        assert services.exports.clean_orphans() == 0
    assert not [record for record in caplog.records if record.name == "ltts.exports"]  # nothing stale to note
    assert (root / "notes.txt").is_file() and services.exports.folder(running["id"]).is_dir()
    assert len(list((services.exports.folder(paused) / "parts").glob("*.flac"))) == 2  # kept for a resume
    release.set()
    assert wait_job(client, running["id"])["status"] == "succeeded"
