# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for correcting a document's sections: renaming one and moving where it starts.

Scope: Moving a section's start later and back earlier keeps every sentence in exactly one section,
moves the longer end-of-section pause with the boundary and updates counts; renaming trims the
title; invalid moves (the first section, before the previous start, past the end) and unknown
documents or sections are refused.
Does NOT belong: Automatic chapter detection (test_extractors.py).
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

TEXT = "\n\n".join(
    [
        "Chapter 1",
        "The first chapter opens with a long sentence about the quiet sea at dawn. "
        "It goes on with another long sentence about the harbour lights going out.",
        "Chapter 2",
        "The second chapter begins with a long sentence about the early morning train. "
        "It ends with one more long sentence about the old station clock.",
        "Chapter 3",
        "The third chapter is short but still has a sentence long enough to stand alone.",
    ]
)


def sections(client: TestClient, document_id: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = client.get(f"/api/documents/{document_id}").json()["sections"]
    return result


def segments(client: TestClient, document_id: str, index: int) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = client.get(f"/api/documents/{document_id}/sections/{index}").json()["segments"]
    return result


def error(response: Any) -> str:
    code: str = response.json()["error"]["code"]
    return code


def test_a_section_start_moves_later_and_back_and_the_section_can_be_renamed(client: TestClient) -> None:
    document_id = client.post("/api/documents/text", json={"text": TEXT, "title": "Book"}).json()["id"]
    original = sections(client, document_id)
    second = original[1]
    url = f"/api/documents/{document_id}/sections/1"

    moved = client.patch(url, json={"startSegment": second["startSegment"] + 1, "title": " The Train "})
    assert moved.status_code == 200
    updated = moved.json()["sections"]
    assert updated[1]["title"] == "The Train" and updated[1]["startSegment"] == second["startSegment"] + 1
    assert updated[0]["segmentCount"] == original[0]["segmentCount"] + 1
    assert sum(s["segmentCount"] for s in updated) == sum(s["segmentCount"] for s in original)
    first_part = segments(client, document_id, 0)
    assert first_part[-1]["text"] == "Chapter 2" and first_part[-1]["boundary"] == "section"
    assert first_part[-2]["boundary"] == "paragraph"  # the old end of chapter 1 is an ordinary paragraph end
    assert all(segment["sectionIndex"] == 1 for segment in segments(client, document_id, 1))

    back = client.patch(url, json={"startSegment": second["startSegment"]}).json()["sections"]
    assert [(s["startSegment"], s["segmentCount"]) for s in back] == [
        (s["startSegment"], s["segmentCount"]) for s in original
    ]
    assert segments(client, document_id, 0)[-1]["boundary"] == "section"
    renamed = client.patch(url, json={"title": "Chapter Two", "startSegment": second["startSegment"]}).json()
    assert renamed["sections"][1]["title"] == "Chapter Two"


def test_invalid_section_corrections_are_refused(client: TestClient) -> None:
    document_id = client.post("/api/documents/text", json={"text": TEXT, "title": "Book"}).json()["id"]
    original = sections(client, document_id)
    base = f"/api/documents/{document_id}/sections"
    assert error(client.patch(f"{base}/0", json={"startSegment": 1})) == "invalid_section_start"
    too_early = client.patch(f"{base}/1", json={"startSegment": original[0]["startSegment"]})
    assert too_early.status_code == 409 and error(too_early) == "invalid_section_start"
    past_end = original[1]["startSegment"] + original[1]["segmentCount"]
    assert error(client.patch(f"{base}/1", json={"startSegment": past_end})) == "invalid_section_start"
    assert error(client.patch(f"{base}/9", json={"title": "Nope"})) == "section_not_found"
    missing = "0" * 32
    assert error(client.patch(f"/api/documents/{missing}/sections/0", json={"title": "x"})) == "document_not_found"
    assert client.patch(f"{base}/1", json={"title": ""}).status_code == 422
    assert sections(client, document_id) == original
