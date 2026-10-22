# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for immersive reading presets: the shipped files, anchors, reports, applying and removing.
Scope: Every shipped preset matches the schema, belongs to a featured work of the catalog's own edition,
names characters the dialogue analysis finds (or that a curated speaker line gives lines to), and anchors
only sentences that exist in the shipped text, in the named chapter. Anchors resolve by hash, then by
quote, by occurrence, and otherwise not at all. The schema refuses unknown sound events and music tracks,
loops without an end, repeated names, speakers that aren't characters and unknown fields, and a bad file
is left out of the load with a log line. Over the API: a document that isn't a bundled work has no preset;
a report says which voices are here and which components can be applied; applying voices and speakers
writes character voices and sentence annotations the planner then uses, music and effects are refused as
not yet available, applying again replaces rather than mixes, and removing takes out only what was
written. A paired phone may do all of this (test_lan_security.py lists the routes).
Does NOT belong: The catalog itself (test_library_catalog.py) or the planner's rules (test_sentence_styling.py).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from ltts.container import Services
from ltts.documents.delivery import Sentence, analyse
from ltts.documents.extract_epub import extract_epub_file
from ltts.documents.segmenter import segment_extraction
from ltts.documents.structures import ExtractionLimits
from ltts.errors import NotFoundError
from ltts.library import catalog as catalog_module
from ltts.library.presets import Anchor, Preset, load_presets, make_anchor, resolve, sentence_hash

LIMITS = ExtractionLimits(10_000_000, 10_000, 10_000, 200 * 1024 * 1024, 500)
ALICE = "alices-adventures-in-wonderland"
WORKS = {w.work_id: w for w in catalog_module.load_catalog()[1]}
PRESETS = load_presets()
PACKAGE = catalog_module._package()


def test_every_featured_work_has_a_preset_that_matches_the_catalog() -> None:
    featured = {w.work_id: w.featured for w in WORKS.values() if w.featured}
    assert set(PRESETS) == set(featured) and len(PRESETS) >= 6
    for work_id, preset in PRESETS.items():
        work = WORKS[work_id]
        assert featured[work_id] is not None and preset.preset_id == featured[work_id].preset_id
        assert preset.edition_id == work.edition["edition_id"] and preset.text_version == work.text_version
        assert preset.narrator is not None and preset.music is not None  # every preset recommends a voice and a track
        assert preset.components[0] == "narrator" and preset.components[-1] == "music"


@pytest.mark.parametrize("work_id", sorted(PRESETS))
def test_a_shipped_preset_points_at_real_sentences_and_real_speakers(work_id: str) -> None:
    preset = PRESETS[work_id]
    work = WORKS[work_id]
    path = Path(str(PACKAGE.joinpath(*work.file.split("/"))))
    segments, sections = segment_extraction(extract_epub_file(path, None, LIMITS))
    chapters = {section.index: work.chapters[section.index]["id"] for section in sections}
    rows = [(s.index, s.text) for s in segments]
    by_index = {s.index: s for s in segments}
    anchors = [speaker.anchor for speaker in preset.speakers] + [effect.anchor for effect in preset.effects]
    anchors += [effect.end_anchor for effect in preset.effects if effect.end_anchor]
    for anchor in anchors:
        index = resolve(anchor, rows)
        assert index is not None, anchor
        assert chapters[by_index[index].section_index] == anchor.chapter, anchor
        assert sentence_hash(by_index[index].text) == anchor.hash, anchor  # the hash matched, not only the quote
    lines = analyse([Sentence(s.index, s.paragraph_index, s.kind, s.text) for s in segments])
    found = {line.speaker for line in lines.values() if line.speaker}
    spoken = {speaker.speaker for speaker in preset.speakers}
    for character in preset.characters:
        assert set(character.names) & found or character.id in spoken, character.name
    assert preset.music is not None
    assert {chapter.chapter for chapter in preset.music.chapters} <= set(chapters.values())


