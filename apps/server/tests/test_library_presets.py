# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for immersive reading presets: the shipped files, anchors, reports, applying and removing.
Scope: Every shipped preset matches the schema, belongs to a featured work of the catalog's own edition,
names characters the dialogue analysis finds (or that a curated speaker line gives lines to), and anchors
only sentences that exist in the shipped text, in the named chapter. Anchors resolve by hash, then by
quote, by occurrence, and otherwise not at all. The schema refuses unknown sound events and music tracks,
loops without an end, repeated names, speakers that aren't characters and unknown fields, and a bad file
is left out of the load with a log line. Over the API: a document that isn't a bundled work has no preset;
a report says which voices are here; applying writes character voices and sentence annotations the planner
uses, sound effects as rows the preset owns in the Sounds panel (unresolved anchors and occupied sentences
skipped, a reader's edit or removal respected, taken out with the preset) and music as a record only (the
track is each device's own setting); applying again replaces rather than mixes; removing takes out only what
was written. The known track ids are the web app's music library. A paired phone may do all of this.
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
from ltts.library import preset_service as service_module
from ltts.library import presets as presets_module
from ltts.library.presets import KNOWN_TRACKS, Anchor, Preset, load_presets, make_anchor, resolve, sentence_hash

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


def test_the_known_tracks_are_the_web_apps_music_library() -> None:
    """A renamed or removed track fails here, in CI, rather than in a reader's preset."""
    library = Path(__file__).parents[2] / "web" / "src" / "features" / "music" / "library.json"
    tracks = json.loads(library.read_text(encoding="utf-8"))["tracks"]
    assert {track["id"] for track in tracks} == KNOWN_TRACKS


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
    assert [c["available"] for c in report["components"]] == [True, True, True, True, True]
    assert report["narrator"] == {"preferred": "kokoro:af_heart", "chosen": None}  # that voice isn't installed here
    assert report["speakersResolved"] == 8 and report["speakersUnresolved"] == 0 and report["effects"] == 5
    assert report["music"] == {
        "trackId": "gymnopedie-1",
        "volume": 10,
        "note": "Light piano for a long golden afternoon.",
    }
    alice = next(c for c in report["characters"] if c["id"] == "alice")
    assert alice["lines"] > 100 and alice["voice"]["chosen"] is None and alice["description"]
    # With none of the preset's voices installed, applying assigns nothing, and says so rather than guessing.
    applied = client.post(f"/api/documents/{doc}/preset/apply", json={"components": ["characters"]}).json()
    assert applied["appliedAt"] and applied["appliedVersion"] == 1
    assert all(c["voiceId"] is None for c in client.get(f"/api/documents/{doc}/characters").json())
    # Music is recorded as chosen, and nothing else: which track a device plays is the player's own setting
    # there, so the server has nothing to write.
    with_music = client.post(f"/api/documents/{doc}/preset/apply", json={"components": ["music", "characters"]}).json()
    assert [c["applied"] for c in with_music["components"]] == [False, True, False, False, True]
    assert services.presets._record(doc) is not None
    assert services.presets._record(doc)[0]["music"] == {"track_id": "gymnopedie-1", "volume": 10}  # type: ignore[index]
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


def test_anchors_trust_quotes_only_for_the_presets_own_edition(client: TestClient, services: Services) -> None:
    doc = client.post(f"/api/library/works/{ALICE}/open").json()["id"]
    assert client.get(f"/api/documents/{doc}/preset").json()["editionMatches"] is True
    late = next(s for s in services.document_repo.segments_detail(doc) if s.text.endswith("I shall be late!”"))
    moved = Anchor(
        chapter="chapter-1", hash="0" * 16, quote="I shall be late!”", occurrence=1
    )  # text changed, quote left
    speakers = [{"anchor": moved.model_dump(), "speaker": "ann"}]
    preset = Preset.model_validate(_preset(speakers=speakers, edition_id=PRESETS[ALICE].edition_id))
    assert services.presets.report(doc, preset).speakers_resolved == 1  # the same edition: the quote stands in
    with services.db.connect() as conn:
        conn.execute(
            "UPDATE bundled_documents SET edition_id = 'standardebooks:other@0000000' WHERE document_id = ?", (doc,)
        )
    report = client.get(f"/api/documents/{doc}/preset").json()
    assert report["editionMatches"] is False and report["speakersResolved"] == 8  # every shipped hash still matches
    assert services.presets.report(doc, preset).speakers_resolved == 0  # another edition: a quote proves nothing
    services.presets.apply(doc, preset, ["speakers"])
    assert services.styling.get(doc).segments == [] and late.index not in services.styling._rows(doc)


def test_organising_and_presets_never_touch_the_shipped_books(client: TestClient, services: Services) -> None:
    doc = client.post(f"/api/library/works/{ALICE}/open").json()["id"]
    folder = client.post("/api/library/folders", json={"name": "Classics"}).json()
    client.put(f"/api/documents/{doc}/shelf", json={"folderId": folder["id"], "tags": ["read-aloud"], "favorite": True})
    services.presets.apply(doc, PRESETS[ALICE], ["characters"])
    client.delete(f"/api/library/folders/{folder['id']}")
    assert client.get(f"/api/documents/{doc}").status_code == 200  # the document outlives its folder
    version, works = catalog_module.load_catalog()  # every shipped file still matches its recorded hash
    assert version >= 1 and len(works) == 25
    assert not list((services.settings.resolved_data_dir / "tmp").glob("*.upload"))  # and no copy was left behind


def test_effects_become_rows_the_experience_owns_in_the_sounds_panel(client: TestClient, services: Services) -> None:
    doc = client.post(f"/api/library/works/{ALICE}/open").json()["id"]
    sounds = f"/api/documents/{doc}/sound-effects"
    report = client.post(f"/api/documents/{doc}/preset/apply", json={"components": ["effects"]}).json()
    # The crowd is an experimental sound: left to the reader's own hand, so four of the five are placed.
    assert report["effects"] == 5 and report["effectsPlaced"] == 4
    rows = client.get(sounds).json()["effects"]
    assert len(rows) == 4 and "crowd-murmur" not in {r["event"] for r in rows}
    assert {(r["origin"], r["status"], r["enabled"], r["stale"]) for r in rows} == {("preset", "accepted", True, False)}
    by_event = {r["event"]: r for r in rows}
    # Volumes are percents of each sound's own level: wind-gust (0.6) at 70 % stores 42, the clock (0.35) at 40 % 14.
    assert by_event["wind-gust"]["volume"] == 42 and by_event["door-creak"]["volume"] == 39
    assert by_event["clock-tick"]["volume"] == 14
    # An ambience given as a duration lasts about four seconds a sentence: 20 s is 5 sentences.
    clock = by_event["clock-tick"]
    assert clock["untilSegment"] == clock["segmentIndex"] + 5
    assert by_event["wind-gust"]["untilSegment"] is None
    record = services.presets._record(doc)
    assert record is not None and sorted(record[0]["effects"]["placed"]) == sorted(r["id"] for r in rows)
    assert record[0]["effects"]["skipped"] == {
        "occupied": 0,
        "experimental": 1,
        "invalid": 0,
        "limit": 0,
        "unresolved": 0,
    }
    # A reader's change makes a row theirs: applying again leaves it and finds its sentence occupied.
    door = by_event["door-creak"]
    assert client.patch(f"{sounds}/{door['id']}", json={"volume": 80}).json()["origin"] == "manual"
    again = client.post(f"/api/documents/{doc}/preset/apply", json={"components": ["effects"]}).json()
    assert again["effectsPlaced"] == 3
    rows = client.get(sounds).json()["effects"]
    assert len(rows) == 4 and next(r for r in rows if r["id"] == door["id"])["volume"] == 80
    assert services.presets._record(doc)[0]["effects"]["skipped"]["occupied"] == 1  # type: ignore[index]
    # Removing a row is a removal; only applying again brings the experience's version back.
    clock = next(r for r in rows if r["event"] == "clock-tick")
    assert client.delete(f"{sounds}/{clock['id']}").status_code == 204
    assert len(client.get(sounds).json()["effects"]) == 3
    restored = client.post(f"/api/documents/{doc}/preset/apply", json={"components": ["effects"]}).json()
    assert restored["effectsPlaced"] == 3
    assert any(r["event"] == "clock-tick" for r in client.get(sounds).json()["effects"])
    # Standard takes out the experience's rows and leaves the reader's.
    assert client.delete(f"/api/documents/{doc}/preset").status_code == 204
    assert [(r["id"], r["origin"]) for r in client.get(sounds).json()["effects"]] == [(door["id"], "manual")]
    assert client.get(f"/api/documents/{doc}/preset").json()["effectsPlaced"] == 0
    # An anchor that isn't in this text is skipped and counted, never guessed.
    lost = {"id": "lost", "anchor": ANCHOR, "event": "thud", "category": "impacts", "intent": "x"}
    elsewhere = Preset.model_validate({**PRESETS[ALICE].model_dump(by_alias=True), "effects": [lost]})
    assert services.presets.apply(doc, elsewhere, ["effects"]).effects_placed == 0
    skipped = {"occupied": 0, "experimental": 0, "invalid": 0, "limit": 0, "unresolved": 1}
    assert services.presets._record(doc)[0]["effects"] == {"placed": [], "skipped": skipped}  # type: ignore[index]


def test_an_ambience_lasts_to_its_end_anchor_or_its_duration_and_volumes_follow_the_sound() -> None:
    sentences = [(i, f"Sentence {i}.") for i in range(100)]

    def anchor(index: int) -> dict[str, Any]:
        return {"chapter": "c", "hash": sentence_hash(f"Sentence {index}."), "quote": f"Sentence {index}."}

    def effect(**fields: Any) -> presets_module.EffectAnnotation:
        data = {"id": "e", "anchor": anchor(10), "event": "rain-light", "category": "weather", "intent": "x", **fields}
        return presets_module.EffectAnnotation.model_validate(data)

    until = service_module._until
    assert until(effect(event="thud", category="impacts"), 10, sentences, True, 99) is None  # a one-shot
    assert until(effect(loop=True, end_anchor=anchor(14)), 10, sentences, True, 99) == 14
    # An end before the start, or one that isn't in this text: the duration counts; without one, no end (the store
    # refuses a loop without an end).
    assert until(effect(loop=True, end_anchor=anchor(3), duration_s=20), 10, sentences, True, 99) == 15
    assert until(effect(loop=True, end_anchor=ANCHOR), 10, sentences, True, 99) is None
    assert until(effect(loop=True, duration_s=2), 10, sentences, True, 99) == 11
    assert until(effect(loop=True, duration_s=240), 10, sentences, True, 99) == 70  # the store's longest span
    assert until(effect(loop=True, duration_s=240), 10, sentences, True, 30) == 30  # or the document's end
    volume = service_module._effect_volume
    assert volume(effect(event="wind-gust", category="weather", volume=70)) == 42  # wind-gust's own level is 0.6
    assert volume(effect(event="thud", category="impacts", sound_id="thud", volume=150)) == 105
    assert volume(effect(event="thud", category="impacts", sound_id="nope", volume=140)) == 140  # the store refuses it
