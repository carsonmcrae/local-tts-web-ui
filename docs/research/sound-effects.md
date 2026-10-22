# Sound effects: research and design

> **In short:** sound effects are an optional, off-by-default layer beside the narration, like the
> background music (ADR-18). Effects are detected on the server by deterministic text rules (no
> language model, ADR-6), returned as validated data, reviewed by the reader before they play, and
> played in the browser by a Web Audio graph of their own that follows the narration player from
> outside. Timing anchors are sentences, which narration already times exactly; inside a sentence,
> placement is estimated and said to be so. The starter library is synthesised in this repository,
> so every file is MIT-licensed and reproducible, and nothing new is downloaded or depended on.

Research date: 2026-10-21. Everything read online was treated as untrusted reference material; no
repository was cloned or executed. Numbers come from the GitHub and npm registries on that date.

## What TTSNative already has

- **Narration timing.** Each sentence is its own clip, played one at a time through a single audio
  element (ADR-3). The player exposes the sentence index, the time inside its clip, the clip's
  length, the rate and the status. There are no word timings yet.
- **Voice effects and sounds.** "Telephone", "radio" and the like are per-sentence voice
  treatments rendered on the server (ADR-13), and "sounds" (a laugh, a sigh) are tags for engines
  that perform them. They are unrelated to this feature; the code calls the new layer `sfx` and the
  interface calls it **Sound effects** to keep them apart.
