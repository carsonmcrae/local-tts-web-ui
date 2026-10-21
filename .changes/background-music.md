---
bump: minor
---

## New

- Play quiet background music under the narration: turn it on from the music button in the player,
  choose from eleven free tracks (ambient, fantasy, cinematic, lo-fi, focus and nature), and preview
  any of them before you pick.
- Music has its own volume, separate from the narration, and follows it: it pauses when you pause,
  carries on when you play, and fades gently in and out.
- Music is off at the start of every new narration. TTSNative remembers your track and volume on each
  device, but you always choose when the music plays.

## Technical

- Web: features/music (Web Audio engine with fades, crossfades and sample-accurate loops; a session
  that follows PlaybackController without changing it; per-device `ltts.music` preference), music
  button and library in PlayerBar, ADR-18 and docs/architecture/background-music.md.
- 11 CC0/public-domain tracks as Opus/WebM loops in apps/web/public/music (13.3 MB) with CREDITS.md;
  library.json records sources, licences, edits and SHA-256; `npm run music:build` rebuilds them from
  the checked originals.
- Tests: engine, session, preferences, library-licence and UI tests; tests/e2e/music.spec.ts.
