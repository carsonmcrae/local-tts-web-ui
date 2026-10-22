# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the automatic cleanup through the API: import, review, undo, apply and skip by hand.

Scope: Importing a PDF skips its running headers and page numbers and says so in its warnings; the
cleanup report lists the finds; undo reads them again (sentences skipped by hand stay skipped) and
apply skips them again; the styles endpoint skips and reads sentences by hand. Footnote markers
aren't spoken until the cleanup is undone, and the text never changes. Exports leave skipped
sentences out and bring them back once they are read again, and a resumed export makes a saved
sentence again when what it says changed.
Does NOT belong: The detection rules (test_document_cleanup.py) or the reader UI.
"""

from __future__ import annotations

import threading
from typing import Any

from fastapi.testclient import TestClient

from builders import make_pdf
from conftest import FakeEngine, wait_job
from ltts.container import Services
from ltts.documents.cleanup import SUPERSCRIPT_DIGITS
from test_resumable_exports import hook

ONE = SUPERSCRIPT_DIGITS[1]
STORY = [
    "Rain fell over the quiet harbour town all night.",
    "Nobody answered the knock at the door at first.",
    "The lamp in the window flickered twice and went out.",
    "Morning came slowly over the hills behind the farm.",
]
PAGES = [["THE SILENT HARBOUR", line, f"Page {number} of 4"] for number, line in enumerate(STORY, start=1)]
# Each page is its header, its sentence and its page number.
FURNITURE = {index: "header" if index % 3 == 0 else "page_number" for index in range(12) if index % 3 != 1}
WAR = f"The war{ONE} ended in spring."


def harbour(client: TestClient) -> dict[str, Any]:
    response = client.post("/api/documents/upload", params={"filename": "harbour.pdf"}, content=make_pdf(PAGES))
    assert response.status_code == 201
    document: dict[str, Any] = response.json()
    return document


def paste(client: TestClient, text: str) -> str:
    doc_id: str = client.post("/api/documents/text", json={"text": text, "title": "War"}).json()["id"]
    return doc_id


def skips(client: TestClient, doc_id: str) -> dict[int, str]:
    segments = client.get(f"/api/documents/{doc_id}/styles").json()["segments"]
    return {segment["index"]: segment["skip"] for segment in segments if segment["skip"]}


def skip(client: TestClient, doc_id: str, indexes: list[int], value: bool | None) -> None:
    response = client.put(f"/api/documents/{doc_id}/styles", json={"indexes": indexes, "skip": value})
    assert response.status_code == 200


def cleanup(client: TestClient, doc_id: str, action: str | None = None) -> dict[str, Any]:
    url = f"/api/documents/{doc_id}/cleanup"
    report: dict[str, Any] = (client.post(f"{url}/{action}") if action else client.get(url)).json()
    return report


def start_export(client: TestClient, doc_id: str) -> str:
    started = client.post("/api/exports", json={"documentId": doc_id, "voiceId": "kokoro:alpha", "format": "wav"})
    job_id: str = started.json()["id"]
    return job_id


def exported(client: TestClient, engine: FakeEngine, doc_id: str) -> tuple[int, list[str]]:
    """Export the document: how many sentences it holds, and what the engine was asked to say for it."""
    before = len(engine.calls)
    job_id = start_export(client, doc_id)
    assert wait_job(client, job_id)["status"] == "succeeded"
    return client.get(f"/api/exports/{job_id}").json()["sentences"], [call[0] for call in engine.calls[before:]]


def test_an_imported_pdf_skips_its_furniture_and_the_reader_can_undo_it(client: TestClient) -> None:
    document = harbour(client)
    doc_id = document["id"]
    assert skips(client, doc_id) == FURNITURE
    report = cleanup(client, doc_id)
    assert report["notice"] in document["warnings"]
    assert report["notice"] == "Skipped 8 running headers and page numbers when reading aloud; you can review them."
    assert [(item["index"], item["reason"], item["applied"]) for item in report["items"][:3]] == [
        (0, "header", True),
        (2, "page_number", True),
        (3, "header", True),
    ]
    assert (report["items"][1]["text"], report["items"][3]["sectionIndex"]) == ("Page 1 of 4", 1)
    undone = cleanup(client, doc_id, "undo")
    assert not any(item["applied"] for item in undone["items"]) and skips(client, doc_id) == {}
    assert undone["notice"] == report["notice"]  # what was found doesn't change
    assert cleanup(client, doc_id, "apply")["items"] == report["items"]
    assert skips(client, doc_id) == FURNITURE


def test_sentences_are_skipped_and_read_again_by_hand(client: TestClient) -> None:
    doc_id = harbour(client)["id"]
    skip(client, doc_id, [1, 3], True)  # a sentence of the story, and a header the cleanup skipped
    assert {index: skips(client, doc_id)[index] for index in (1, 3)} == {1: "manual", 3: "manual"}
    cleanup(client, doc_id, "undo")
    assert skips(client, doc_id) == {1: "manual", 3: "manual"}  # the reader's own skips outlast the undo
    report = cleanup(client, doc_id)
    assert [item["index"] for item in report["items"] if item["reason"] == "manual"] == [1]
    assert next(item for item in report["items"] if item["index"] == 3) | {"text": ""} == {
        "index": 3, "sectionIndex": 1, "reason": "header", "text": "", "markers": [], "applied": True,
    }  # fmt: skip
    skip(client, doc_id, [1], False)
    skip(client, doc_id, [3], None)
    assert skips(client, doc_id) == {}
    styles = f"/api/documents/{doc_id}/styles"
    assert client.put(styles, json={"indexes": [1], "skip": "header"}).status_code == 422
    assert client.put(styles, json={"indexes": [99], "skip": True}).status_code == 409
    missing = "0" * 32
    assert client.get(f"/api/documents/{missing}/cleanup").status_code == 404
    assert client.post(f"/api/documents/{missing}/cleanup/undo").status_code == 404


def test_footnote_markers_are_not_spoken_until_the_cleanup_is_undone(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    doc_id = paste(client, f"{WAR} Nobody came back.")
    document = client.get(f"/api/documents/{doc_id}").json()
    assert "Skipped 1 footnote marker when reading aloud; you can review it." in document["warnings"]
    report = cleanup(client, doc_id)
    assert [(item["index"], item["reason"], item["markers"], item["applied"]) for item in report["items"]] == [
        (0, "footnote", [ONE], True)
    ]

    def spoken() -> str:
        audio = client.get(f"/api/documents/{doc_id}/segments/0/audio", params={"voice": "kokoro:alpha"})
        assert audio.status_code == 200
        return engines["kokoro"].calls[-1][0]

    assert spoken() == "The war ended in spring."
    cleanup(client, doc_id, "undo")
    assert spoken() == WAR  # a new cache key, so the old audio isn't reused
    cleanup(client, doc_id, "apply")
    assert client.get(f"/api/documents/{doc_id}/sections/0").json()["segments"][0]["text"] == WAR


def test_exports_leave_skipped_sentences_out_and_bring_them_back(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    doc_id = paste(client, "The ferry left at dawn. Nobody came back. The town slept. Morning came.")
    skip(client, doc_id, [1], True)
    sentences, spoken = exported(client, engines["kokoro"], doc_id)
    assert sentences == 3 and spoken == ["The ferry left at dawn.", "The town slept.", "Morning came."]
    skip(client, doc_id, [1], False)
    assert exported(client, engines["kokoro"], doc_id) == (4, ["Nobody came back."])  # the rest is cached


def test_a_resumed_export_makes_a_saved_sentence_again_when_what_it_says_changed(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    doc_id = paste(client, f"{WAR} Nobody came back. The town slept. Morning came.")
    job: dict[str, str] = {}
    started = threading.Event()  # the export can reach its second sentence before its id is known here

    def pause_after_two(n: int, _text: str) -> None:
        if n == 2 and started.wait(10):
            services.exports.pause(job["id"])

    hook(engines["kokoro"], pause_after_two)
    job["id"] = start_export(client, doc_id)
    started.set()
    assert wait_job(client, job["id"])["status"] == "paused"
    cleanup(client, doc_id, "undo")  # the first sentence, saved already, now reads its footnote marker
    skip(client, doc_id, [3], True)  # and the last one is left out
    before = len(engines["kokoro"].calls)
    client.post(f"/api/exports/{job['id']}/resume")
    assert wait_job(client, job["id"])["status"] == "succeeded"
    assert [call[0] for call in engines["kokoro"].calls[before:]] == [WAR, "The town slept."]
    assert client.get(f"/api/exports/{job['id']}").json()["sentences"] == 3
