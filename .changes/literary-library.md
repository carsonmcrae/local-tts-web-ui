---
bump: minor
---

## New

- Organise your library: put documents in folders (nested as deep as you like), gather them in
  collections (a document can be in several), mark favourites, give each one a type and genres, and
  add your own tags.
- The library has a rail of views: all documents, continue reading, favourites, recently added, your
  collections and your folders, with a matching menu on phones.
- Search finds authors, file names and tags as well as titles; filter by genre, type and progress;
  sort by author too.
- Select several documents at once to move, tag, favourite, add to a collection or delete them
  together, or drag a document onto a folder.
- Poems and other verse keep their lines: a line break is read with a short pause and shown as a
  line break, not as a new paragraph.
- Explore: 25 public-domain books come with TTSNative (Alice, Frankenstein, Pride and Prejudice,
  Sherlock Holmes, Poe, Dickinson, Whitman, Douglass, Thoreau and more), grouped by kind, with a
  cover, a description, content notes and where each book's rights stand. Open one and it joins
  your library like any other document; hide the ones you don't want to see. The credits name every
  edition and source.
- Reading experiences: six of the included books come with a curated cast. In the reader, choose
  **Multi-voice** to give Alice, Scrooge, Holmes, Elizabeth Bennet and the rest their own voices
  (from the voices installed on this computer) and to hand untagged lines such as the Raven's
  "Nevermore" to their speaker; **Standard** takes it all out again. Sound effects and music are
  described but arrive with a later version, and nothing starts playing on its own.

## Technical

- Server: migration 14 (`folders`, `document_shelf`, `document_genres`, `document_tags`,
  `collections`, `collection_documents`; `CREATE TABLE IF NOT EXISTS` so parallel branches merge in
  any order), `documents/shelf.py`, `folders.py`, `collections.py`, `shelf_router.py`
  (`/api/library/*`, `PUT /api/documents/{id}/shelf`), library summaries carry `author`, `hasCover`
  and `shelf`; paired LAN devices may use `/api/library`.
- Verse: the `line` boundary (`structures.Boundary`, `audio.PAUSE_SECONDS`, `SegmentOut`), set by
  `html_text.BlockBuilder` for `<br>` inside a paragraph and carried by the HTML page extractor, the
  segmenter and the read-along EPUB export (`<br/>`).
- Web: `api/libraryQueries.ts`, `features/library/{LibraryRail,LibraryFilters,OrganizeDialogs,RailDialogs,views,vocabulary}`,
  the reader draws `<br>` after a `line` boundary. ADR-24 and ADR-25; `docs/architecture/literary-library.md`.
- Catalog: package data in `ltts/library/` (`catalog.json`, 25 text-only EPUBs, 22 covers,
  `CREDITS.md`, about 4 MB) checked against recorded SHA-256 hashes at load and built by
  `scripts/library/build_catalog.py` from `scripts/library/sources.json`; migration 15
  (`bundled_documents`, `hidden_works`); `GET /api/library/works`, `POST …/{work_id}/open`,
  `GET …/{work_id}/cover`, `PUT …/{work_id}/hidden`, `GET …/credits`; `features/explore/`.
- Presets: `ltts/library/presets.py` (schema `ttsnative.immersive-preset/1`, 16-hex sentence-hash
  anchors shared with the sound-effects work, frozen music track ids), six presets in
  `ltts/library/presets/`, migration 16 (`document_presets`), the `speaker` sentence annotation
  kind the planner reads as a tagged line, `GET|DELETE /api/documents/{id}/preset` and
  `POST …/preset/apply`; `api/presetQueries.ts`, `features/reader/ReadingExperience.tsx`;
  `scripts/library/anchor_tool.py` prints anchors for writing presets.
