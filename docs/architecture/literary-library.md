# The literary library: organisation, bundled books and immersive presets

> **In short:** readers organise everything in the library with folders, collections, genres, types
> and tags (ADR-24); the app ships a small catalog of public-domain books that are read through the
> ordinary sandboxed pipeline when opened (ADR-25); and a few of those books carry an _immersive
> preset_, data that recommends voices, speakers, sound effects and music through durable text
> anchors and stable identifiers. This document is the design and the **contract shared with the
> other features** (voices and casts, sound effects, background music, the Windows app). Section 6
> records those contracts.

Characters and casts are the voice features' own (ADR-13); the library only writes into their rows.
Research and licensing evidence: [../research/literary-catalog.md](../research/literary-catalog.md).

## 1. Pieces

| Area                 | Location                                                                                        | Role                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organisation storage | `apps/server/src/ltts/documents/shelf.py`                                                       | Folders, collections, genres, types, tags, favourites; the facets the library listing carries.                                                       |
| Organisation API     | `apps/server/src/ltts/documents/shelf_router.py`                                                | `/api/library/folders`, `/api/library/collections`, `/api/library/tags`, `/api/library/organize`, `PUT /api/documents/{id}/shelf`.                   |
| Catalog data         | `apps/server/src/ltts/library/` (`catalog.json`, `works/`, `covers/`, `presets/`, `CREDITS.md`) | The bundled works, their rights and their presets. Built by `scripts/library/build_catalog.py`.                                                      |
| Catalog service      | `apps/server/src/ltts/library/catalog.py`, `library/router.py`                                  | Lists works, opens one as a document (through `DocumentService`), hides works, serves covers and presets.                                            |
| Presets              | `apps/server/src/ltts/library/presets.py`, `library/preset_service.py`                          | The format and the anchors; the report, applying chosen components (voices, speaker lines, sound-effect rows, the music record) and taking them out. |
| Web: organisation    | `apps/web/src/features/library/`                                                                | Sidebar (All, Continue, Favourites, Recent, Collections, Folders), filters, cards, bulk actions.                                                     |
| Web: Explore         | `apps/web/src/features/explore/`                                                                | Included books by category, featured experiences, open/hide.                                                                                         |
| Web: experience      | `apps/web/src/features/reader/ReadingExperience.tsx`                                            | Standard / Multi-voice / Immersive chooser for a bundled book with a preset.                                                                         |

## 2. Storage

All new tables are additive and deleted with their document by foreign key. Migrations use
`CREATE TABLE IF NOT EXISTS`, but that alone does not make two branches' migrations safe: the list is
positional (`PRAGMA user_version` counts entries), so a database that ran one branch's entry 14 would
skip the other's once the lists are merged. Numbers are therefore agreed before a branch merges:

| Numbers | Owner                                         | State on 2026-10-21                                                                       |
| ------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1–13    | `main`                                        | shipped (1 in v2.0.0; 2–13 on main through PRs #37 and #38)                               |
| 14–16   | `feat/literary-library` (this document)       | this pull request                                                                         |
| 17      | `feat/sound-effects` (ADR-22)                 | landed as 17 (feat/sound-effects rebased onto this PR); its presets import the vocabulary |
| none    | `feat/background-music`, `feat/voice-library` | no migrations                                                                             |

`apps/server/tests/test_db_migrations.py` pins the registry length, the tables each of 14–16 creates,
and upgrades from databases at versions 1, 5 and 13 with their rows intact; the next owner updates the
length when their migration lands.

### Migration 14: organisation (ADR-24)

```sql
folders(id PK, parent_id → folders ON DELETE CASCADE, name, position, created_at)
document_shelf(document_id PK → documents, folder_id → folders ON DELETE SET NULL,
               document_type, favorite, favorited_at)
document_genres(document_id → documents, genre, PK(document_id, genre))
document_tags(document_id → documents, tag, tag_key, PK(document_id, tag_key))   -- tag_key = casefolded
collections(id PK, name, description, position, created_at)
collection_documents(collection_id → collections, document_id → documents, position, added_at,
                     PK(collection_id, document_id))
```

Rules: a folder cannot be moved under itself or a descendant (checked on write, 409
`folder_cycle`); at most 8 levels deep; deleting a folder moves its documents (and its
subfolders' documents) to its parent and deletes the subfolders; deleting documents is a separate,
confirmed action through the existing `DELETE /api/documents/{id}`. Tags are stored as typed and
unique per document by `tag_key`; the tag list reports the most common spelling.

### Migration 15: bundled works (ADR-25)

```sql
bundled_documents(document_id PK → documents, work_id UNIQUE, edition_id, content_sha256,
                  catalog_version, text_version, added_at)
hidden_works(work_id PK, hidden_at)
```

### Migration 16: presets (ADR-25)

```sql
document_presets(document_id PK → documents, preset_id, preset_version, components_json, applied_at)
```

`components_json` lists the components applied (`narrator`, `characters`, `speakers`, `effects`,
`music`) and what each wrote (voice ids per character, sentence indexes per speaker annotation), so
the reader can go back to the preset or see what they changed. For `music` it records the recommended
track and level only: which track a device plays is the web app's own setting on that device.

## 3. The catalog

`catalog.json` (`"schema": "ttsnative.literary-catalog/1"`) carries `catalog_version` (an integer
bumped on every content change) and a list of works. Per work:

| Field                            | Meaning                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work_id`                        | Canonical slug (`alices-adventures-in-wonderland`); never changes once shipped.                                                                                                                                                                                                                                                                       |
| `title`, `sort_title`            | Display title (typographic apostrophes kept) and the title to sort by.                                                                                                                                                                                                                                                                                |
| `authors[]`                      | `name`, `sort_name`, `born`, `died`, `wikipedia`.                                                                                                                                                                                                                                                                                                     |
| `contributors[]`                 | Translators, editors, illustrators: `role`, `name`, `died`, `note` (for example "illustrations omitted").                                                                                                                                                                                                                                             |
| `first_published`, `language`    | Year of first publication; BCP 47 language of the text.                                                                                                                                                                                                                                                                                               |
| `document_type`, `genres[]`      | From the vocabularies in ADR-24.                                                                                                                                                                                                                                                                                                                      |
| `description`, `content_notes[]` | One or two sentences; notes for difficult or dated material, shown before opening, never altering the text.                                                                                                                                                                                                                                           |
| `word_count`, `chapters[]`       | Words in what ships; `chapters` is `{id, title}` in reading order (`id` is the edition's file stem, `chapter-1`).                                                                                                                                                                                                                                     |
| `edition`                        | `edition_id`, `source`, `source_url`, `source_revision`, `source_released`, `source_file`, `source_sha256`, `source_bytes`, `transcription[]`, `changes[]`, `selection` (null, or `{from, items[]}` when only some pieces of a collection ship, each item its file stem and title).                                                                   |
| `file`, `bytes`, `sha256`        | The shipped EPUB and its checksum. `text_version` increases when the shipped text changes.                                                                                                                                                                                                                                                            |
| `cover`                          | `file`, `bytes`, `sha256`, `artwork` (painting, artist, year, status), `design` (who composed it, licence), or null.                                                                                                                                                                                                                                  |
| `rights`                         | `status` (`public-domain-us`), `worldwide` (true when every author and contributor died over 70 years ago), `basis`, `licence {name, url}`, `evidence[]`, `verified_on`, `permits {redistribution, modification, commercial, performance}`, `attribution_required`, `attribution`, `trademark_note`, `limits` (text shown when `worldwide` is false). |
| `featured`                       | Null, or `{preset_id, blurb}` for a book shown under **Featured experiences**.                                                                                                                                                                                                                                                                        |
| `preset_version`                 | The included preset's version, or null.                                                                                                                                                                                                                                                                                                               |

`edition_id` is `standardebooks:<path>@<revision>` or `gutenberg:<number>@<file-sha256-prefix>`.
`CREDITS.md` lists every work with its source, transcription, cover artwork and the edition's
dedication, and credits Standard Ebooks and Project Gutenberg as sources (a courtesy credit; neither
licence requires it and neither name is used as a publisher or in the interface).

### Building

`node scripts/uv-run.mjs --cwd apps/server run --frozen python -I scripts/library/build_catalog.py --sources <dir>`
reads `scripts/library/sources.json` (the curated list: edition URL, expected SHA-256, selection,
metadata, rights) and the downloaded source files, checks each checksum, rewrites the EPUB (drops
images, figures, the list of illustrations, imprint, colophon, uncopyright, title page, endnotes and
note references; keeps everything else; applies the selection), scales the cover with ffmpeg,
extracts the text once with the app's own extractor to count words and chapters, and writes
`catalog.json`, the works, the covers and `CREDITS.md`. A Project Gutenberg text is converted to an
EPUB with the same verse markup Standard Ebooks uses, after its header and footer are removed.
Nothing is downloaded by the build; sources are fetched by hand, one file at a time, and recorded.

### Opening a work

`POST /api/library/works/{work_id}/open` copies the EPUB into `data/tmp`, calls
`DocumentService.ingest_file` (sniffing, the sandboxed extractor, segmentation, cleanup), fills
`document_details` (author, description) and the cover from the catalog, links the document in
`bundled_documents` and returns the `DocumentDetail`. If the work already has a document, that
document is returned. The listing marks bundled documents (`bundled: {workId, catalogVersion}`),
and removing one is the ordinary document deletion with wording that says the book stays in Explore.

## 4. Verse

`<br>` inside a paragraph ends a sentence with the new boundary `line` (`PAUSE_SECONDS["line"] =
0.42`); the next line keeps the same `paragraph_index`, so the reader draws a line break, not a new
paragraph, and read-along EPUB exports write `<br/>`. Sentence boundaries inside a line are
unchanged. Nothing stored for existing documents changes.

## 5. Immersive presets: the shared contract (version 1)

A preset is a JSON file, `"schema": "ttsnative.immersive-preset/1"`, validated by
`ltts/library/presets.py` (pydantic, `extra="forbid"`) and by `tests/test_library_presets.py`.
It is data about a book; nothing in it is executed, and it never changes the book's text.

```jsonc
{
  "schema": "ttsnative.immersive-preset/1",
  "preset_id": "alices-adventures-in-wonderland-immersive", // ^[a-z0-9][a-z0-9-]{2,79}$
  "preset_version": 1, // bumped on every change
  "work_id": "alices-adventures-in-wonderland",
  "edition_id": "standardebooks:lewis-carroll/alices-adventures-in-wonderland/john-tenniel@9ecdf2f",
  "text_version": 1, // the catalog text the anchors were made against
  "title": "Wonderland, fully voiced",
  "summary": "Alice, the Rabbit, the Hatter and the Queen in their own voices, with a few quiet sounds.",
  "narrator": {
    "voice": { "preferred": "kokoro:bf_emma", "fallbacks": ["kokoro:af_heart"] },
    "note": "...",
  },
  "characters": [
    {
      "id": "alice",
      "name": "Alice",
      "aliases": ["Alice"],
      "description": "The heroine, seven years old.",
      "voice": { "preferred": "kokoro:af_bella", "fallbacks": ["kokoro:af_sarah"] },
    },
  ],
  "speakers": [
    {
      "anchor": {
        "chapter": "chapter-1",
        "hash": "9f2c1a3b4d5e6f70",
        "quote": "“Oh dear! Oh dear! I shall be late!”",
        "occurrence": 1,
      },
      "speaker": "white-rabbit",
      "scope": "quoted",
      "confidence": "verified",
      "provenance": "curated",
    },
  ],
  "effects": [
    {
      "id": "ch1-fall",
      "anchor": { "...": "as above" },
      "end_anchor": null,
      "event": "wind-rushing",
      "category": "ambience",
      "intent": "A faint rush of air while Alice falls.",
      "sound_id": null,
      "position": 0.0,
      "offset_s": 0,
      "duration_s": 6,
      "volume": 30,
      "fade": { "in_s": 1.0, "out_s": 2.0 },
      "loop": false,
      "provenance": "curated",
      "review": "proposed",
    },
  ],
  "music": {
    "recommendation": {
      "track_id": "contemplation",
      "volume": 10,
      "note": "Sparse and unhurried.",
    },
    "chapters": [{ "chapter": "chapter-7", "track_id": "waiting", "volume": 10 }],
  },
}
```

### 5.1 Identifiers and who owns them

| Identifier                    | Format                                                           | Owner (feature)  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `work_id`                     | `^[a-z0-9][a-z0-9-]{2,79}$`                                      | literary library | Canonical, never reused.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `edition_id`                  | `source:path@revision`                                           | literary library | A new revision is a new edition; anchors are checked against `text_version`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| chapter id                    | File stem of the edition's spine item (`chapter-3`, `the-raven`) | literary library | Informational in anchors (display and disambiguation); resolution is by sentence hash.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| character id                  | `^[a-z0-9][a-z0-9-]{0,39}$`, unique within a preset              | literary library | `name` is what the dialogue analysis (`documents/delivery.py`) must find for tag-based casting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| voice reference               | `{preferred: voice_id, fallbacks: [voice_id…]}`                  | voice library    | `voice_id` matches `^[a-z]+:[A-Za-z0-9_\-]+$` (`kokoro:af_heart`). Only built-in, shipped voices appear in a preset; custom voices never do (a custom voice is personal and is deleted with its profile). Availability is checked with `VoiceInfo.available` / `EngineRegistry.resolve` before anything is written; if no voice in the list is available, the component is skipped and reported, never guessed. The voice library adds an additive `attribution` string to `VoiceInfo` and an English-only spoken-text rewrite after planning; neither changes stored text or anchors.                                                                                                                                                                                                     |
| `track_id`                    | `^[a-z0-9][a-z0-9-]{0,39}$`, from `features/music/library.json`  | background music | Frozen on 2026-10-21, and `tests/test_library_presets.py` fails when the server's copy and `library.json` differ: `contemplation`, `calm-ambient`, `rising-moon`, `warriors-lament`, `waiting`, `washed-up`, `currents`, `gymnopedie-1`, `vaporware`, `soft-rain`, `brook`. A preset only _recommends_; music stays off at the start of every narration (ADR-18) and only the player's Background music switch turns it on, so preset copy never says music "will play". Accepting a recommendation calls `useMusic().music.selectTrack(id)` and `setVolume(v)` (saves the device choice, starts nothing). Volume guidance: the files sit at −28 LUFS, 10 % is about 22 dB under the narration, 20–30 % still clearly under it, above 50 % competes. Unknown track: ignored with a notice. |
| `sound_id`                    | `^[a-z0-9][a-z0-9-]{0,39}$`, from the effects catalogue          | sound effects    | `null` until the catalogue exists; `event` and `category` describe the intended sound for mapping.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `event`                       | `^[a-z0-9][a-z0-9-]{0,39}$`                                      | sound effects    | Free text here until the detector's vocabulary is published; then validated against it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `preset_id`, `preset_version` | slug, integer                                                    | literary library | A reader's changes are stored apart from the preset (`document_presets` and the ordinary tables), so an updated preset never overwrites them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 5.2 Durable text anchors

An anchor names one sentence of the work without depending on sentence numbers:

- `hash`: the first 16 hex characters of SHA-256 over the sentence's stored text with whitespace
  collapsed to single spaces and trimmed (UTF-8). This is also the field the sound-effects feature
  stores per effect to detect a changed sentence, so both can be compared directly.
- `quote`: the first 80 characters of that text, for people and for fallback matching.
- `occurrence`: when the same text appears more than once in the work (short lines such as
  "Yes."), which one, counting from 1 in reading order.
- `chapter`: the chapter id, informational.

Resolution (`presets.resolve`): all segments whose hash matches, then the `occurrence`-th; failing
that, segments whose text starts with `quote` (same occurrence rule); failing that, **unresolved**.
Unresolved anchors are reported and skipped, never guessed. An effect with an `end_anchor` is an
ambience spanning sentences; its end must resolve after its start.

### 5.3 Positions and timing (effects)

Follows the sound-effects design (ADR-22) and, after its reply of 2026-10-21, its stored shape:
`position` is a fraction of the sentence's clip (0 = start, 1 = end); `offset_ms` is −1500 to
5000; an ambience has an `end_anchor` (the sound-effects store keeps it as `until_segment`, at most
60 sentences after the start; its player caps a run at 90/150/240 s by intensity); `volume` is a
whole-number percent of the sound's own recommended level (100 = as recommended, 0–150); fades are
the player's (one-shot 0.02 s in; ambience 1 s in, 0.8 s out) and are not stored. `event` comes from
`ltts/sfx/events.py` (`EVENT_IDS`, 36 ids such as `door-creak`, `thunder-distant`, `rain-light`,
`crowd-murmur`) and `sound_id` from `ltts/sfx/library.json` (today every sound id equals its event
id). Applying the `effects` component places each annotation as a row the experience owns
(`origin: preset`, `status: accepted`, since choosing the experience is the acceptance; `detector:
preset:<preset_id>@<version>`): the anchor resolves to the sentence index (hash first, the quote only
for the preset's own edition; an anchor that doesn't resolve is skipped and counted, never guessed),
the sentence's hash is kept for staleness, `volume` is stored as `round(gain × volume)` of the
sound's own level, and an ambience lasts to its `end_anchor` when that resolves at or after the
start, else `start + max(1, round(duration_s / 4))` sentences, within the store's 60 and the
document's end. The store skips a sentence that already carries an accepted effect (`occupied`), a
sound the catalogue marks experimental (`experimental`: such sounds are the reader's to add by hand,
never an experience's), a row it would refuse (`invalid`) and rows past its cap (`limit`); applying
again replaces the
experience's rows; a reader's edit makes a row theirs (`manual`); a reader's removal is a removal
until the experience is applied again; removing the experience deletes only its rows (ADR-22's
addendum). Positions inside a sentence are estimates until word timings exist.

### 5.4 Speakers

A speaker annotation gives one sentence to a character. `scope` is `quoted` (only the quoted
speech, the narration keeps the narrator: ADR-13's `parts`) or `sentence` (the whole sentence).
`confidence` is `verified` (a person checked it), `likely` or `uncertain`; only `verified` and
`likely` are applied. Applying the `characters` component writes `document_characters` (every name
and alias of a character → the first of its voices that is installed here; a character with none
installed is skipped and the report says so). Applying `speakers` writes `segment_annotations`: a
`quoted` line gets a `speaker` row naming the character, which the planner (`styling.plan`) treats
as a tagged dialogue line, so it is read in that character's voice and the narration around it keeps
the reader's; a `sentence` line gets a `voice` row with the character's voice, the same row a
reader's own **Voice & effect** choice writes. Removing the preset deletes exactly the rows it wrote
(recorded in `document_presets.components_json`); applying again removes first, so there is never a
mix of two versions. Over HTTP: `GET /api/documents/{id}/preset` (the report: voices found here,
anchors that resolve, components with `available` and `applied`), `POST …/preset/apply`
(`{"components": [...]}`; `effects` places rows in the sound-effects store as 5.3 says, and the
report's `effects_placed` counts them;
`music` is recorded as chosen and writes nothing else, because the track a device plays is the web
app's setting there: **Use this track**, and choosing Immersive, call `useMusic().music.selectTrack(id)`
and `setVolume(level)` on that device, and nothing turns music on) and `DELETE …/preset`.

### 5.5 What applying a preset may and may not do

- May: write character voices, sentence voice annotations, sound-effect rows the experience owns,
  and the recorded list of what it wrote (for music, the recommended track and level only); set the
  narrator as the document's suggested reading voice for the session.
- May not: start playback, turn on music or effects, change the text, change preferences, write
  outside the document's own rows, touch a sound-effect row the reader placed, accepted, dismissed
  or edited, or touch another document.
- Updates: the report carries the shipped `preset_version` and the `applied_version`; nothing is
  applied until the reader chooses again, and choosing replaces what the earlier version wrote while
  every row the reader wrote themselves stays.

## 6. Integration contracts

The library meets four other features. What each owns, and what this one relies on, is recorded
here so that a change to a shared format is announced in this document first (section 5.1).

### 6.1 Voices and characters

Presets name built-in voice ids only (`^[a-z]+:[A-Za-z0-9_-]+$`; an id never changes meaning), each
with fallbacks; a character none of whose candidates is installed is listed as such and skipped,
never guessed. Character-to-voice assignments live in `document_characters` and speaker lines in
`segment_annotations`, the same rows the reader's own choices use, so the planner needs nothing
preset-specific. `VoiceInfo.attribution` carries a voice's credit. No voice is bundled without
licensing and synthetic-use authorisation. ADR-24 and ADR-25 are this feature's; ADR-23 belongs to
the voice library.

### 6.2 Sound effects

Both features identify a sentence by the same 16-character hash of its text (`sentence_hash` here,
`text_hash` in `ltts/sfx/store.py`), so anchors and staleness agree. Presets name events from the
sound-effects vocabulary (`ltts/sfx/events.py`, `CATEGORY_OF`, checked at load) and sounds from its
catalogue (`ltts/sfx/library.json`; the event's default sound when a preset names none). The stored
shape and the rows an experience places are in section 5.3 and ADR-22's addendum: origin `preset`,
status `accepted`, the experience's identity in `detector`, replace-and-skip-occupied, a reader's
edit makes a row `manual`, a reader's removal is a removal until the experience is applied again,
removing the experience deletes only its rows, sounds the catalogue marks experimental are never
placed, nothing turns the Sound effects switch on, and no migration (the columns are text). The
sound-effects feature owns `ltts/sfx/store.py` and its rules; the preset service only calls
`apply_preset` and `remove_preset`.

### 6.3 Background music

Presets name tracks from `apps/web/src/features/music/library.json`; `tests/test_library_presets.py`
fails when the server's copy of the ids and that file differ. A recommendation is data: the report
carries the track, level and note, applying `music` records the choice and writes nothing else, and
the web app's **Use this track** (and choosing Immersive) calls `useMusic().music.selectTrack(id)`
and `setVolume(level)` on that device, never `setEnabled`. Copy never says music "will play": it
stays off until the reader turns it on in the player. Levels: the tracks sit at about −28 LUFS, so
10 % is about 22 dB under the narration.

### 6.4 The desktop app and releases

The catalog ships as package data inside the `ltts` wheel (`ltts/library/`, about 4 MB, read with
`importlib.resources` and never written), so the installer needs no extra step and opening a work
is download-free. `scripts/desktop/notices.mjs` has a section for the included books that points at
`ltts/library/CREDITS.md`. `scripts/desktop/persistence-test.mjs` opens a bundled work, applies its
whole reading experience, organises the library (a folder, a collection, a document's facets) and
hides a work before a restart, then checks that all of it survives an upgrade; the document list
never grows by itself. API shapes and the `ltts.librarySort` setting are kept. The site's
screenshots come from `scripts/capture-screenshots.mjs` against the running app, never from
mock-ups.

### 6.5 Studio voices

Six rules keep the two apart: presets name built-in voice ids only; audio is keyed through
`resolve()`, so a preset never changes cache keys; package data is read with `importlib.resources`
and never written; voice data stays under `data/voices/`; opening a work stays download-free; and
the synthesis worker interleaves a book's sentences with any other job.

### 6.6 Shared rules

- Field ownership: section 5.1. A change to an owned format is announced in this document first.
- Migrations: `CREATE TABLE IF NOT EXISTS`; never alter another feature's tables (section 2).
- Document text is data (ADR-6): presets, catalog entries and annotations never carry anything
  executable, and every value is validated against a pattern or a vocabulary before it is stored.
- Preset tests validate against the real voice list, music library and sound catalogue; a passing
  test claims what it checked, not end-to-end immersive playback.

## 7. Testing

- Catalog: every work's file exists with its recorded size and SHA-256, parses through the app's own
  EPUB extractor without warnings, has its chapters, title and author, a cover of the recorded type,
  rights with evidence and a date, no external resources (`http` in the EPUB's XHTML), and no
  Standard Ebooks branding files; verse chapters keep their line boundaries.
- Organisation: folders (create, rename, nest, move, cycle refused, depth limit, delete keeps
  documents), collections (membership in several, delete keeps documents), tags (case-insensitive,
  limits), shelf facets in the listing, bulk operations, migration from a database of the previous
  version with documents, progress, bookmarks and styling intact.
- Presets: schema validity (every shipped preset), anchor resolution against the shipped text (every
  anchor resolves, each once), voice fallbacks, unknown track and sound ids reported not applied,
  apply and remove leave exactly the recorded rows, updates do not touch a reader's own rows.
- Security: the bundled EPUBs run through the same hostile-archive checks as uploads; the catalog
  loader refuses a work whose file hash does not match; opening a work is limited per LAN device like
  an upload; the catalog router accepts only known `work_id`s (pattern plus catalog lookup).
