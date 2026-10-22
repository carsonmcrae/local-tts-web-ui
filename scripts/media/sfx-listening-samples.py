# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""
Purpose: Put a document of listening samples into a running TTSNative so sound effects can be judged
  under real narration, at the positions a reader would place them.
Scope: Pastes six short scenes (a storm, a quiet house, a castle, a pastoral morning, a city, and a
  chapter that should stay silent) as one document with a chapter each, analyses every chapter at the
  Immersive setting and accepts what it suggests, then places by hand every sound the scenes name
  (all 36 bundled sounds, ambiences spanning their sentences) where the detector's restraint left a
  sentence empty, and prints the reader's address. An earlier copy of the document is removed first.
  Talks only to the local server given on the command line, with the app's client header. Run from
  the repository root with the app (or `npm run dev`) running:
  node scripts/uv-run.mjs --cwd apps/server run --frozen python ../../scripts/media/sfx-listening-samples.py
  [--server http://127.0.0.1:8781] [--web http://127.0.0.1:5173]
Does NOT belong: Judging the sounds (a person does that in the reader with effects switched on).
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

HEADERS = {"X-LTTS-Client": "web", "Content-Type": "application/json"}
TITLE = "Sound effects: listening samples"
# Each scene: its title, its sentences, and (sentence number, sound, sentences an ambience lasts) placements.
SCENES: list[tuple[str, list[str], list[tuple[int, str, int]]]] = [
    (
        "A storm at the farmhouse",
        [
            "Rain drummed on the tin roof all through supper.",
            "Somewhere to the west, thunder rolled across the hills.",
            "A gust of wind rattled the shutters.",
            "The back door creaked as Mara pushed it open.",
            "She stepped onto the gravel path and it crunched under her boots.",
            "A dog barked twice from the neighbour's yard and fell quiet.",
            "Thunder cracked directly overhead and the lamps flickered.",
            "She came back in, and the door slammed shut behind her.",
            "Inside, the fire crackled in the grate while the wind howled outside.",
        ],
        [(0, "rain-light", 9), (1, "thunder-distant", 1), (2, "wind-gust", 1), (3, "door-creak", 1),
         (4, "footsteps-gravel", 1), (5, "dog-bark", 1), (6, "thunder-close", 1), (7, "door-slam", 1),
         (8, "fire-crackle", 1)],
    ),
    (
        "The house at night",
        [
            "The clock on the mantel ticked on.",
            "Upstairs, glass broke.",
            "Footsteps crossed the hall above her head, slow and careful.",
            "Someone knocked, three times, at the back door.",
            "A car pulled up outside with its engine running.",
            "The clock chimed the hour.",
            "Then the front door opened, and closed, quietly.",
        ],
        [(0, "clock-tick", 7), (1, "glass-break", 1), (2, "footsteps-wood", 1), (3, "door-knock", 1),
         (4, "car-pass", 1), (5, "clock-chime", 1), (6, "door-close", 1)],
    ),
    (
        "The keep",
        [
            "The great bell of the keep tolled the alarm.",
            "Steel rang on steel as the two knights met in the gateway.",
            "Hooves pounded across the plain towards the river.",
            "The wolf pack howled from the black line of the forest.",
            "Footsteps rang on the stone stair below them.",
            "The powder store exploded with a roar that lifted the roof.",
            "The wind howled around the tower all night.",
        ],
        [(0, "bell-toll", 1), (1, "sword-clash", 1), (2, "horse-hooves", 1), (3, "wolf-howl", 1),
         (4, "footsteps-stone", 1), (5, "explosion", 1), (6, "wind-howl", 1)],
    ),
    (
        "Morning by the stream",
        [
            "The stream ran clear over the stones below the garden.",
            "Birds sang in the hedgerow as the sun came up.",
            "Crickets chirped in the long grass.",
            "An owl, late to bed, hooted once from the oak at the end of the garden.",
            "Waves broke against the sea wall far below the lane.",
            "A train rattled past the end of the platform without stopping.",
            "Rain began to fall hard on the lane as she turned for home.",
        ],
        [(0, "stream", 3), (1, "birdsong", 1), (2, "crickets", 1), (3, "owl", 1), (4, "waves", 1),
         (5, "train-pass", 1), (6, "rain-heavy", 1)],
    ),
    (
        "The city",
        [
            "The city hummed far off, a low wash of traffic.",
            "A car passed slowly on the wet road, its tyres hissing.",
            "The crowd murmured in the square, waiting.",
            "Somewhere a machine hummed behind a warehouse wall.",
            "A gunshot echoed across the river and the murmur stopped.",
            "Footsteps rang on the stone stair below them, running.",
            "Something heavy thudded to the ground behind the wall.",
        ],
        [(0, "city-distant", 2), (1, "car-pass", 1), (2, "crowd-murmur", 2), (3, "machine-hum", 1),
         (4, "gunshot", 1), (5, "footsteps-run", 1), (6, "thud", 1)],
    ),
    (
        "What should stay silent",
        [
            "A storm of protest followed the announcement.",
            "The news hit him like a thunderclap.",
            "No bell rang that morning, and the dog did not bark when the stranger came to the gate.",
            "Years ago, the bells had tolled every Sunday from the hill.",
            "“Did you hear thunder just now?” Lena asked.",
            "Every evening the dog barked at the postman.",
            "The explosion of 1917 flattened two square kilometres of the city.",
        ],
        [],
    ),
]


def call(server: str, path: str, body: dict[str, object] | None = None, method: str | None = None) -> dict[str, object]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        f"{server}{path}", data=data, headers=HEADERS, method=method or ("POST" if data else "GET")
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310 - the local server the user named
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        sys.exit(f"{method or 'POST'} {path} failed: {error.code} {detail[:300]}")
    except urllib.error.URLError as error:
        sys.exit(f"Cannot reach {server}: {error.reason}. Start the app (or npm run dev) first.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the sound-effects listening samples into a running TTSNative.")
    parser.add_argument("--server", default="http://127.0.0.1:8781", help="the local TTSNative server")
    parser.add_argument("--web", default=None, help="the web app's address, when it differs from the server's")
    args = parser.parse_args()
    listed: object = call(args.server, "/api/documents")
    documents = listed if isinstance(listed, list) else listed.get("items", [])  # type: ignore[union-attr]
    for existing in documents:
        if existing.get("title") == TITLE:
            call(args.server, f"/api/documents/{existing['id']}", method="DELETE")
    text = "\n\n".join(
        f"Chapter {number}: {title}\n\n{' '.join(sentences)}" for number, (title, sentences, _) in enumerate(SCENES, start=1)
    )
    document = call(args.server, "/api/documents/text", {"text": text, "title": TITLE})
    doc_id = document["id"]
    sections = document.get("sections", [])
    taken: set[int] = set()
    for section in sections:  # type: ignore[union-attr]
        analysis = call(
            args.server,
            f"/api/documents/{doc_id}/sound-effects/analyse",
            {"sectionIndex": section["index"], "intensity": "immersive"},
        )
        ids = [e["id"] for e in analysis.get("effects", []) if e.get("status") == "suggested"]
        if ids:
            call(args.server, f"/api/documents/{doc_id}/sound-effects/review", {"accept": ids, "dismiss": []})
        taken |= {e["segmentIndex"] for e in analysis.get("effects", []) if e.get("status") != "dismissed"}
        print(f"chapter {section['index'] + 1}: {len(ids)} suggested at Immersive")
    placed = 0
    for section, (_, sentences, placements) in zip(sections, SCENES):
        segments = call(args.server, f"/api/documents/{doc_id}/sections/{section['index']}")["segments"]
        by_text = {s["text"].strip(): s["index"] for s in segments}  # type: ignore[union-attr]
        for number, sound, lasts in placements:
            index = by_text.get(sentences[number])
            if index is None or index in taken:
                continue
            until = by_text.get(sentences[min(number + lasts - 1, len(sentences) - 1)]) if lasts > 1 else None
            body: dict[str, object] = {"segmentIndex": index, "soundId": sound, "position": 0, "offsetMs": 0}
            if until is not None:
                body["untilSegment"] = until
            call(args.server, f"/api/documents/{doc_id}/sound-effects", body)
            placed += 1
    total = len(call(args.server, f"/api/documents/{doc_id}/sound-effects")["effects"])  # type: ignore[arg-type]
    web = args.web or args.server
    print(f"{TITLE!r}: {len(sections)} chapters, {placed} placed by hand, {total} effects in all.")
    print(f"Open {web}/read/{doc_id}, turn Sound effects on in the Sounds tab, and press play.")
    print("The last chapter should have no suggestions; its Sounds tab should say the chapter is quiet.")


if __name__ == "__main__":
    main()