def test_anchors_resolve_by_hash_then_quote_then_not_at_all() -> None:
    rows = [(0, "Alpha  beta."), (1, "Gamma."), (2, "Alpha beta."), (3, "Gamma delta.")]
    first = make_anchor("c", "Alpha beta.")
    assert resolve(first, rows) == 0 and first.hash == sentence_hash("Alpha  beta.")  # whitespace doesn't count
    assert resolve(make_anchor("c", "Alpha beta.", 2), rows) == 2
    assert resolve(make_anchor("c", "Alpha beta.", 3), rows) is None
    moved = Anchor(
        chapter="c", hash="0" * 16, quote="Gamma", occurrence=2
    )  # the text changed; the quote is still there
    assert resolve(moved, rows) == 3
    assert resolve(Anchor(chapter="c", hash="0" * 16, quote="Omega"), rows) is None
    assert make_anchor("c", "x" * 200).quote == "x" * 80


def _preset(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "schema": "ttsnative.immersive-preset/1",
        "preset_id": "test-preset",
        "preset_version": 1,
        "work_id": ALICE,
        "edition_id": "edition",
        "text_version": 1,
        "title": "Test",
        "summary": "A test.",
        "characters": [
            {"id": "ann", "name": "Ann", "voice": {"preferred": "kokoro:alpha"}},
            {"id": "bob", "name": "Bob", "aliases": ["Robert"], "voice": {"preferred": "kokoro:beta"}},
        ],
    }
    data.update(overrides)
    return data


ANCHOR = {"chapter": "c", "hash": "0" * 16, "quote": "Hello"}
REFUSED: list[Callable[[], dict[str, Any]]] = [
    lambda: _preset(effects=[{"id": "e", "anchor": ANCHOR, "event": "heartbeat", "category": "household", "intent": "x"}]),
    lambda: _preset(effects=[{"id": "e", "anchor": ANCHOR, "event": "door-creak", "category": "weather", "intent": "x"}]),
    lambda: _preset(effects=[{"id": "e", "anchor": ANCHOR, "event": "rain-light", "category": "weather", "intent": "x", "loop": True}]),
    lambda: _preset(effects=[{"id": "e", "anchor": ANCHOR, "event": "thud", "category": "impacts", "intent": "x"}] * 2),
    lambda: _preset(music={"recommendation": {"track_id": "elevator"}}),
    lambda: _preset(music={"recommendation": {"track_id": "waiting"}, "chapters": [{"chapter": "c", "track_id": "nope"}]}),
    lambda: _preset(characters=[{"id": "ann", "name": "Ann", "aliases": ["Bob"], "voice": {"preferred": "kokoro:alpha"}},
                                {"id": "bob", "name": "Bob", "voice": {"preferred": "kokoro:beta"}}]),
    lambda: _preset(characters=[{"id": "ann", "name": "Ann", "voice": {"preferred": "kokoro:alpha"}}] * 2),
    lambda: _preset(speakers=[{"anchor": ANCHOR, "speaker": "zed"}]),
    lambda: _preset(characters=[{"id": "ann", "name": "Ann", "voice": {"preferred": "kokoro:alpha", "fallbacks": ["no colon"]}}]),
    lambda: _preset(schema="ttsnative.immersive-preset/2"),
    lambda: _preset(extra="field"),
]  # fmt: skip


@pytest.mark.parametrize("make", REFUSED)
def test_the_schema_refuses_what_it_does_not_know(make: Callable[[], dict[str, Any]]) -> None:
    with pytest.raises(ValueError):
        Preset.model_validate(make())


