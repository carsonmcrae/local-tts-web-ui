# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for pronunciations for one document, respellings, and hearing a word before saving it.

Scope: Respellings read as words (capitals in a hyphenated respelling mark stress, letters stay
letters); a document's rule winning over the library's for the same word in that document only;
the scoped API (duplicates per scope, limits per scope, moving a rule, unknown documents, rules
deleted with their document); playback, takes, exports and voice previews saying the same thing
while the document's text never changes; the preview (as written and respelled, at preview priority,
length caps, rate limit, local to this computer); an older dictionary migrating as library rules; and
only the most recently used documents keeping a compiled matcher in memory.
Does NOT belong: Whole-word matching basics and the library-only API (test_reader_features.py).
"""

from __future__ import annotations

import dataclasses
import sqlite3
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine, wait_job
from ltts import db as db_module
from ltts.container import Services
from ltts.db import Database
from ltts.lan.policy import refused_remotely
from ltts.pronunciation import store
from ltts.pronunciation.store import PronunciationOut, PronunciationStore, compile_rules, spoken_respelling
from ltts.speech_api.guard import RateLimiter
from ltts.synthesis.scheduler import PRIORITY_PREVIEW
from ltts.synthesis.service import ClientGoneError

TEXT = "Dr. Nguyen ate gnocchi with quinoa."
VOICE = "kokoro:alpha"
PREVIEW = "/api/pronunciation-preview"


def error(response: Any) -> str:
    return str(response.json()["error"]["code"])


def document(client: TestClient, title: str) -> str:
    """A document reading ``TEXT`` as its first sentence."""
    return str(client.post("/api/documents/text", json={"text": TEXT, "title": title}).json()["id"])


def rule(word: str, say_as: str, **wire: Any) -> PronunciationOut:
    """A saved rule as the API sends it (``matchCase=True``, ``documentId=...``)."""
    return PronunciationOut.model_validate({"id": "x", "createdAt": "now", "word": word, "sayAs": say_as, **wire})


def add(client: TestClient, word: str, say_as: str, document_id: str | None = None) -> dict[str, Any]:
    response = client.post("/api/pronunciations", json={"word": word, "sayAs": say_as, "documentId": document_id})
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def test_respellings_are_read_as_words_and_a_document_rule_wins() -> None:
    assert spoken_respelling("NYOH-kee") == "nyoh-kee"  # a stressed syllable is never spelled out
    assert spoken_respelling("KEEN-wah") == "keen-wah"
    assert spoken_respelling("eye-SAW-krah-teez") == "eye-saw-krah-teez"
    assert spoken_respelling("Kay-el") == "Kay-el"
    assert spoken_respelling("Win") == "Win"
    assert spoken_respelling("U S A") == "U S A"  # letters on their own stay letters
    assert spoken_respelling("A-meer FBI") == "A-meer FBI"

    library = [rule("Nguyen", "Nwin"), rule("quinoa", "KEEN-wah"), rule("us", "uss")]
    own = [rule("nguyen", "Win"), rule("US", "you ess", matchCase=True)]
    assert compile_rules(own, library)("Dr. Nguyen ate quinoa.") == "Dr. Win ate keen-wah."
    assert compile_rules(library)("Dr. Nguyen ate quinoa.") == "Dr. Nwin ate keen-wah."
    # An exact-case rule of the document wins only for that case; the library has the rest.
    assert compile_rules(own, library)("US and us") == "you ess and uss"
    assert compile_rules([], [])("unchanged") == "unchanged"


def test_rules_for_one_document(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    wardens, other = document(client, "Wardens"), document(client, "Other")
    library = add(client, "Nguyen", "Nwin")
    own = add(client, "nguyen", "Win", wardens)  # the same word, for one document
    assert own["documentId"] == wardens and own["documentTitle"] == "Wardens"
    assert library["documentId"] is None and library["documentTitle"] is None
    clash = client.post("/api/pronunciations", json={"word": "NGUYEN", "sayAs": "x", "documentId": wardens})
    assert error(clash) == "pronunciation_exists" and "this document" in clash.json()["error"]["message"]
    missing = client.post("/api/pronunciations", json={"word": "a", "sayAs": "b", "documentId": "0" * 32})
    assert error(missing) == "document_not_found"
    assert client.post("/api/pronunciations", json={"word": "a", "sayAs": "b", "documentId": "../x"}).status_code == 422
    listed = client.get("/api/pronunciations").json()
    assert [(r["word"], r["documentTitle"]) for r in listed] == [("Nguyen", None), ("nguyen", "Wardens")]

    url = f"/api/pronunciations/{own['id']}"
    kept = client.put(url, json={"word": "Nguyen", "sayAs": "Wen"}).json()  # no documentId: keeps its scope
    assert kept["documentId"] == wardens and kept["sayAs"] == "Wen"
    to_library = client.put(url, json={"word": "Nguyen", "sayAs": "Wen", "documentId": None})
    assert error(to_library) == "pronunciation_exists"  # the library already has this word
    moved = client.put(url, json={"word": "Nguyen", "sayAs": "Wen", "documentId": other}).json()
    assert moved["documentId"] == other and moved["documentTitle"] == "Other"

    monkeypatch.setattr(store, "MAX_RULES", 2)
    add(client, "gnocchi", "NYOH-kee")
    assert error(client.post("/api/pronunciations", json={"word": "quinoa", "sayAs": "KEEN-wah"})) == (
        "pronunciation_limit"
    )
    add(client, "quinoa", "KEEN-wah", wardens)  # each document has its own room
    assert client.delete(f"/api/documents/{other}").status_code == 204
    assert client.delete(f"/api/documents/{wardens}").status_code == 204
    assert [r["word"] for r in client.get("/api/pronunciations").json()] == ["gnocchi", "Nguyen"]


def test_playback_takes_exports_and_previews_say_the_same_and_the_text_stays(
    client: TestClient, services: Services, engines: dict[str, FakeEngine]
) -> None:
    wardens, other = document(client, "Wardens"), document(client, "Other")
    add(client, "gnocchi", "NYOH-kee")
    add(client, "Nguyen", "Win", wardens)
    calls = engines["kokoro"].calls

    def play(doc_id: str) -> str:
        assert client.get(f"/api/documents/{doc_id}/segments/0/audio", params={"voice": VOICE}).status_code == 200
        return calls[-1][0]

    assert play(wardens) == "Dr. Win ate nyoh-kee with quinoa."
    assert play(other) == "Dr. Nguyen ate nyoh-kee with quinoa."  # the library's rules only
    shown = client.get(f"/api/documents/{wardens}/sections/0").json()["segments"][0]["text"]
    assert shown == TEXT  # what is written never changes

    plan = services.synthesis.plan_segment(wardens, 0, TEXT, VOICE)
    take = dataclasses.replace(plan, take=1)
    assert services.synthesis.job(take, TEXT, "paragraph", 1).pieces[0].spoken == "Dr. Win ate nyoh-kee with quinoa."

    def export() -> None:
        request = {"documentId": wardens, "voiceId": VOICE, "format": "wav"}
        assert wait_job(client, client.post("/api/exports", json=request).json()["id"])["status"] == "succeeded"

    played = len(calls)
    export()
    assert len(calls) == played  # the export reused the audio playback made: same spoken text, same key
    add(client, "quinoa", "KEEN-wah", wardens)
    export()
    assert calls[-1][0] == "Dr. Win ate nyoh-kee with keen-wah."
    assert play(wardens) == "Dr. Win ate nyoh-kee with keen-wah." and len(calls) == played + 1  # cached by export

    assert client.post(f"/api/voices/{VOICE}/preview", json={"text": TEXT}).status_code == 200
    assert calls[-1][0] == "Dr. Nguyen ate nyoh-kee with quinoa."  # voice previews: the library's rules


def test_hearing_a_word_before_saving_it(
    client: TestClient, services: Services, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    add(client, "gnocchi", "NYOH-kee")
    priorities: list[int] = []
    render = services.synthesis.render

    async def spy(*args: Any) -> Any:
        priorities.append(args[4])
        return await render(*args)

    monkeypatch.setattr(services.synthesis, "render", spy)
    written = client.post(PREVIEW, json={"voiceId": VOICE, "text": " gnocchi "})
    assert written.status_code == 200 and engines["kokoro"].calls[-1][0] == "gnocchi"  # no rule: as written
    respelled = client.post(PREVIEW, json={"voiceId": VOICE, "text": "NYOH-kee", "respelling": True})
    assert respelled.status_code == 200 and engines["kokoro"].calls[-1][0] == "nyoh-kee"
    assert priorities == [PRIORITY_PREVIEW, PRIORITY_PREVIEW]
    clip = client.get(respelled.json()["audioUrl"])
    assert clip.status_code == 200 and clip.headers["content-type"] == "audio/wav"
    assert respelled.json()["durationS"] > 0 and written.json()["audioUrl"] != respelled.json()["audioUrl"]

    for body in (
        {"voiceId": VOICE, "text": "x" * 201},
        {"voiceId": VOICE, "text": "   "},
        {"voiceId": "nope", "text": "gnocchi"},
        {"voiceId": VOICE, "text": "gnocchi", "documentId": "a" * 32},
    ):
        assert client.post(PREVIEW, json=body).status_code == 422

    services.pronunciations.previews = RateLimiter(1)
    assert client.post(PREVIEW, json={"voiceId": VOICE, "text": "quinoa"}).status_code == 200
    limited = client.post(PREVIEW, json={"voiceId": VOICE, "text": "quinoa"})
    assert limited.status_code == 429 and error(limited) == "rate_limited" and int(limited.headers["Retry-After"]) > 0
    assert refused_remotely("POST", PREVIEW)  # on this computer until the LAN policy lists it

    async def gone(*_args: Any) -> Any:
        raise ClientGoneError

    services.pronunciations.previews = RateLimiter(5)
    monkeypatch.setattr(services.synthesis, "render", gone)
    assert client.post(PREVIEW, json={"voiceId": VOICE, "text": "quinoa"}).status_code == 499  # the listener left
    assert error(client.delete(f"/api/pronunciations/{'0' * 32}")) == "pronunciation_not_found"


def test_an_older_dictionary_becomes_library_rules(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    scoped = next(
        i for i, script in enumerate(db_module.MIGRATIONS) if "pronunciations ADD COLUMN document_id" in script
    )
    database = Database(tmp_path / "old.db")
    monkeypatch.setattr(db_module, "MIGRATIONS", db_module.MIGRATIONS[:scoped])
    database.migrate()
    with sqlite3.connect(database.path) as conn:
        conn.execute(
            "INSERT INTO pronunciations (id, word, say_as, match_case, created_at) VALUES (?, ?, ?, 0, ?)",
            ("a" * 32, "quinoa", "KEEN-wah", "2026-01-01T00:00:00+00:00"),
        )
    monkeypatch.undo()
    database.migrate()
    rules = PronunciationStore(database)
    assert [(r.word, r.document_id) for r in rules.list_all()] == [("quinoa", None)]
    assert rules.apply("Quinoa, please.") == "keen-wah, please."
    assert rules.apply("Quinoa, please.", "b" * 32) == "keen-wah, please."  # a document without rules of its own


def test_only_the_most_recently_used_documents_keep_a_compiled_matcher(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(store, "MATCHERS_KEPT", 2)
    database = Database(tmp_path / "rules.db")
    database.migrate()
    rules = PronunciationStore(database)
    first, second, third = "a" * 32, "b" * 32, "c" * 32
    for document_id in (first, second, third):
        assert rules.apply("Quinoa, please.", document_id) == "Quinoa, please."
    assert list(rules._matchers) == [second, third]  # the first document's matcher made room
    rules.apply("Quinoa, please.", second)
    assert list(rules._matchers) == [third, second]  # using one again keeps it the longest
