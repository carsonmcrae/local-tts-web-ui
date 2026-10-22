# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: The English reading rules change only what is spoken, the same way on every path that speaks.

Scope: A saved pronunciation wins over the English reading of the same words; the document's text, its sentences,
search, word counts and the subtitles of an export stay exactly as written; playback, an export, regeneration
after the cache is cleared, a voice preview and the local speech API all ask the engine for the same spoken text,
and an export reuses the audio playback made.
Does NOT belong: The rules themselves (``test_english_speech.py``).
"""

from __future__ import annotations

import io
import zipfile
from typing import Any

from fastapi.testclient import TestClient

from conftest import FakeEngine, wait_job
from ltts.container import Services
from ltts.documents.normalize import word_count
from speech_api_support import program, speak, switch_on

TEXT = "Dr. Nguyen paid £5 at 4:45 p.m. in 1998 the firm said."
SPOKEN = "Doctor Nguyen paid 5 pounds at 4 45 PM in nineteen ninety-eight the firm said."
VOICE = "kokoro:alpha"


def document(client: TestClient, text: str = TEXT) -> str:
    return str(client.post("/api/documents/text", json={"text": text, "title": "Ledger"}).json()["id"])


def play(client: TestClient, engine: FakeEngine, doc_id: str, index: int = 0) -> str:
    assert client.get(f"/api/documents/{doc_id}/segments/{index}/audio", params={"voice": VOICE}).status_code == 200
    return engine.calls[-1][0]


def export(client: TestClient, doc_id: str, **extra: Any) -> dict[str, Any]:
    request = {"documentId": doc_id, "voiceId": VOICE, "format": "wav", **extra}
    job: dict[str, Any] = wait_job(client, client.post("/api/exports", json=request).json()["id"])
    assert job["status"] == "succeeded"
    return job


def rule(client: TestClient, word: str, say_as: str, document_id: str | None = None) -> None:
    body = {"word": word, "sayAs": say_as, "documentId": document_id}
    assert client.post("/api/pronunciations", json=body).status_code == 201


def test_a_saved_pronunciation_wins_over_the_english_reading(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    doc_id = document(client)
    assert play(client, engines["kokoro"], doc_id) == SPOKEN
    rule(client, "Dr.", "Drive")
    rule(client, "£5", "a fiver", doc_id)
    rule(client, "1998", "ninety-eight", doc_id)
    rule(client, "4:45", "quarter to five", doc_id)
    # The user's words are spoken as they wrote them; the English rules only read what is left.
    assert (
        play(client, engines["kokoro"], doc_id)
        == "Drive Nguyen paid a fiver at quarter to five p.m. in ninety-eight the firm said."
    )


def test_the_written_text_sentences_search_and_counts_never_change(services: Services, client: TestClient) -> None:
    doc_id = document(client, f"{TEXT} Call 020 7946 0321 before Chapter IV.")
    detail = client.get(f"/api/documents/{doc_id}").json()
    shown = [segment["text"] for segment in client.get(f"/api/documents/{doc_id}/sections/0").json()["segments"]]
    assert shown == [TEXT, "Call 020 7946 0321 before Chapter IV."]  # sentences and their text as written
    written = word_count(" ".join(shown))
    assert detail["wordCount"] == detail["spokenWordCount"] == written  # counted on the written words
    hits = services.document_repo.search(doc_id, "Dr.", limit=5).hits
    assert len(hits) == 1 and hits[0].segment_index == 0  # search and highlighting use the written sentence


def test_subtitles_keep_the_written_text_while_the_voice_says_the_english_reading(
    client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    doc_id = document(client)
    job = export(client, doc_id, captions=True)
    archive = zipfile.ZipFile(io.BytesIO(client.get(f"/api/exports/{job['id']}/download").content))
    subtitles = archive.read("Ledger.srt").decode("utf-8")
    assert TEXT in subtitles and "Doctor" not in subtitles and "nineteen" not in subtitles
    assert [call[0] for call in engines["kokoro"].calls] == [SPOKEN]


def test_playback_export_regeneration_preview_and_the_speech_api_say_the_same(
    services: Services, client: TestClient, engines: dict[str, FakeEngine]
) -> None:
    engine = engines["kokoro"]
    doc_id = document(client)
    assert play(client, engine, doc_id) == SPOKEN
    played = len(engine.calls)
    export(client, doc_id)
    assert len(engine.calls) == played  # the export reused playback's audio: same spoken text, same cache key

    services.synthesis.purge_voice(VOICE)  # regenerating after the cache is cleared asks for the same words
    export(client, doc_id)
    assert engine.calls[-1][0] == SPOKEN and len(engine.calls) == played + 1

    assert client.post(f"/api/voices/{VOICE}/preview", json={"text": TEXT}).status_code == 200
    assert engine.calls[-1][0] == SPOKEN

    token = switch_on(client)
    assert speak(program(client), token, input=TEXT).status_code == 200
    assert engine.calls[-1][0] == SPOKEN
