# Sound effects: completion report

> **In short:** the optional sound-effects layer is built on branch `feat/sound-effects`, five linear
> commits on `main` as of PR #48 (the desktop release, voices and LAN, background music and the
> literary library are all underneath it), with phases 1 to 4 of the plan done to the extent the
> repository's own gates can prove. The migration is entry 17, after every released one, and is
> tested as an upgrade from each shipped database version; paired phones can use the feature; the
> effects have their channel in the audio mixer beside the music; the detector is at
> `rules-2` and measured on a labelled corpus; a listening panel and a seeded sample document are
> ready for the one judgement no test can make, which is whether the synthesised sounds are worth
> hearing. Nothing was pushed, merged into `main`, tagged or published.

Date: 2026-10-22. Design: [sound-effects.md](sound-effects.md); research tables:
[sound-effects-research.md](sound-effects-research.md); decision: ADR-22; user guide:
[docs/wiki/Sound-Effects.md](../wiki/Sound-Effects.md); release entry: `.changes/sound-effects.md`;
listening panel: [sound-effects-listening.html](sound-effects-listening.html).

## Where the branch stands

- **Base and main.** The branch was rebuilt as five linear commits (docs, server, library, web, mixer)
  on `main` at f6ff075 (the merge of PR #48), with no merge commits; the earlier history (merges of
  `main` after PRs #37, #38 and #40) is kept in local backup refs only. The queue agreed with the
  other sessions is #57 (review fixes) and then this branch, with one more rebase when #57 lands.
- **Conflicts resolved at the PR #38 merge (ten files, all both-sides-append):** README (both feature
  bullets), `app.py` and `container.py` (the effects router and store appended to main's lists),
  `types.ts` (both sets of aliases; the new ones are prefixed `Sfx` and never collide with main's
  `SoundEffect`, which is a voice treatment), `App.tsx` (main's routes and pairing redirect, with
  `SfxProvider` inside `PlayerProvider`), `DocumentText.tsx`, `ReaderParts.tsx` and `ReaderPage.tsx`
  (the `effects` prop beside main's new `styled` and `skipped` props, the hidden descriptions of a
  sentence's voice, skipped state and sound effect combined, and the active index computed once so the
  reader stays under the complexity cap), `index.css` (both rule sets; the effect tint now sets only
  the background colour so main's styled foot line survives on the same sentence) and
  `schema.gen.ts` (regenerated with `npm run api:types`, never hand-merged). `db.py` and
  `decisions.md` merged automatically; the migration list needed the correction below. PR #40 merged
  without conflicts.
- **Migration number.** `MIGRATIONS` is positional. `main` had thirteen entries when this branch was
  first merged with it and git had placed the sound-effects script sixth without a conflict, which
  would have re-run main's thirteenth script on every shipped database; it was moved to the end by
  hand. The literary library (PR #48) then added 14 to 16, so the script (`sound_effects`,
  `sound_analyses`, both `IF NOT EXISTS`) is entry **17** now; its content never changed. Two
  development databases made before the move were deleted (they held one pasted test story of mine,
  nothing of the owner's).
- **Upgrade tests** (`tests/test_sound_effects_migration.py`): the script is the last entry and the only
  one naming its tables, every statement in it guarded; databases at `user_version` 1 (v2.0.0), 5 (the
  first desktop release), 13 (the voices and LAN release) and 16 (the literary library) upgrade to the
  current version with their
  documents, sentences, reading progress, voice profiles and preferences compared row for row before
  and after, a second `migrate()` changes nothing, a fresh file is created at the current version, and
  a development database that already has the tables keeps its rows. No released migration was
  rewritten.
- **Paired phones.** Main's LAN policy lists what a paired device may reach; the six document routes
  were already under the allowed prefix but the library listing was not, so a phone would have shown
  every effect as missing from the library. `GET /api/sound-effects` is now allowed for paired devices
  and the seven routes are in the policy test's reachable set.

## Audio architecture

- **Three layers, each following the player from outside.** Narration stays a single audio element
  under `PlaybackController`. Effects are their own Web Audio graph (source → fade gain → limiter →
  master gain → speakers) that subscribes to the controller: `playing` and `loading` count as
  narrating, `paused` and `error` stop one-shots and pause ambience at once, a new document or `ended`
  turns effects off. The effects engine never calls play or pause on the controller, never touches the
  audio element's volume, suspends its context after five idle seconds and disposes it on unmount.
  Background music (PR #43, not on `main`) follows the same pattern with its own context, so the
  three never compete over pause and resume, context lifetime or the narration's level; a browser's
  limit on audio contexts is not approached with two.
- **Mixer channel (done once PR #43 landed).** The audio mixer now has a Sound effects channel after
  the music channel, as the music branch's contract asked: a `VolumeControl` named "Sound effects"
  with the switch as its action, the same switch and level as the Sounds panel, the mixer button's
  name and highlight saying when effects are on, and the saved level and intensity kept through
  `lib/deviceSettings` like the other channels. The pieces the two engines shared (node types, the
  parameter ramp, loop bounds, the master gain, one load per id) moved to `lib/audio/webAudio.ts`,
  the two sessions follow the player through one `followPlayer` helper, and one fake context in
  `src/test/audio.ts` serves both engines' tests; the duplication gate is back at zero clones. The
  two contexts stay separate; one shared context and limiter is still a later change.

## Detection quality

The detector is now `rules-2`. Beyond `rules-1` it rejects negation between or just after the words
that make a sound ("the dog did not bark", "the thunder never came"), reads context only within the
clause ("he said nothing, and the clock ticked" keeps its clock), rejects abstract subjects and
complements ("hope knocked at the door of her heart", "the door of morning"), predicate metaphors
("she was thunder", "the city was a machine"), habits and schedules ("twice a day", "on the half
hour"), sentences with a year in them, and general statements ("Dogs bark to communicate", "Thunder is
the sound…"); creaks come only from doors, gates, hatches, lids, shutters and hinges. A bare
"silence" after a sound no longer counts as its end, and "for once" is no longer "once".

`tests/sfx_corpus.py` holds 126 sentences written for the purpose across ten kinds of writing, each
labelled with the events a careful reader would accept (or none); `tests/test_sound_evaluation.py`
scores them and prints the table with `pytest -s`:

| Kind of writing       | Sentences | Labelled events | Balanced: right / wrong / missed |
| --------------------- | --------- | --------------- | -------------------------------- |
| Literal events        | 18        | 18              | 18 / 0 / 0                       |
| Metaphor and simile   | 12        | 0               | 0 / 0 / 0                        |
| Negated events        | 12        | 1               | 1 / 0 / 0                        |
| Quoted dialogue       | 12        | 4               | 4 / 0 / 0                        |
| Recollection          | 12        | 1               | 1 / 0 / 0                        |
| Repeated actions      | 12        | 1               | 0 / 0 / 1                        |
| Fantasy and adventure | 12        | 10              | 10 / 0 / 0                       |
| Mystery and suspense  | 12        | 7               | 7 / 0 / 0                        |
| Poetry                | 12        | 4               | 2 / 0 / 2                        |
| Nonfiction            | 12        | 0               | 0 / 0 / 0                        |

| Setting   | Precision | Recall | Wrong suggestions / 126 sentences |
| --------- | --------- | ------ | --------------------------------- |
| Minimal   | 1.00      | 0.89   | 0                                 |
| Balanced  | 1.00      | 0.93   | 0                                 |
| Immersive | 0.96      | 0.98   | 2                                 |

Before `rules-2` the same corpus gave Balanced a precision of 0.82 with nine wrong suggestions. The
two Immersive leaks are "it was only the wind" and a poem's "the rain falls on the just and the
unjust", both at the lowest confidence the setting admits. The misses are deliberate restraint: "for
once, a car did pass" and poetry that names a sound without a sounding verb. Every suggestion is
reviewed before it plays, every placed effect can be turned off, moved, replaced or removed, and
dismissed suggestions never return.

## Listening quality

- **Panel.** `docs/research/sound-effects-listening.html`, generated by
  `scripts/media/sound-listening-page.py`, lists all 36 sounds by category with name, id, the events
  they serve, description, length, loop or one-shot, measured loudness, peak and spectral centroid, a
  player each, a master level that starts at the app's 40 % and applies each sound's own gain, an
  optional narration bed from any local recording (an MP3 exported from TTSNative works) so a sound can
  be judged under speech, and a notes box per sound kept in the browser and copied out as JSON.
- **Narration samples.** `scripts/media/sfx-listening-samples.py` seeds a six-chapter document into a
  running app (a storm, a quiet house, a castle, a pastoral morning, a city, and a chapter written to
  stay silent), analyses each chapter at Immersive, accepts the suggestions and places every one of the
  36 sounds by hand where its scene names it, ambiences spanning their sentences; it prints the reader
  address. It was run against the development server: 6 chapters, 37 effects, the silent chapter
  suggested nothing.
- **What was not judged.** Nobody has listened. The sounds were levelled by measurement only (loud
  moments near −20 dBFS, peaks under −6 dBFS), which says nothing about whether a synthesised dog
  sounds like a dog. On first principles, filtered-noise and tone synthesis is credible for textures
  (rain, wind, stream, waves, fire, crickets, clock tick, machine hum, city wash) and weakest for
  organic and specific sources (dog, owl, wolf, horse, birdsong, crowd murmur, glass, sword). **If the
  owner's listening finds those unconvincing, the recommendation is a curated, licence-verified CC0
  replacement for the organic sounds (Kenney, Freesound's CC0 filter, OpenGameArt CC0, each file with
  its evidence recorded in the catalogue), not more synthesis.** No asset was replaced: that needs the
  owner's licensing review.

## Regression and browser verification

- **Automated.** `npm run check` on the merged branch: format, ESLint, repository rules (headers,
  file sizes, version, change files), type checks, API contract (`schema.gen.ts` up to date), unused
  code, duplication at 0 clones, scripts tests, the web suite (516 tests across 61 files, 100 %
  coverage gate), the server suite (1,012 tests passed and one skipped until the literary library is
  on the same branch; the sound-effects package at 100 %), and the production build, all green in one
  run of `npm run check` on the final commit. Two findings on the way were fixed at their cause: main's new voice effects module
  carried the same room-reverb code as the sound synthesis, which now imports it; and a five-second
  test timeout on a panel test that the heavier merged reader pushed to 5.04 s was removed by splitting
  the test in two, not by raising the limit. Two later runs of the web suite failed with timeouts in up
  to eighteen unrelated files while other sessions had the machine at 100 % CPU; the heaviest of them
  (a player test) takes the same 2.0 s with and without the effects provider, and the suite passed in
  full once the load eased, so no limit was raised and no test weakened. Playwright, `tests/e2e/sounds.spec.ts` with real Kokoro
  narration: Chromium and Firefox fetch the creak during the first sentence; Pixel 7 and iPhone 13
  emulation reach the Sounds tab through the Contents dialog; Playwright's WebKit build for Windows
  turned out to have no `AudioContext` at all (a probe confirmed the global is undefined; real Safari
  has it), and there the app does what it should: the panel says sound effects aren't available in
  this browser and turns them off while the narration continues. The spec now asserts that path where
  Web Audio is missing and the fetch where it exists; all five projects pass.
- **Browser walkthrough (Chromium, the branch's dev server, after the merge).** Opened the seeded
  document; the Sounds tab listed all 37 effects with their placements and origins; turned effects on
  and pressed play: each sound was fetched at its sentence in order (rain, distant thunder, wind,
  creak, gravel, dog, thunder overhead, slam) with no console errors; paused and resumed four times in
  a row with no error and playback continuing; raised the effects level with the keyboard (three
  arrow presses: 40 % to 43 %, stored under `ltts.sfx`); jumped from the panel to a chapter-two
  sentence: the section changed, the chapter's ambience and the next sounds were fetched; went to the
  library and opened another document: the player stopped on the old one, the new one showed effects
  off with no arrangement and no errors; phone layout (375 × 812): the reader, the Contents dialog and
  its Sounds tab render with the arrangement, the switch is off after a reload and the level is kept.
  Sentence markers (the tint and the hidden "Sound effect: …" description) show in both layouts.
- **Resource cleanup** is covered by the engine and session tests (sources stopped and disconnected,
  at most two one-shots and one loop, twelve decoded sounds kept, idle suspension, disposal on detach)
  and was not profiled in the browser.
- **Not verified here:** real Safari and iOS, the Tauri window, a long session's memory, and the
  sounds by ear.

## Cross-agent coordination

- **Literary library.** Its presets name fifteen of the thirty-six event ids and keep a copy of the
  vocabulary. `ltts/sfx/events.py` now exposes `VOCABULARY_VERSION` (1), `EVENT_IDS` and
  `CATEGORY_OF`; `tests/test_sound_vocabulary.py` snapshots version 1 (an id may be added without a new
  version; removing or moving one bumps it) and checks that `ltts.library.presets.KNOWN_EVENTS` equals
  `CATEGORY_OF`; now that both are on one tree the check runs for real and passes. Delivered to that
  session over the coordination channel with the migration agreement (their 14 to 16 first, this
  script 17 after), which is what happened.
- **Background music.** Ownership of the mixer channel settled as above; delivered.
- **Release review.** A read-only review from another session found the migration slot, the LAN
  policy and the ten conflicts; all three were already handled and the small extras it listed are in
  (`*.mp3 binary`, a placed effect in the desktop persistence test); the Windows notices script is out
  of scope for web assets by its own header, so it was left alone.

## Remaining blockers and readiness

- **Blocking a PR:** none on this side. The owner's listening verdict decides whether the synthesised
  sounds ship as they are or the organic ones are replaced first.
- **To do at the next rebase:** none known; the literary library's presets module can now import
  `CATEGORY_OF` instead of keeping its copy (a one-line change on its side).
- **Ready for a pull request?** Yes, as an opt-in feature that is off by default and plays nothing
  until a reader accepts a suggestion; the branch is local until the owner authorises a push.
