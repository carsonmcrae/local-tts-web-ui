---
bump: patch
desktop: changed
browser: changed
phone: changed
website: unchanged
docs: changed
---

## Improved

- Eight sound effects whose synthesis is not convincing yet (the dog, owl, wolf, horse, birdsong,
  crowd, breaking glass and clashing swords) are marked **Experimental** in the library: they are
  never suggested automatically and a reading experience leaves them out, but you can still add one
  by hand.
- Sound effects never play louder than the narration: by default they sit well under it, and at the
  loudest settings an effect only reaches the narration's own level.

## Technical

- Store: adding or changing an effect refuses a looping sound with no end sentence (`effect_span`),
  so an ambience can never be left to loop until the narration pauses.
- Catalogue: `experimental` and `qualityNote` per sound in `ltts/sfx/library.json` (the switch is
  `EXPERIMENTAL` in `scripts/media/sfx_recipes.py`, one line per sound; the generator writes both
  fields); `catalogue.suggestable(event)` and a `default_sound` that prefers a credible sound;
  analysis drops proposals for events without a credible sound. The listening page shows the flag
  and the note.
- Engine: the per-effect gain cap (`MAX_GAIN`) is 1 instead of 1.5, so no effect plays above its
  mastered level, which is the narration's own.
- Tests: `tests/test_sound_mix.py` measures every bundled sound (mastered at or below −19 dBFS loud,
  −4.5 dBFS peak) and asserts the default and worst-case margins against the measured Kokoro
  narration level (−20.5 dBFS), re-measured by an inference test; the web tests play music and
  effects together under the narration, check the default levels and that no gain is above 1, and
  that a pause stops both and leaving the page closes both contexts.
