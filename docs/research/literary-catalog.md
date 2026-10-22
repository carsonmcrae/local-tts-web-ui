# The bundled literary catalog: sources, rights and selection (research record)

Date of the research: 2026-10-21. This records what was read, what was decided and why, for the
25 works that ship with TTSNative (ADR-25, [../architecture/literary-library.md](../architecture/literary-library.md)).
The machine-readable result is `apps/server/src/ltts/library/catalog.json`; the reader-facing credits
are `apps/server/src/ltts/library/CREDITS.md`; the build inputs with every checksum are
`scripts/library/sources.json`.

## 1. Where the texts come from

| Source            | Used for                         | Licence of the edition                                                                                                                                                                                                                                                                                                                                         | Evidence read                                                                                                           |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Standard Ebooks   | 24 works                         | The texts are public domain in the United States; Standard Ebooks releases its own contributions (typography, markup, corrections, metadata) under CC0 1.0, so the edited text can be copied, changed and redistributed without conditions. Cover art is a separate question (section 4). The Standard Ebooks name and logo are trademarks and are not reused. | Each edition's "uncopyright" page and colophon (`src/epub/text/uncopyright.xhtml`, `colophon.xhtml`), the site's terms. |
| Project Gutenberg | 1 work (Dickinson, ebook #12242) | The text itself is public domain; the Project Gutenberg licence applies only to the trademark and the header/footer. Stripping the licence text and the trademark makes the text freely redistributable; the project asks that its name not be used on a derived file, which is why "Project Gutenberg" appears only in the credits, not in the shipped book.  | The licence block of #12242 and the Project Gutenberg Licence (sections 1.C, 1.D, 1.E.1 and 1.E.6).                     |

Every source file was downloaded over HTTPS, hashed, and the hash recorded in `sources.json`; the
build (`scripts/library/build_catalog.py`) refuses a source whose hash has changed. The shipped
EPUBs are text-only rewrites: images, figures, note markers, the publisher's own pages and every
hyperlink are removed, so no shipped file points anywhere.

## 2. Rights, per work

Two questions were answered for each work and recorded in `catalog.json` under `rights`:

1. **United States**: every work was first published before 1930, so it is public domain in the
   United States in 2026 (the 95-year rule). This is what Standard Ebooks and Project Gutenberg
   verify before publishing, and it was re-checked against the first-publication year of each work.
2. **Elsewhere**: being offered by Standard Ebooks or Project Gutenberg says nothing about other
   countries, where copyright runs from the author's death. The catalog therefore states a
   jurisdiction-qualified scope, computed by `_scope` in `scripts/library/build_catalog.py` from the
   latest death year among the people whose work is in the shipped text (`rights.latest_death`):
   - died in 1925 or earlier (`cleared_term_years: 100`): also public domain everywhere copyright
     ends up to 100 years after death, the longest general term in force (Mexico). 17 works.
   - died between 1926 and 1955 (`cleared_term_years: 70`): also public domain wherever the term is
     70 years or less after death (the European Union, the United Kingdom, Brazil, Australia and most
     other countries); the caveat names longer terms such as Mexico (100) and Colombia (80). 7 works:
     The Time Machine and Six Stories (Wells, d. 1946), The Wind in the Willows (Grahame, d. 1932),
     The Hound of the Baskervilles and The Adventures of Sherlock Holmes (Conan Doyle, d. 1930), The
     Innocence of Father Brown (Chesterton, d. 1936), and Poems (Dickinson's editor Mabel Loomis
     Todd, d. 1932).
   - died after 1955 (`cleared_term_years: null`): the United States only, with the caveat naming the
     person. 1 work: Pride and Prejudice follows R. W. Chapman's 1923 Oxford text (Chapman died 1960),
     so his corrections may be protected until 2031 where the term is 70 years after death, while
     Austen's own text (d. 1817) is beyond every term.
   - contributors without recorded dates count only if their work is in the shipped text
     (`affects_text`); the 1904 arrangement of Poe's poems is not reproduced, so it does not.

The statement each work carries is `rights.scope` with `rights.caveat`; Explore shows them on every
card and `CREDITS.md` repeats them. Nothing is marked "public domain everywhere" without the
100-year rule being met. Contributor death years come from the Standard Ebooks metadata
(`dc:contributor` with dates) and, for Dickinson's editors Mabel Loomis Todd (d. 1932) and T. W.
Higginson (d. 1911), from the Gutenberg front matter and standard references. The `verified_on`
date and the `evidence` list for each work are in the catalog so a later check can see what was
looked at.

## 3. Selection

Goals: 15–25 works, a range of kinds (novels, novellas, short-story collections, poetry, essays,
memoir, philosophy), strong recognition, listening-friendly length, and at least six works that
reward a multi-voice or immersive reading. Within that:

- **Collections were trimmed by id** (Poe's stories and poems, Wells's stories, O. Henry, Irving,
  Whitman's poems, Thoreau's and Emerson's essays) so a shipped book is a reasonable listening
  length and the whole catalog stays under 5 MB. The selected chapter ids are recorded in
  `sources.json` and in each work's `edition.selection`.
- **Dickinson** comes from Gutenberg because no Standard Ebooks edition existed at the time; the
  parser (`scripts/library/gutenberg_dickinson.py`) rebuilds the three series as verse chapters.
- **Left out after consideration**: works whose US status is clear but whose authors died after
  1955 (which would make the "worldwide" column mostly red), translations whose translator's dates
  could not be confirmed, and very long novels (Moby-Dick, Middlemarch, War and Peace) whose size
  would have taken most of the package budget for a single title.
- **Content notes** were written for works with violence, cruelty, racism in the historical record
  (Douglass, Washington), or frightening passages (Poe, Shelley, Stevenson), so the Explore page can
  show them before a book is opened.

## 4. Covers

Standard Ebooks covers are public-domain paintings with the publisher's typography. The painting's
status was checked separately from the text:

- 22 covers ship, scaled to 480 px wide with ffmpeg, where the painter died in 1955 or earlier.
- **The Wind in the Willows** ships without its painting: the artist died in 1979, so the image is
  still protected outside the United States.
- **Song of Myself and Other Poems** ships without its painting: the illustrator's dates could not be
  confirmed.
- **Poems (Dickinson)** has no source cover.

A plain generated cover is shown for those three. Standard Ebooks' own typography and logo never
appear in a shipped cover or page.

## 5. Shared vocabularies used by the presets

The six reading presets (`apps/server/src/ltts/library/presets/`) name only sound events from the
sound-effects vocabulary (36 ids, frozen 2026-10-21 with that workstream) and music tracks from the
background-music library (11 ids, frozen the same day). Both lists are copied into
`ltts/library/presets.py` so the schema check does not depend on the other branches being merged
first; when they are, the copies can be replaced by imports.

## 6. What to re-check later

- Each January: nothing changes for these works (all are long past the 95-year line), but a new
  edition revision from Standard Ebooks may fix text errors; rebuilding with a new `source_sha256`
  bumps `text_version`, and presets must be re-anchored with `scripts/library/anchor_tool.py`.
- If a translation is ever added, its translator's death year decides the `worldwide` flag.
