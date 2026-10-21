# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for importing pasted text with speech marks turned on.

Scope: Marks become sentence annotations (voices found by name or id, pauses, effects, sounds,
pronunciations used by synthesis), lines holding only a mark attach to the right sentence, the stored
text and section titles never contain a mark, unknown marks are reported as document warnings, and
text pasted without speech marks keeps its braces.
Does NOT belong: Reading marks themselves (``test_speech_marks.py``).
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from conftest import FakeEngine

MARKED = """Chapter One {sound laugh}

The bell rang. {pause 2s} Nobody moved.
{voice Alpha}
"Who's there?" asked Kael.
{/voice}
{effect radio}Come in, base.{/effect} {say Kael = Kay-el}Kael waited. {bogus}"""


def paste(client: TestClient, text: str, *, marks: bool = True) -> Any:
    return client.post("/api/documents/text", json={"text": text, "title": "Marked", "speechMarks": marks}).json()


def sentences(client: TestClient, doc_id: str) -> list[str]:
    content = client.get(f"/api/documents/{doc_id}/sections/0").json()
    return [segment["text"] for segment in content["segments"]]


def styles(client: TestClient, doc_id: str) -> dict[int, dict[str, Any]]:
    found = client.get(f"/api/documents/{doc_id}/styles").json()["segments"]
    return {s["index"]: {k: v for k, v in s.items() if v is not None and k != "index"} for s in found}


def test_marks_become_annotations_and_never_reach_the_text(client: TestClient) -> None:
    doc = paste(client, MARKED)
    assert sentences(client, doc["id"]) == [
        "Chapter One",
        "The bell rang.",
        "Nobody moved.",
        '"Who\'s there?" asked Kael.',
        "Come in, base.",
        "Kael waited.",
        "{bogus}",
    ]
    untitled = client.post("/api/documents/text", json={"text": MARKED, "speechMarks": True}).json()
    assert untitled["title"] == "Chapter One"  # the first sentence, without its mark
    assert styles(client, doc["id"]) == {
        0: {"sound": "laugh"},
        1: {"pauseMs": 2000},
        3: {"voiceId": "kokoro:alpha"},  # found by its name
        4: {"effect": "radio"},
    }
    assert doc["warnings"] == ["Speech mark '{bogus}' was left as text: it isn't a speech mark."]


def test_a_pronunciation_mark_is_used_when_the_sentence_is_read(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    doc = paste(client, "{say Kael = Kay-el}Kael waited. Then Kael left.")
    audio = client.get(f"/api/documents/{doc['id']}/segments/1/audio", params={"voice": "kokoro:alpha"})
    assert audio.status_code == 200
    assert "Kay-el" in engines["kokoro"].calls[-1][0]


def test_a_voice_that_does_not_exist_is_a_warning(client: TestClient) -> None:
    doc = paste(client, "{voice Nobody}Hello there.{/voice} {voice chatterbox:alpha}Hi.{/voice}")
    assert styles(client, doc["id"]) == {1: {"voiceId": "chatterbox:alpha"}}
    assert doc["warnings"] == ["Speech marks: there is no voice called 'Nobody', so the reading voice is used."]


def test_text_pasted_without_speech_marks_keeps_its_braces(client: TestClient) -> None:
    doc = paste(client, "Keep {pause 2s} as it is.", marks=False)
    assert sentences(client, doc["id"]) == ["Keep {pause 2s} as it is."]
    assert styles(client, doc["id"]) == {}
    assert doc["warnings"] == []


def test_text_that_is_only_marks_is_refused(client: TestClient) -> None:
    response = client.post("/api/documents/text", json={"text": "{pause 2s} {sound laugh}", "speechMarks": True})
    assert response.json()["error"]["code"] == "empty_document"
