---
bump: minor
---

## New

- A **Sounds** tab in the reader can suggest a few sound effects for the chapter you are viewing
  where the text describes a sound, such as a creaking door or distant thunder; you hear each one,
  then accept, dismiss or swap it.
- You can add any sound from a bundled library at the sentence being read, choose when it plays and
  how loud, turn it off or remove it, and your arrangement stays with the document.
- Sound effects play beside the narration with their own volume and an intensity setting, and are
  off at the start of every narration until you turn them on.

## Technical

- Server: `ltts.sfx` (vocabulary, deterministic lexicon detector, validation gate with intensity
  limits, store, router) with `sound_effects` and `sound_analyses` tables (one migration at the end of the list) and the
  catalogue `ltts/sfx/library.json`; endpoints under `/api/sound-effects/library` and
  `/api/documents/{id}/sound-effects` (list, add, change, remove, review, analyse). ADR-22.
- Web: `features/sfx` (Web Audio engine with a limiter, scheduler, session following the player,
  provider, Sounds panel, library and adjust dialogs), a `data-effect` marker on sentences, and 36
  synthesised MP3 sounds under `public/sfx/` (1.3 MB) built by `scripts/media/sound-library.py`.
- Docs: `docs/research/sound-effects.md`, `docs/research/sound-effects-research.md`, wiki
  `Sound-Effects.md`.
