# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for exports that survive pauses, crashes, failures and edits.

Scope: Pausing keeps saved sentences and resuming under the same job generates only the rest; an
export interrupted by a crash resumes the same way; a sentence whose styling changed is generated
again; a failing sentence fails the export and a retry carries on from it; canceling discards the
saved sentences as soon as it stops; deleting a running export is refused; only one export runs at
a time; the export list reports saved sentences and copes with what went missing (another kind of job,
a removed file, a document that is gone); and a wait abandoned without a stop fails the export.
Does NOT belong: The output formats (test_audiobook_formats.py).
"""

from __future__ import annotations

import threading
import time
from types import SimpleNamespace
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from conftest import SAMPLE_RATE, FakeEngine, wait_job
from export_support import document, hook, pause_after_saving, paused_export, request
from ltts.container import Services
from ltts.engines.base import AudioClip, VoiceSpec
from ltts.errors import NotFoundError
from ltts.exports.capacity import UPLOAD_KIND
from ltts.jobs import JobStatus


def test_a_paused_export_resumes_with_only_the_missing_sentences(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    doc_id = document(client)
    announce = pause_after_saving(monkeypatch, services, 3)
    started = client.post("/api/exports", json=request(doc_id)).json()
    announce(started["id"])
    paused = wait_job(client, started["id"])
    assert paused["status"] == "paused"
    described = client.get(f"/api/exports/{started['id']}").json()
    assert described["savedSentences"] == 3 and described["sentences"] == 8 and described["workingBytes"] > 0
    before = len(engines["kokoro"].calls)
    resumed = client.post(f"/api/exports/{started['id']}/resume").json()
    assert resumed["id"] == started["id"]  # the same job carries on
    done = wait_job(client, started["id"])
    assert done["status"] == "succeeded" and done["result"]["filename"] == "Trains.wav"
    assert len(engines["kokoro"].calls) - before == 5  # only the five sentences that weren't saved
    assert "kept from before" in done["message"] or done["message"] == "Done"
    assert not (services.exports.folder(started["id"]) / "parts").exists()  # parts go once the file exists
    assert client.get(f"/api/exports/{started['id']}/download").status_code == 200


def test_an_interrupted_export_resumes_after_a_restart(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    _, job_id = paused_export(client, services, monkeypatch, after=4)
    services.jobs.mark(job_id, JobStatus.INTERRUPTED, "Stopped when the app shut down.")  # as after a crash
    assert client.get("/api/exports").json()[0]["job"]["status"] == "interrupted"
    before = len(engines["kokoro"].calls)
    client.post(f"/api/exports/{job_id}/resume")
    assert wait_job(client, job_id)["status"] == "succeeded"
    assert len(engines["kokoro"].calls) - before == 4


def test_a_restyled_sentence_is_generated_again_on_resume(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    doc_id, job_id = paused_export(client, services, monkeypatch, after=3)
    client.put(f"/api/documents/{doc_id}/styles", json={"indexes": [1], "effect": "radio"})  # a saved sentence
    before = len(engines["kokoro"].calls)
    client.post(f"/api/exports/{job_id}/resume")
    assert wait_job(client, job_id)["status"] == "succeeded"
    assert len(engines["kokoro"].calls) - before == 6  # the five missing sentences and the restyled one


def test_a_failing_sentence_fails_the_export_and_a_retry_carries_on(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    doc_id = document(client)
    failures = {"left": 1}

    def fail_once(_n: int, text: str) -> None:
        if "theory" in text and failures["left"]:
            failures["left"] -= 1
            raise RuntimeError("engine crashed")

    hook(engines["kokoro"], fail_once)
    started = client.post("/api/exports", json=request(doc_id)).json()
    failed = wait_job(client, started["id"])
    assert failed["status"] == "failed"
    saved = client.get(f"/api/exports/{started['id']}").json()["savedSentences"]
    assert saved == 6  # everything before the failing sentence is kept (two headings, four sentences)
    client.post(f"/api/exports/{started['id']}/resume")
    assert wait_job(client, started["id"])["status"] == "succeeded"


def test_cancel_discards_saved_sentences_and_delete_waits_for_a_stop(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    doc_id = document(client)
    release = threading.Event()
    hook(engines["kokoro"], lambda n, _t: release.wait(5) if n == 2 else None)
    started = client.post("/api/exports", json=request(doc_id)).json()
    for _ in range(100):
        if client.get(f"/api/exports/{started['id']}").json()["savedSentences"] == 1:
            break
        time.sleep(0.02)
    assert client.delete(f"/api/exports/{started['id']}").json()["error"]["code"] == "export_running"
    client.post(f"/api/exports/{started['id']}/cancel")
    release.set()
    assert wait_job(client, started["id"])["status"] == "canceled"
    assert client.get(f"/api/exports/{started['id']}").json()["savedSentences"] == 0
    assert not services.exports.folder(started["id"]).exists()  # its folder went as soon as it stopped
    paused = client.post("/api/exports", json=request(doc_id)).json()
    services.exports.pause(paused["id"])
    wait_job(client, paused["id"])
    assert client.post(f"/api/exports/{paused['id']}/cancel").json()["status"] == "canceled"
    assert client.delete(f"/api/exports/{paused['id']}").status_code == 204  # gone from the list too
    assert paused["id"] not in [item["job"]["id"] for item in client.get("/api/exports").json()]
    assert client.post(f"/api/exports/{'0' * 32}/resume").status_code == 404


def test_only_one_export_synthesises_at_a_time(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    doc_id = document(client)
    active = {"now": 0, "most": 0}
    lock = threading.Lock()
    original = engines["kokoro"].synthesize

    def synthesize(text: str, voice: VoiceSpec, pace: float) -> AudioClip:
        with lock:
            active["now"] += 1
            active["most"] = max(active["most"], active["now"])
        time.sleep(0.01)
        with lock:
            active["now"] -= 1
        return original(text, voice, pace)

    engines["kokoro"].synthesize = synthesize  # type: ignore[method-assign]
    jobs = [client.post("/api/exports", json=request(doc_id, pace=pace)).json() for pace in (1.0, 1.1)]
    assert all(wait_job(client, job["id"])["status"] == "succeeded" for job in jobs)
    assert active["most"] == 1


@pytest.mark.parametrize("samples", [np.zeros(SAMPLE_RATE // 10, dtype=np.float32)])
def test_parts_are_atomic_and_keyed(tmp_path: Any, samples: np.ndarray) -> None:
    from ltts.exports.workspace import ExportWorkspace

    workspace = ExportWorkspace(tmp_path / "job")
    workspace.save(7, "a" * 64, samples, SAMPLE_RATE)
    workspace.save(7, "b" * 64, samples, SAMPLE_RATE)  # a newer version replaces the old one
    assert workspace.existing() == {7: "b" * 16}
    assert workspace.has(7, "b" * 64) and not workspace.has(7, "a" * 64)
    assert workspace.part(7, "b" * 64).seconds == pytest.approx(0.1)
    used = workspace.bytes_used()

    class Vanishing:
        """A file a running export removed between being listed and being measured."""

        def is_file(self) -> bool:
            return True

        def stat(self) -> Any:
            raise FileNotFoundError

    kept = workspace.part(7, "b" * 64).path
    folder = workspace.folder
    workspace.folder = SimpleNamespace(is_dir=lambda: True, rglob=lambda _pattern: [kept, Vanishing()])  # type: ignore[assignment]
    assert workspace.bytes_used() == used > 0
    workspace.folder = folder
    (workspace.parts_dir / "junk.txt").write_text("x")
    other_digits = "\N{ARABIC-INDIC DIGIT EIGHT}" * 6  # digits, but not the ASCII ones this module writes
    (workspace.parts_dir / f"{other_digits}-{'c' * 16}.flac").write_text("x")
    assert workspace.existing() == {7: "b" * 16}  # unrelated files are ignored
    workspace.remove()
    assert workspace.existing() == {} and workspace.bytes_used() == 0


def test_the_list_and_download_cope_with_exports_whose_pieces_went_missing(
    client: TestClient, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    doc_id = document(client)
    upload = wait_job(client, services.jobs.submit(UPLOAD_KIND, {}, lambda _ctx: None).id)
    other = client.get(f"/api/exports/{upload['id']}")  # another kind of job isn't an export
    assert other.status_code == 404 and other.json()["error"]["code"] == "export_not_found"
    done = wait_job(client, client.post("/api/exports", json=request(doc_id)).json()["id"])
    assert client.post(f"/api/exports/{done['id']}/cancel").json()["status"] == "succeeded"  # nothing to cancel
    (services.exports.folder(done["id"]) / done["result"]["filename"]).unlink()
    missing = client.get(f"/api/exports/{done['id']}/download")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "export_missing"

    def refused(_document_id: str) -> list[Any]:
        raise NotFoundError("That document doesn't exist.", code="document_not_found")

    assert client.delete(f"/api/documents/{doc_id}").status_code == 204
    monkeypatch.setattr(services.document_repo, "all_segments", refused)  # a repository that refuses what is gone
    listed = {item["job"]["id"]: item for item in client.get("/api/exports").json()}
    assert listed[done["id"]]["sentences"] == 0 and listed[done["id"]]["title"] == "Trains"


def test_a_wait_abandoned_without_a_stop_fails_the_export(
    client: TestClient, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    def abandoned(*_args: Any, **_kwargs: Any) -> Any:
        raise TimeoutError

    monkeypatch.setattr(services.synthesis, "render_blocking", abandoned)
    failed = wait_job(client, client.post("/api/exports", json=request(document(client))).json()["id"])
    assert failed["status"] == "failed" and failed["errorCode"] == "internal_error"
