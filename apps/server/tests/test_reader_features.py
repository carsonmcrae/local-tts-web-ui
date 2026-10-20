# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for the reader's study and listening aids: pronunciations, bookmarks, search, subtitles.

Scope: The pronunciation dictionary (whole words, any case or exact case, longest phrase first,
duplicates and limits refused, rules applied to what the engine is asked to say and to the audio
cache key); bookmarks with notes (add, re-bookmark updates the note, edit, delete, reading order,
limits, deleted with their document); searching a document's sentences in any letter case; exports
with sentence-timed subtitles and tags describing only the document; and the API's licence metadata.
Does NOT belong: Section corrections (test_document_sections.py) or export basics
(test_voices_exports_jobs.py).
"""

from __future__ import annotations

import io
import zipfile
from typing import Any

import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import FakeEngine, wait_job
from ltts.container import Services
from ltts.documents import bookmarks
from ltts.exports.service import srt_time
from ltts.pronunciation import store
from ltts.pronunciation.store import PronunciationIn, PronunciationOut, compile_rules

TEXT = "\n\n".join(
    [
        "Chapter 1",
        "Kael walked to the harbour with Dr. Reyes. The KAEL family crest hung above the gate.",
        "Chapter 2",
        "Nobody in Élan-Vale had ever seen the café open so early in the morning.",
    ]
)


def error(response: Any) -> str:
    code: str = response.json()["error"]["code"]
    return code


def document(client: TestClient) -> str:
    doc_id: str = client.post("/api/documents/text", json={"text": TEXT, "title": "Wardens"}).json()["id"]
    return doc_id


def rule(word: str, say_as: str, match_case: bool = False) -> PronunciationOut:
    return PronunciationOut(id="x", word=word, say_as=say_as, match_case=match_case, created_at="now")


def test_pronunciation_rules_match_whole_words_and_respect_case() -> None:
    apply = compile_rules(
        [
            rule("Kael", "Kale"),
            rule("Dr.", "Doctor"),
            rule("New York", "New Yawk"),
            rule("New", "Gnu"),
            rule("US", "U S", match_case=True),
        ]
    )
    assert apply("Kael and KAEL met Dr. Reyes.") == "Kale and Kale met Doctor Reyes."
    assert apply("Kaelin stayed.") == "Kaelin stayed."  # whole words only
    assert apply("New York is new.") == "New Yawk is Gnu."  # the longer phrase wins
    assert apply("The US and us.") == "The U S and us."  # exact case only for that rule
    assert compile_rules([])("unchanged") == "unchanged"


def test_the_dictionary_api_and_its_limits(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    created = client.post("/api/pronunciations", json={"word": "  Kael ", "sayAs": "Kale"})
    assert created.status_code == 201 and created.json()["word"] == "Kael" and not created.json()["matchCase"]
    rule_id = created.json()["id"]
    assert error(client.post("/api/pronunciations", json={"word": "kael", "sayAs": "Kayl"})) == "pronunciation_exists"
    exact = client.post("/api/pronunciations", json={"word": "US", "sayAs": "U S", "matchCase": True})
    other = client.post("/api/pronunciations", json={"word": "us", "sayAs": "uss", "matchCase": True})
    assert exact.status_code == 201 and other.status_code == 201  # different exact-case words
    assert client.post("/api/pronunciations", json={"word": "   ", "sayAs": "x"}).status_code == 422
    assert client.post("/api/pronunciations", json={"word": "a", "sayAs": "b", "regex": True}).status_code == 422

    updated = client.put(f"/api/pronunciations/{rule_id}", json={"word": "Kael", "sayAs": "Kayl"})
    assert updated.json()["sayAs"] == "Kayl"
    clash = client.put(f"/api/pronunciations/{exact.json()['id']}", json={"word": "KAEL", "sayAs": "x"})
    assert error(clash) == "pronunciation_exists"
    assert [r["word"] for r in client.get("/api/pronunciations").json()] == ["Kael", "US", "us"]
    assert client.delete(f"/api/pronunciations/{other.json()['id']}").status_code == 204
    missing = "0" * 32
    assert error(client.delete(f"/api/pronunciations/{missing}")) == "pronunciation_not_found"
    assert error(client.put(f"/api/pronunciations/{missing}", json={"word": "a", "sayAs": "b"})) == (
        "pronunciation_not_found"
    )
    monkeypatch.setattr(store, "MAX_RULES", 2)
    assert error(client.post("/api/pronunciations", json={"word": "Reyes", "sayAs": "Ray-es"})) == (
        "pronunciation_limit"
    )


def test_pronunciations_change_what_is_spoken_and_regenerate_only_affected_audio(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    doc_id = document(client)
    voice = {"voice": "kokoro:alpha"}

    def speak(index: int) -> str:
        assert client.get(f"/api/documents/{doc_id}/segments/{index}/audio", params=voice).status_code == 200
        return engines["kokoro"].calls[-1][0]

    assert "Kael" in speak(1)
    before = len(engines["kokoro"].calls)
    services.pronunciations.create(PronunciationIn(word="Kael", say_as="Kale"))
    assert "Kale" in speak(1) and "Kael" not in engines["kokoro"].calls[-1][0]
    assert len(engines["kokoro"].calls) == before + 1  # new text: new audio
    speak(4)
    count = len(engines["kokoro"].calls)
    client.get(f"/api/documents/{doc_id}/segments/4/audio", params=voice)
    assert len(engines["kokoro"].calls) == count  # untouched sentences stay cached
    preview = client.post("/api/voices/kokoro:alpha/preview", json={"text": "Kael."})
    assert preview.status_code == 200 and engines["kokoro"].calls[-1][0].startswith("Kale")


def test_bookmarks_with_notes(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    doc_id = document(client)
    base = f"/api/documents/{doc_id}/bookmarks"
    first = client.post(base, json={"segmentIndex": 4, "note": "  Check this name "})
    assert first.status_code == 201
    mark = first.json()
    assert mark["note"] == "Check this name" and mark["sectionIndex"] == 1 and "Élan-Vale" in mark["text"]
    client.post(base, json={"segmentIndex": 1})
    again = client.post(base, json={"segmentIndex": 4, "note": "Renamed"}).json()
    assert again["id"] == mark["id"] and again["note"] == "Renamed"  # one bookmark per sentence
    listed = client.get(base).json()
    assert [b["segmentIndex"] for b in listed] == [1, 4]  # reading order

    edited = client.patch(f"{base}/{mark['id']}", json={"note": "Final"}).json()
    assert edited["note"] == "Final"
    assert client.delete(f"{base}/{mark['id']}").status_code == 204
    assert error(client.delete(f"{base}/{mark['id']}")) == "bookmark_not_found"
    assert error(client.patch(f"{base}/{mark['id']}", json={"note": "x"})) == "bookmark_not_found"
    assert error(client.post(base, json={"segmentIndex": 999})) == "segment_not_found"
    assert client.post(base, json={"segmentIndex": 2, "note": "x" * 2001}).status_code == 422
    missing = f"/api/documents/{'0' * 32}/bookmarks"
    assert error(client.get(missing)) == "document_not_found"
    assert error(client.post(missing, json={"segmentIndex": 0})) == "document_not_found"

    monkeypatch.setattr(bookmarks, "MAX_BOOKMARKS", 1)
    assert error(client.post(base, json={"segmentIndex": 2})) == "bookmark_limit"
    assert client.delete(f"/api/documents/{doc_id}").status_code == 204
    assert error(client.get(base)) == "document_not_found"


def test_searching_a_document(client: TestClient) -> None:
    doc_id = document(client)
    url = f"/api/documents/{doc_id}/search"
    found = client.get(url, params={"q": "kael"}).json()
    assert found["total"] == 2 and [h["segmentIndex"] for h in found["hits"]] == [1, 2]
    assert found["hits"][0]["sectionIndex"] == 0 and found["query"] == "kael"
    accented = client.get(url, params={"q": "ÉLAN-vale  had"}).json()  # any case, spacing tidied
    assert accented["total"] == 1 and accented["hits"][0]["sectionIndex"] == 1
    assert client.get(url, params={"q": "dragon"}).json() == {"query": "dragon", "total": 0, "hits": []}
    assert client.get(url, params={"q": ""}).status_code == 422
    assert error(client.get(f"/api/documents/{'0' * 32}/search", params={"q": "x"})) == "document_not_found"


def test_search_reports_the_total_beyond_the_hits_returned(services: Services, client: TestClient) -> None:
    doc_id = document(client)
    results = services.document_repo.search(doc_id, "the", limit=1)
    assert results.total > 1 and len(results.hits) == 1


def test_exports_carry_subtitles_and_tags(client: TestClient) -> None:
    doc_id = document(client)
    request = {"documentId": doc_id, "voiceId": "kokoro:alpha", "format": "wav", "captions": True}
    job = wait_job(client, client.post("/api/exports", json=request).json()["id"])
    assert job["status"] == "succeeded" and job["result"]["filename"].endswith("(WAV with subtitles).zip")
    archive = zipfile.ZipFile(io.BytesIO(client.get(f"/api/exports/{job['id']}/download").content))
    names = sorted(archive.namelist())
    assert names == ["Wardens.srt", "Wardens.wav"]
    subtitles = archive.read("Wardens.srt").decode("utf-8")
    assert subtitles.startswith("1\r\n00:00:00,000 --> ") and "Kael walked to the harbour" in subtitles
    assert subtitles.count(" --> ") == 5
    with sf.SoundFile(io.BytesIO(archive.read("Wardens.wav"))) as audio:
        tags = audio.copy_metadata()
    assert tags["title"] == "Wardens" and tags["album"] == "Wardens"
    assert "comment" not in tags and "Local TTS" not in tags.get("software", "")  # no branding in exports

    chapters = wait_job(
        client, client.post("/api/exports", json={**request, "format": "mp3", "layout": "chapters"}).json()["id"]
    )
    archive = zipfile.ZipFile(io.BytesIO(client.get(f"/api/exports/{chapters['id']}/download").content))
    names = sorted(archive.namelist())
    assert names == [
        "01 - Chapter 1.mp3",
        "01 - Chapter 1.srt",
        "02 - Chapter 2.mp3",
        "02 - Chapter 2.srt",
        "Wardens.m3u",
    ]
    with sf.SoundFile(io.BytesIO(archive.read("02 - Chapter 2.mp3"))) as audio:
        tags = audio.copy_metadata()
    assert tags["title"] == "Chapter 2" and tags["album"] == "Wardens" and tags["tracknumber"] == "2"


def test_subtitle_timestamps() -> None:
    assert srt_time(0) == "00:00:00,000"
    assert srt_time(3725.4567) == "01:02:05,457"


def test_the_api_description_names_its_licence(client: TestClient) -> None:
    info = client.get("/api/openapi.json").json()["info"]
    assert info["contact"]["name"] == "Carson McRae" and info["license"]["name"] == "MIT"
