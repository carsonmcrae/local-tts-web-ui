# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for reading sentences in context, characters, annotations and candidate takes.

Scope:
- The delivery analysis: styles from tags, punctuation, asides and interjections; steady headings,
  lists and announcements; speakers and quotes running over sentences; mixed sentences split into
  narration and speech.
- Characters given voices (and reused as presets).
- The order voices are chosen in.
- Annotation validation and migration from the old styling table.
- Candidate takes, which built-in voices refuse.
- Pauses and per-sentence pronunciations.
Does NOT belong: Effects or the reader UI.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine
from ltts.container import Services
from ltts.db import MIGRATIONS
from ltts.documents import styling_router
from ltts.documents.delivery import CALM, DIALOGUE, LIVELY, NARRATION, QUESTION, Sentence, analyse, characters

STORY = "\n\n".join(
    [
        "Chapter 1",
        '"Are you coming?" asked Nicole.',
        '"Not tonight," whispered Marcus. "Maybe tomorrow."',
        '"It is late. Very late," said Nicole.',
        "Attention please: the last train departs now.",
        "(Nobody moved.)",
    ]
)


def lines_of(*texts: str) -> dict[int, object]:
    return analyse([Sentence(i, i, "paragraph", text) for i, text in enumerate(texts)])  # type: ignore[return-value]


def test_styles_come_from_tags_punctuation_and_asides() -> None:
    lines = analyse([
        Sentence(0, 0, "heading", "Chapter 1"),
        Sentence(1, 1, "paragraph", '"Run!" she shouted.'),
        Sentence(2, 2, "paragraph", '"I didn\'t say he stole it," whispered Marcus.'),
        Sentence(3, 3, "paragraph", '"Are you sure?" asked Elena.'),
        Sentence(4, 4, "paragraph", "(He never was.)"),
        Sentence(5, 5, "paragraph", "Oh!"),
        Sentence(6, 6, "paragraph", "Have you ever wondered why the sky is blue?"),
        Sentence(7, 7, "paragraph", "Nicole said, “We should go.”"),
        Sentence(8, 8, "paragraph", "- Bring a coat"),
        Sentence(9, 9, "paragraph", "ATTENTION ALL PASSENGERS"),
        Sentence(10, 10, "paragraph", "The river was wide."),
    ])  # fmt: skip
    styles = [lines[i].style for i in range(11)]
    assert styles == [NARRATION, LIVELY, CALM, QUESTION, CALM, LIVELY, QUESTION, DIALOGUE, NARRATION, NARRATION,
                      NARRATION]  # fmt: skip
    assert [i for i in range(11) if lines[i].steady] == [0, 8, 9]
    assert (lines[2].speaker, lines[3].speaker, lines[7].speaker, lines[1].speaker) == ("Marcus", "Elena", "Nicole",
                                                                                       None)  # fmt: skip
    assert [(p.text, p.quoted) for p in lines[1].parts] == [("Run!", True), ("she shouted.", False)]
    assert lines[10].parts == () and not lines[10].dialogue
    assert lines_of("Oh, dear me.")[0].style == LIVELY  # type: ignore[attr-defined]  # an interjection, however it ends


def test_a_quotation_over_several_sentences_keeps_its_speaker() -> None:
    lines = analyse([
        Sentence(0, 5, "paragraph", '"It is late.'),
        Sentence(1, 5, "paragraph", 'Very late," said Nicole.'),
        Sentence(2, 6, "paragraph", "She left."),
    ])  # fmt: skip
    assert (lines[0].speaker, lines[0].style, lines[1].speaker) == ("Nicole", DIALOGUE, "Nicole")
    assert lines[2].speaker is None and not lines[2].dialogue
    assert characters(lines) == [("Nicole", 2)]


def test_pronouns_and_common_words_are_never_names() -> None:
    lines = lines_of('"Hello," she said.', '"Hi," The said.', '"Go," said Someone.')
    assert all(line.speaker is None for line in lines.values())  # type: ignore[attr-defined]


def document(client: TestClient, text: str = STORY) -> str:
    doc_id: str = client.post("/api/documents/text", json={"text": text, "title": "Story"}).json()["id"]
    return doc_id