def test_a_bad_preset_file_is_left_out_and_logged(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    folder = tmp_path / "presets"
    folder.mkdir()
    (folder / "bad.json").write_text("{}", encoding="utf-8")
    (folder / "notes.txt").write_text("not a preset", encoding="utf-8")
    music = {"recommendation": {"track_id": "waiting"}, "chapters": [{"chapter": "c", "track_id": "brook"}]}
    (folder / "good.json").write_text(json.dumps(_preset(music=music)), encoding="utf-8")
    with caplog.at_level(logging.ERROR, logger="ltts.library"):
        loaded = load_presets(tmp_path)
    assert set(loaded) == {ALICE} and loaded[ALICE].preset_id == "test-preset"
    recommended = loaded[ALICE].music
    assert recommended is not None and recommended.chapters[0].track_id == "brook"
    assert "preset left out" in caplog.text


def test_documents_that_are_not_bundled_works_have_no_preset(client: TestClient) -> None:
    doc = client.post("/api/documents/text", json={"text": "“Hello,” said Ann. Fine.", "title": "Pasted"}).json()["id"]
    assert client.get(f"/api/documents/{doc}/preset").status_code == 404
    refused = client.post(f"/api/documents/{doc}/preset/apply", json={"components": ["narrator"]})
    assert refused.status_code == 404 and refused.json()["error"]["code"] == "preset_not_found"
    assert client.delete(f"/api/documents/{doc}/preset").status_code == 404
    assert client.get(f"/api/documents/{'f' * 32}/preset").status_code == 404
    assert client.post(f"/api/documents/{doc}/preset/apply", json={"components": []}).status_code == 422
    assert client.post(f"/api/documents/{doc}/preset/apply", json={"components": ["lighting"]}).status_code == 422


def test_the_report_applies_and_removes_voices_and_speakers(
    client: TestClient, services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    doc = client.post(f"/api/library/works/{ALICE}/open").json()["id"]
    report = client.get(f"/api/documents/{doc}/preset").json()
    assert report["presetId"] == f"{ALICE}-immersive" and report["workId"] == ALICE and report["appliedAt"] is None
    assert [c["name"] for c in report["components"]] == ["narrator", "characters", "speakers", "effects", "music"]
    assert [c["available"] for c in report["components"]] == [True, True, True, False, False]
    assert report["narrator"] == {"preferred": "kokoro:af_heart", "chosen": None}  # that voice isn't installed here
    assert report["speakersResolved"] == 8 and report["speakersUnresolved"] == 0 and report["effects"] == 5
    assert report["musicTrackId"] == "gymnopedie-1"
    alice = next(c for c in report["characters"] if c["id"] == "alice")
    assert alice["lines"] > 100 and alice["voice"]["chosen"] is None and alice["description"]
    # With none of the preset's voices installed, applying assigns nothing, and says so rather than guessing.
    applied = client.post(f"/api/documents/{doc}/preset/apply", json={"components": ["characters"]}).json()
    assert applied["appliedAt"] and applied["appliedVersion"] == 1
    assert all(c["voiceId"] is None for c in client.get(f"/api/documents/{doc}/characters").json())
    # Music and effects can't be applied yet.
    refused = client.post(f"/api/documents/{doc}/preset/apply", json={"components": ["characters", "music"]})
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "component_unavailable"
    # When the voices are here, every character gets one, aliases included, and the curated lines their speaker.
    monkeypatch.setattr(services.presets, "_available", lambda voice_id: True)
    before = services.styling.get(doc).revision
    client.put(f"/api/documents/{doc}/characters", json={"name": "Dodo", "voiceId": "kokoro:alpha"})  # the reader's own
    body = {"components": ["speakers", "characters", "narrator"]}
    applied = client.post(f"/api/documents/{doc}/preset/apply", json=body).json()
    assert [c["applied"] for c in applied["components"]] == [True, True, True, False, False]
    assert applied["narrator"]["chosen"] == "kokoro:af_heart"
    characters = {c["name"]: c["voiceId"] for c in client.get(f"/api/documents/{doc}/characters").json()}
    assert characters["Alice"] == "kokoro:bf_isabella" and characters["Rabbit"] == "kokoro:am_puck"
    assert characters["White Rabbit"] == "kokoro:am_puck" and characters["Dodo"] == "kokoro:alpha"
    assert services.styling.get(doc).revision != before  # players fetch new audio
    # The planner reads the Rabbit's untagged line in his voice.
    late = next(s for s in services.document_repo.segments_detail(doc) if s.text.endswith("I shall be late!”"))
    plan = services.styling.plan(doc, late.index, late.text, "kokoro:alpha", services.casting.voices(doc))
    assert plan.voice_id == "kokoro:am_puck" or any(part.voice_id == "kokoro:am_puck" for part in plan.parts)
    # Applying again replaces what was written; the reader's own character stays.
    again = client.post(f"/api/documents/{doc}/preset/apply", json={"components": ["characters"]}).json()
    assert [c["applied"] for c in again["components"]] == [False, True, False, False, False]
    assert services.styling.get(doc).revision == before
    assert client.delete(f"/api/documents/{doc}/preset").status_code == 204
    characters = {c["name"]: c["voiceId"] for c in client.get(f"/api/documents/{doc}/characters").json()}
    assert characters == {"Dodo": "kokoro:alpha", **{name: None for name in characters if name != "Dodo"}}
    assert client.get(f"/api/documents/{doc}/preset").json()["appliedAt"] is None
    assert client.delete(f"/api/documents/{doc}/preset").status_code == 204  # nothing to remove is fine
    narrated = client.post(f"/api/documents/{doc}/preset/apply", json={"components": ["narrator"]}).json()
    assert [c["applied"] for c in narrated["components"]] == [True, False, False, False, False]
    characters = {c["name"]: c["voiceId"] for c in client.get(f"/api/documents/{doc}/characters").json()}
    assert characters["Dodo"] == "kokoro:alpha" and sum(voice is not None for voice in characters.values()) == 1
    stripped = Preset.model_validate({**PRESETS[ALICE].model_dump(by_alias=True), "narrator": None})
    with pytest.raises(NotFoundError):
        services.presets.apply(doc, stripped, ["narrator"])


def test_speaker_scopes_confidence_and_unresolved_anchors(client: TestClient, services: Services) -> None:
    text = "“Come in,” she said. The door opened. “Now then.” Nothing happened."
    doc = client.post("/api/documents/text", json={"text": text, "title": "Scopes"}).json()["id"]
    segments = {s.text: s.index for s in services.document_repo.segments_detail(doc)}
    speakers = [
        {"anchor": make_anchor("c", "“Now then.”").model_dump(), "speaker": "ann"},  # a quoted line names its speaker
        {"anchor": make_anchor("c", "The door opened.").model_dump(), "speaker": "ann", "scope": "sentence"},
        {"anchor": make_anchor("c", "Nothing happened.").model_dump(), "speaker": "ann", "confidence": "uncertain"},
        {"anchor": ANCHOR, "speaker": "bob", "scope": "sentence"},  # not in this text
        {"anchor": make_anchor("c", "Nothing happened.").model_dump(), "speaker": "bob", "scope": "sentence"},
    ]
    preset = Preset.model_validate(_preset(speakers=speakers))
    assert services.presets.for_work(ALICE) is not None and services.presets.for_work("nope") is None
    report = services.presets.apply(doc, preset, ["characters", "speakers"])
    assert report.speakers_resolved == 4 and report.speakers_unresolved == 1
    assert [c.voice.chosen for c in report.characters] == ["kokoro:alpha", None]  # kokoro:beta isn't a voice here
    styled = {s.index: s.voice_id for s in services.styling.get(doc).segments}
    assert styled == {
        segments["The door opened."]: "kokoro:alpha"
    }  # Bob has no voice, so his sentence keeps the reader's
    voices = services.casting.voices(doc)
    now_then = services.styling.plan(doc, segments["“Now then.”"], "“Now then.”", "kokoro:reader", voices)
    assert now_then.voice_id == "kokoro:alpha"
    nothing = services.styling.plan(doc, segments["Nothing happened."], "Nothing happened.", "kokoro:reader", voices)
    assert nothing.voice_id == "kokoro:reader"
    services.presets.remove(doc)
    assert services.styling.get(doc).segments == [] and services.casting.voices(doc) == {}
    services.presets.remove(doc)  # nothing left to take out
