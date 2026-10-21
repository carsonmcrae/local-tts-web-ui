---
bump: minor
---

## New

- Play quiet background music under the narration: turn it on from the music button in the player,
  choose from eleven free tracks (ambient, fantasy, cinematic, lo-fi, focus and nature), and preview
  any of them before you pick.
- Music has its own volume, separate from the narration, and follows it: it pauses when you pause,
  carries on when you play, and fades gently in and out.
- Set the narration and the music volumes side by side in the new audio mixer in the player.
- Music is off at the start of every new narration. TTSNative remembers your track and volume on each
  device, but you always choose when the music plays.

## Technical

- Web: features/music (Web Audio engine with fades, crossfades and sample-accurate loops; a session
  that follows PlaybackController; per-device `ltts.music` preference), features/mixer (audio mixer
  in PlayerBar: narration volume `ltts.narrationVolume`, music channel, room for sound effects),
  `PlaybackController.setVolume` and `state.volume`, lib/deviceSettings, ADR-18 and
  docs/architecture/background-music.md.
- Player: a sentence that plays to its end no longer reports a brief pause (the `pause` fired just
  before `ended` is ignored); the music, play button and lock-screen state all follow that status
  between sentences.
- 11 CC0/public-domain tracks as Opus/WebM loops in apps/web/public/music (13.3 MB) with CREDITS.md;
  library.json records sources, licences, edits and SHA-256; `npm run music:build` rebuilds them from
  the checked originals.
- Tests: engine, session, preferences, library-licence and UI tests; tests/e2e/music.spec.ts.