def test_characters_get_voices_that_read_their_lines(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    doc_id = document(client)
    found = client.get(f"/api/documents/{doc_id}/characters").json()
    assert [(c["name"], c["lines"]) for c in found] == [("Nicole", 3), ("Marcus", 2)]  # quotes run over sentences
    assert found[0]["sample"] == '"Are you coming?" asked Nicole.' and found[0]["voiceId"] is None
    assigned = client.put(f"/api/documents/{doc_id}/characters", json={"name": "Nicole", "voiceId": "chatterbox:alpha"})
    assert assigned.json()[0]["voiceId"] == "chatterbox:alpha"
    client.get(f"/api/documents/{doc_id}/segments/1/audio", params={"voice": "kokoro:alpha"})
    assert engines["chatterbox"].calls[-1][0] == "Are you coming?"  # Nicole's line in her voice
    assert engines["kokoro"].calls[-1][0] == "asked Nicole."  # the narration in the reading voice
    assert engines["chatterbox"].specs[-1].style is None  # styles only reach studio voices that have them
    hand = client.put(f"/api/documents/{doc_id}/characters", json={"name": "The Guard", "voiceId": "kokoro:alpha"})
    assert ("The Guard", 0) in [(c["name"], c["lines"]) for c in hand.json()]
    assert (
        client.put(f"/api/documents/{doc_id}/characters", json={"name": "X", "voiceId": "kokoro:none"}).status_code
        == 404
    )

    preset = client.post(f"/api/documents/{doc_id}/cast-presets", json={"name": "Series cast"}).json()
    assert preset["characters"] == {"Nicole": "chatterbox:alpha", "The Guard": "kokoro:alpha"}
    other = document(client, '"Ready?" asked Nicole.')
    applied = client.post(f"/api/documents/{other}/cast-presets/{preset['id']}/apply").json()
    assert {c["name"]: c["voiceId"] for c in applied}["Nicole"] == "chatterbox:alpha"
    assert [p["name"] for p in client.get("/api/cast-presets").json()] == ["Series cast"]
    assert client.delete(f"/api/cast-presets/{preset['id']}").status_code == 204
    gone = client.post(f"/api/documents/{other}/cast-presets/{preset['id']}/apply")
    assert gone.json()["error"]["code"] == "cast_preset_not_found"
    client.put(f"/api/documents/{doc_id}/characters", json={"name": "Nicole", "voiceId": None})
    assert (
        next(c for c in client.get(f"/api/documents/{doc_id}/characters").json() if c["name"] == "Nicole")["voiceId"]
        is None
    )


def test_a_sentences_own_voice_comes_before_its_character(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    doc_id = document(client)
    client.put(f"/api/documents/{doc_id}/characters", json={"name": "Nicole", "voiceId": "chatterbox:alpha"})
    client.put(f"/api/documents/{doc_id}/styles", json={"indexes": [1], "voiceId": "kokoro:alpha"})
    before = len(engines["chatterbox"].calls)
    client.get(f"/api/documents/{doc_id}/segments/1/audio", params={"voice": "kokoro:alpha"})
    assert len(engines["chatterbox"].calls) == before  # the whole sentence in its own voice
    assert engines["kokoro"].calls[-1][0] == '"Are you coming?" asked Nicole.'


def test_annotations_are_validated_and_described(client: TestClient, services: Services) -> None:
    doc_id = document(client)
    url = f"/api/documents/{doc_id}/styles"
    saved = client.put(url, json={"indexes": [5], "style": "calm", "pauseMs": 1500, "effect": "memory"}).json()
    assert saved["segments"] == [{"index": 5, "voiceId": None, "effect": "memory", "sound": None, "style": "calm",
                                  "take": None, "pauseMs": 1500, "skip": None}]  # fmt: skip
    assert client.put(url, json={"indexes": [5], "style": "sarcastic"}).status_code == 422
    assert client.put(url, json={"indexes": [5], "pauseMs": 20_000}).status_code == 422
    with pytest.raises(ValueError, match="invalid take"):
        services.styling.annotate(doc_id, 5, "take", "-1")
    with pytest.raises(ValueError, match="invalid"):
        services.styling.annotate(doc_id, 5, "script", "x")
    services.styling.annotate(doc_id, 2, "speak_as", '[["Marcus", "Mar-kus"]]')
    plan = services.synthesis.plan_segment(doc_id, 2, '"Not tonight," whispered Marcus.', "kokoro:alpha")
    assert plan.replacements == (("Marcus", "Mar-kus"),) and plan.style == CALM
    pause = services.synthesis.plan_segment(doc_id, 5, "(Nobody moved.)", "kokoro:alpha")
    assert pause.pause_ms == 1500 and pause.effect == "memory"


def test_a_pause_and_a_pronunciation_change_the_audio(client: TestClient, engines: dict[str, FakeEngine]) -> None:
    doc_id = document(client)
    audio = f"/api/documents/{doc_id}/segments/5/audio"
    plain = client.get(audio, params={"voice": "kokoro:alpha"})
    client.put(f"/api/documents/{doc_id}/styles", json={"indexes": [5], "pauseMs": 2000})
    paused = client.get(audio, params={"voice": "kokoro:alpha"})
    # The sentence's own 2 s pause replaces the usual paragraph pause (0.62 s).
    assert float(paused.headers["x-audio-duration"]) == pytest.approx(
        float(plain.headers["x-audio-duration"]) + 1.38, abs=0.05
    )


def test_candidate_takes_need_a_voice_that_varies(
    client: TestClient, engines: dict[str, FakeEngine], monkeypatch: pytest.MonkeyPatch
) -> None:
    doc_id = document(client)
    url = f"/api/documents/{doc_id}/segments/6/takes"
    refused = client.post(url, json={"voiceId": "kokoro:alpha"})
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "take_not_supported"
    first = client.post(url, json={"voiceId": "chatterbox:alpha"}).json()
    assert first["take"] == 1 and first["audioUrl"].startswith("/api/audio/")
    assert engines["chatterbox"].specs[-1].take == 1
    assert client.get(first["audioUrl"]).status_code == 200  # listen before keeping it
    second = client.post(url, json={"voiceId": "chatterbox:alpha", "take": 4}).json()
    assert second["take"] == 4 and second["audioUrl"] != first["audioUrl"]
    client.put(f"/api/documents/{doc_id}/styles", json={"indexes": [6], "take": 4})  # keep take 4
    kept = client.get(f"/api/documents/{doc_id}/segments/6/audio", params={"voice": "chatterbox:alpha"})
    assert kept.headers["x-audio-url"] == second["audioUrl"]  # the kept take plays (from the cache)
    nxt = client.post(url, json={"voiceId": "chatterbox:alpha"}).json()
    assert nxt["take"] == 5
    client.put(f"/api/documents/{doc_id}/styles", json={"indexes": [6], "take": None})  # back to the first take
    assert client.get(f"/api/documents/{doc_id}/styles").json()["segments"] == []
    monkeypatch.setattr(styling_router, "_making_take", SimpleNamespace(locked=lambda: True))  # one at a time
    busy = client.post(url, json={"voiceId": "chatterbox:alpha"})
    assert busy.status_code == 429 and busy.json()["error"]["code"] == "take_busy"


def test_old_sentence_styling_moves_into_annotations(tmp_path: Path) -> None:
    path = tmp_path / "old.sqlite3"
    with sqlite3.connect(path) as conn:
        upto = next(i for i, script in enumerate(MIGRATIONS) if "CREATE TABLE segment_annotations" in script)
        for script in MIGRATIONS[:upto]:
            conn.executescript(script)
        conn.execute(
            "INSERT INTO documents VALUES ('d', 't', NULL, 'paste', 1, 1, 1, NULL, 1, '[]', '[]', 'x', 'now', NULL)"
        )
        conn.execute("INSERT INTO segment_styles VALUES ('d', 0, 'kokoro:alpha', 'radio', NULL)")
        conn.execute("INSERT INTO document_cast VALUES ('d', 'chatterbox:alpha')")
        conn.executescript(MIGRATIONS[upto])
        rows = sorted(conn.execute("SELECT segment_idx, kind, value FROM segment_annotations").fetchall())
        cast = conn.execute("SELECT dialogue_voice_id, split_dialogue FROM document_cast").fetchone()
    assert rows == [(0, "effect", "radio"), (0, "voice", "kokoro:alpha")]
    assert cast == ("chatterbox:alpha", 1)