- **Background music** (ADR-18, on `main` since PR #43): a Web Audio graph
  beside the narration, off for every new narration, with bundled CC0 loops under `/music/`. The
  effects layer copies its shape and must merge beside it, not into it.
- **Text analysis** is deterministic (`documents/delivery.py`); documents are data, never
  instructions (ADR-6). A local language model for speaker suggestions is proposed and off (ADR-14).
- **Storage.** SQLite rows per document (bookmarks, sentence annotations) that are deleted with it.
- **Security.** Loopback-only server, CSRF header, strict CSP, sandboxed parsing, no CORS.

## Open-source research

See the tables in [sound-effects-research.md](sound-effects-research.md), gathered on 2026-10-21.
What they mean for the design:

- **Playback: the Web Audio API, no library.** howler.js (MIT) is a mature wrapper, but the app
  already drives Web Audio directly for music, needs gain automation, a limiter and sample-accurate
  loops that the raw API gives, and ships with `ignore-scripts` and a two-week cool-down that a new
  dependency must justify. wavesurfer.js is a waveform editor: inspiration for a timeline later,
  not needed for text-anchored effects.
- **Semantic matching (CLAP) and sound generation (AudioCraft, AudioLDM): rejected for shipping.**
  They need PyTorch and hundreds of megabytes to gigabytes of weights, run slowly on CPU, and their
  weights are non-commercial or unverified for redistribution. They remain research references.
- **Detection: deterministic rules, in the server's existing style.** No NLP library is needed for
  the lexicon-and-context approach; spaCy would add about 500 MB of models for little precision.

## Recommended architecture

Three independent layers, each with its own switch and volume:

| Layer | What                                     | Where it runs                 | Changed by this feature |
| ----- | ---------------------------------------- | ----------------------------- | ----------------------- |
| A     | Narration, highlighting, seeking, voices | `features/player`, the server | No                      |
| B     | Sound effects at sentence positions      | `features/sfx`, `ltts/sfx`    | New                     |
| C     | Background music                         | `features/music` (merged)     | No                      |

### Detection runs on the server, deterministically, on request

- **Where.** The text lives on the server, and so does the deterministic analysis of how sentences
  are read. A chapter is analysed in one request for one section, on an explicit click, never on
  opening a document. Up to 5,000 sentences are analysed per request (the response says when a
  section was cut); a chapter of a thousand sentences takes well under a second, so there are no
  background threads to leave behind. A reader who closes the panel or leaves the page just aborts
  the request. Results are stored and shown as suggestions; nothing plays until accepted.
- **How.** `ltts/sfx/detect.py` reads each sentence (with its quoted parts separated, as the
  delivery analysis does) against an event vocabulary of noun-and-verb patterns ("thunder rumbled",
  "a knock at the door", "the fire crackled"). A match is dropped when the context says it isn't an
  audible event now: negation before, between or just after the words ("no thunder", "the dog did not
  bark", "the thunder never came"), similes and metaphors ("like thunder", "a storm of emotions", "she
  was thunder", "hope knocked at the door of her heart"), imagined or remembered events ("dreamed",
  "remembered", "if only", "had kept a clock"), habits and schedules ("every night", "twice a day",
  "on the half hour"), cessation ("the wind died down"), dated reports (a year in the sentence),
  general statements ("Dogs bark to communicate", "Thunder is the sound…"), questions, headings and
  quoted speech. Context is read within the clause ("he said nothing, and the clock ticked" keeps its
  clock). Each surviving match carries the event, a confidence from the pattern's specificity and the
  character position of the trigger in the sentence. This is detector `rules-2`; `tests/sfx_corpus.py`
  holds 126 labelled sentences across ten kinds of writing and `tests/test_sound_evaluation.py` measures
  it: Minimal and Balanced make no wrong suggestion on the corpus (Balanced finds 93 % of the labelled
  events), Immersive reaches 96 % precision, leaking only figurative uses at its lowest confidence.
- **Restraint.** `ltts/sfx/proposals.py` keeps the best matches under the chosen intensity:

  | Rule                                     | Minimal | Balanced (default) | Immersive |
  | ---------------------------------------- | ------- | ------------------ | --------- |
  | Lowest confidence kept                   | 0.8     | 0.65               | 0.5       |
  | Sentences between any two effects        | 10      | 5                  | 2         |
  | Sentences between two of the same event  | 40      | 20                 | 8         |
  | Suggestions per 100 sentences, at most   | 3       | 6                  | 12        |
  | Longest ambience, in sentences / seconds | 12 / 90 | 20 / 150           | 30 / 240  |

  An event already covered by an effect of any status within two sentences is not suggested again,
  so reanalysis never restores a dismissed suggestion or doubles a manual effect.

- **The gate.** Whatever a detector returns passes through one validator before it is stored: a
  list of at most 300 proposals, each an integer sentence index inside the section, an event from
  the vocabulary, a confidence and a position between 0 and 1, and an optional end sentence for
  ambience. Any other field or value is refused. The sentence excerpt shown in the interface is read
  from the document store by the server, never taken from the detector. A future local model, if
  ever added under ADR-6 and ADR-14, would sit behind this same gate with the same privileges: none.

### The effects player runs in the browser, beside the narration

- **Graph.** `features/sfx/engine.ts`: for each playing effect, a buffer source → its own gain (for
  fades) → the effects bus → a dynamics compressor set as a limiter → the master gain → the
  speakers. The narration never passes through it, so a broken effect can only silence itself.
- **Levels.** Every bundled file is normalised at build time (peak −6 dBFS, loudness about −24 dBFS
  RMS) and carries a recommended gain; the default effects volume is 40 %, Minimal multiplies by
  0.8 and Immersive by 1.15; the limiter catches transients that the gains let through. Speech stays
  on its own element at full level, so no effect can clip or mask it by accident.
- **Limits.** Two one-shot effects and one ambience at once; a third one-shot is skipped, never
  queued. At most twelve decoded buffers are kept (a few seconds of mono audio each, about a
  megabyte), the context is suspended after five idle seconds and closed when the provider unmounts.
- **In the mixer.** The audio mixer in the player has a Sound effects channel: the same switch and
  level as the Sounds panel (which keeps the arrangement), saved on this device like the mixer's
  other levels. The effects and the music each still own an `AudioContext`, built from one shared
  module for the node types, ramps, loop bounds, master gain and loading (`lib/audio/webAudio.ts`)
  and tested with one fake; sharing one context (and one limiter) remains a small later refactor.

### Timing and placement

- **Anchor.** An effect belongs to a sentence and a position inside it: a fraction from 0 (start) to
  1 (end), plus an offset of −1.5 s to +5 s for hand adjustments. Ambience adds an end sentence.
- **Trigger.** While the player is playing sentence _i_, an effect fires once per visit as soon as
  the clip's time passes `fraction × duration + offset`, and only within 1.5 s of that moment; a
  sentence entered later than that skips the effect rather than playing it late. The end of a
  sentence is reached either when the time passes `duration − 0.25 s` or when the player advances.
- **Precision.** At sentence boundaries, timing is exact to one `timeupdate` tick (about 250 ms).
  Inside a sentence, the fraction is estimated from where the trigger word sits in the text; speech
  is not linear in characters, so this is the bounded fallback the feature promises: typically
  within half a second on a ten-second sentence, worse on very long ones. Suggestions whose trigger
  is in the first fifth of the sentence snap to its start. When word timings exist (ADR-3's deferred
  work), the fraction becomes exact without a schema change.
- **Following the player.**

  | Narration does               | Effects do                                                          |
  | ---------------------------- | ------------------------------------------------------------------- |
  | Pauses                       | One-shots fade out in 0.25 s and don't resume; ambience fades out   |
  | Resumes                      | Ambience fades back in; one-shots already passed are not replayed   |
  | Seeks or skips a chapter     | Everything stops; entering a sentence inside an ambience starts it  |
  | Replays a sentence           | A fresh visit: its effects fire again                               |
  | Changes speed                | Nothing: triggers compare media time, which the rate already scales |
  | Changes voice or regenerates | Nothing: anchors are sentences; durations are read from the player  |
  | Ends or unloads              | Everything fades out; the switch turns off for the next narration   |

### Storage: a validated, versioned arrangement per document

- Table `sound_effects`: id, document, sentence, position, offset, end sentence (ambience), event,
  sound id, volume, origin (`suggested` or `manual`), status (`suggested`, `accepted`, `dismissed`),
  enabled, confidence, a 16-character hash of the sentence's text, detector version and timestamps.
  Table `sound_analyses`: per document and section, when and how it was last analysed.
- Rows are deleted with their document (foreign-key cascade) and the only document-derived data
  kept is the short text hash. The API joins each effect to its current sentence and marks it
  **stale** when the hash no longer matches, in which case it is listed with a notice and not played.
- Nothing is ever written into the document's file; the document's text is never changed.
- Dismissed suggestions stay as rows so that reanalysis cannot bring them back; manual effects are
  never touched by analysis. Portable export and import of arrangements is not in this release.

### User controls

A **Sounds** tab in the reader's side panel (a dialog on phones):

- **Sound effects** switch: off for every narration, never stored. **Volume** and **Intensity**
  (Minimal, Balanced, Immersive) are kept on this device, like the music choice.
- **Analyse this chapter** runs detection for the section being viewed and lists suggestions, each
  with its sentence, the suggested sound, where it falls, **Preview**, **Accept**, **Dismiss** and
  **Replace**. **Accept all** is a quiet secondary action at the end of the list.
- **Add an effect** opens the library: browse by category, search by keyword, preview, insert at the
  sentence being read (start or end, with a delay), with its own volume.
- Effects in the document show who placed them (**Suggested** or **Added by you**) and can be turned
  off singly, adjusted, replaced or removed. The sentence being read shows a small marker for each.

### Security boundaries

- Document text → detector → validation gate → database → API → player. No step carries anything
  executable; the only strings a detector can produce are vocabulary members, and excerpts come
  from the store. The `ltts.sfx` package imports no process, network or file-writing modules (a test
  checks the source). Analysis touches only its own tables (a test compares preferences and styling
  before and after).
- Sound ids match `^[a-z0-9][a-z0-9-]{0,39}$` and must exist in the catalogue; files are addressed
  only through the catalogue's own file names under `/sfx/`, so no stored value can form a path.
- The player fetches only same-origin `/sfx/` URLs it built itself; a file that fails to decode is
  skipped with a notice and the narration carries on.
- No new dependency: Web Audio, NumPy and soundfile are already present. The library build uses
  NumPy and soundfile only.
- The desktop installer and LAN mode serve the files as static assets like the music; nothing is
  exposed that wasn't.

### Performance budget

Detection under 200 ms per thousand sentences on CPU, measured by a test; decoded buffers under
12 MB; bundled sounds about one megabyte of MP3; no measurable change to narration start, which the
effects provider never blocks (it subscribes to the player and nothing else).

## The sound library

The starter set is **synthesised** by `scripts/media/sound-library.py` with NumPy and encoded with
soundfile: shaped noise, resonators, impulses and envelopes with fixed seeds, so every file is
reproducible from the repository, owned by the project under its MIT licence, and free of any
third-party rights question. This was chosen over downloading recorded foley because every
downloaded sound needs its licence read and recorded by hand, the task forbids bulk downloads, and
the session could not ask the owner to approve each file. The trade-off is realism: weather, water,
fire, wind, crowds, bells, clocks and impacts synthesise well; a creaking door, hooves and animals
are recognisable but plainer than a recording. The manifest (`ltts/sfx/library.json`) and
`apps/web/public/sfx/CREDITS.md` already carry the fields a recorded sound needs (source, licence
with its evidence and date, permissions), so a later pack of verified CC0 recordings slots in
without a schema change. Listening notes for each synthesised sound are in the completion report.

## Phases

1. **This document** and ADR-22.
2. **Manual effects:** library, engine, scheduler, store, API, the Sounds tab with Add, adjust,
   remove and preview; persistence and cleanup.
3. **Suggestions:** detection, the gate, intensity filtering, the review list, reanalysis that keeps
   every edit, caching per section.
4. **Hardening:** security tests with harmless injection payloads in text, PDF and EPUB, malformed
   detector output, corrupt and missing assets, resource limits; performance measurements; listening
   checks in a real browser; documentation.

## Not in this release

Effects in exported audio (like music, exports would need the same mixing on the server),
importing a reader's own sounds, automatic analysis on opening, undo and redo (the app has none),
word-accurate placement, and any language model.
