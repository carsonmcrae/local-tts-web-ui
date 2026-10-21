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
