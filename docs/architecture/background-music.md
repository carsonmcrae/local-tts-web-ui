# Background music: design notes

How the optional music bed under the narration works, what was measured, and what is left. The
decision itself is [ADR-18](decisions.md#adr-18-background-music-plays-in-the-browser-beside-the-narration-never-mixed-into-it).

## Pieces

| File (apps/web/src/features/music)  | Role                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `engine.ts`                         | Web Audio player: decode, fade, crossfade, sample-accurate loop, pause in place, cleanup.    |
| `session.ts`                        | When music plays: follows the narration player's state; owns on/off, track, volume, preview. |
| `preferences.ts`                    | Track and volume per device (localStorage `ltts.music`); "on" is never stored.               |
| `library.ts`, `library.json`        | The catalogue: file, length, category, source, licence, edits, SHA-256 of file and original. |
| `MusicProvider.tsx`                 | One session per app, mounted inside the narration `PlayerProvider`.                          |
| `MusicMenu.tsx`, `MusicLibrary.tsx` | The player-bar panel and the library dialog.                                                 |

Audio files and `CREDITS.md` live in `apps/web/public/music` and ship with every build (web, desktop).
`npm run music:build` rebuilds them from the original downloads (kept outside Git in
`.tools/music/sources`, checked against their recorded SHA-256).

## How music follows the narration

The narration is untouched: one `<audio>` element plays sentence after sentence (ADR-3), and
`PlaybackController` is not modified. The music session subscribes to the controller's state:

- **Narrating** means status `playing` or `loading` (fetching the next sentence). Music plays only
  while narrating, so it carries on across sentences, seeks, voice, speed and pace changes, and slow
  voices that take seconds to prepare a sentence.
- **Pausing** (`paused` or `error`) fades the music out after 300 ms. The delay is needed: an audio
  element fires `pause` just before `ended`, so the narration reads as paused for an instant at every
  sentence end. Without it the music restarted at every sentence (found in the browser; jsdom doesn't
  reproduce it).
- **A narration session** is one document in the player. Loading a different document (or none),
  reaching the end (`ended`), or reloading the page turns music off. Pausing, resuming, seeking and
  replaying from a sentence of the same document keep it.

Fades: on 1.5 s, off 1.2 s, pause 0.4 s, resume 1 s, track change 2 s (crossfade), end 2.5 s,
preview 0.6 s. The music volume is one gain node after every track, ramped over 80 ms when the slider
moves; the narration's volume is never touched.

## Resources

- One `AudioContext`, created on the click that first needs it (autoplay rules), suspended after 5 s
  with nothing playing, closed when the player unmounts.
- Each playing track is a looping `AudioBufferSourceNode` with its own fade gain. Retired tracks stop
  at the end of their fade and are disconnected on `ended`; at most two overlap (a crossfade), however
  fast the switch is toggled.
- Decoded tracks: the current one and one more (for returning from a preview instantly). A decoded
  track takes 36–69 MB (48 kHz stereo float), so up to about 140 MB while switching.
- Loads are guarded by a generation counter: a track replaced while loading never starts.
- A track that fails to load turns music off with a message; a browser without Web Audio says so. The
  narration is never affected.

## The files

- Opus in WebM (64 kbps, constrained VBR, 48 kHz stereo): decodes in Chromium, Firefox and Safari
  (Ogg Opus is unreliable in Safari). 11 tracks, 26 minutes, 13.3 MB.
- Each loop's end is crossfaded into its start when the file is made (equal-power for ambient
  material; a one-beat linear blend at a bar-aligned cut, found by cross-correlation, for the lo-fi
  tracks). Decoded in Chrome, every seam's jump is smaller than the track's 99.9th-percentile
  sample-to-sample step, and decoded lengths are exact (no codec padding).
- Loudness: -28 LUFS integrated per track, true peak ≤ -10 dBTP before encoding (≤ -8.4 after). Kokoro
  narration measures about -25.5 LUFS, so the default 10 % puts music about 22 dB under the voice and
  100 % about 2.5 dB under it. Narration peaks plus music at 100 % can just touch full scale; at
  everyday volumes there is ample headroom.

## Measured in a real browser

Chromium (the in-app browser and Playwright) against a dev server with real Kokoro narration:

- one music source for a whole narration across chapters; pause stops and releases it within a
  second, play resumes at the same place in the track; seeks, speed and voice changes start nothing;
- a 2 s crossfade between tracks with no dip; 40 rapid on/off toggles leave nothing playing or
  connected; switching documents turns music off;
- music keeps playing through 6 s waits per sentence (a stand-in for a slow studio voice);
- all tracks decode in Chromium 153 and Firefox 155; Playwright's Windows WebKit build has no Web Audio
  and shows the "isn't available" message. Real Safari wasn't tested.
- no requests to other hosts; the production server serves `/music/*` under its Content-Security-Policy.

`tests/e2e/music.spec.ts` keeps the narration journey and the seam check in CI.

## Not built, and how it could be

- **Ducking** (music dips while the voice speaks). The browser only knows whole sentences, and each
  sentence's audio includes its pause, so state-based ducking would barely move. Real ducking needs
  the speech envelope: either route the narration through Web Audio (an `AnalyserNode` and a
  side-chain gain; risky, because a suspended context would silence the narration) or have the server
  measure where speech and silence fall in each sentence's audio and return that with it, so the
  music's gain can be scheduled from it. The second keeps narration playback as it is.
- **Music in exported audio.** Mix on the server, after the narration is assembled, as a separate
  step that leaves the current export untouched when it is off: loop the same `.webm` (decoded with
  the existing audio stack), apply the same gain curve (linear `volume / 100`, 1.5 s fade-in, 2.5 s
  fade-out at the end), sum, and limit the result to -1 dBTP. Record the track and volume in the
  export's metadata. All bundled tracks are CC0 or public domain, so exports may be shared freely;
  a future CC BY track would need its credit in the export (metadata and chapter notes), and anything
  stricter should be excluded from exports.
- **Downloadable packs.** `library.json` and the `/music/` folder already describe a pack. A future
  pack would be a checked archive (manifest, licences, files and their SHA-256) downloaded only when
  the reader asks, stored under the data folder and served by the local server.

## Merging with other branches

- `feat/studio-voice-plus` changes `controller.ts` (skipped sentences) but not its states or
  `subscribe`, which is all the music uses. Its service worker caches only `/assets/` and a few
  top-level files, so `/music/*` always comes from the local server, like sentence audio.
- `feat/desktop-release` bundles `apps/web/dist`, so the music ships in the installer (+13 MB). Its
  change-file system replaces CHANGELOG edits: this branch adds `.changes/background-music.md`.
- ADRs on other branches use numbers 11–17; this one is ADR-18.
