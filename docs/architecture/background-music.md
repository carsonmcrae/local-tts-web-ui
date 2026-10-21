# Background music and the audio mixer: design notes

How the optional music bed under the narration and the audio mixer work, what was measured, and what
is left. The decision itself is
[ADR-18](decisions.md#adr-18-background-music-plays-in-the-browser-beside-the-narration-never-mixed-into-it).

## Pieces

| File (apps/web/src)                         | Role                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `features/music/engine.ts`                  | Web Audio player: decode, fade, crossfade, sample-accurate loop, pause in place, cleanup. |
| `features/music/session.ts`                 | When music plays: follows the narration player; owns on/off, track, volume, preview.      |
| `features/music/preferences.ts`             | Track and volume per device (`ltts.music`); "on" is never stored.                         |
| `features/music/library.ts`, `library.json` | The catalogue: file, length, category, source, licence and its evidence, edits, SHA-256.  |
| `features/music/MusicProvider.tsx`          | One session per app, mounted inside the narration `PlayerProvider`.                       |
| `features/music/MusicChannel.tsx`           | The mixer's music channel: switch, volume, track, **Browse**.                             |
| `features/music/MusicLibrary.tsx`           | The library dialog: categories, preview, choice, credits link.                            |
| `features/mixer/MixerMenu.tsx`              | The **Audio mixer** button and panel in the player bar.                                   |
| `features/mixer/VolumeControl.tsx`          | One channel's name, percentage, optional switch and 0–100 % slider.                       |
| `features/mixer/narration.ts`               | Narration level per device (`ltts.narrationVolume`, 100 % by default).                    |
| `lib/deviceSettings.ts`                     | Reading and saving settings kept on this device; whole-percent volumes.                   |
| `features/player/controller.ts`             | Narration: `setVolume` (and `state.volume`); a sentence's natural end is not a pause.     |

Audio files and `CREDITS.md` live in `apps/web/public/music` and ship with every build (web, desktop).
`npm run music:build` rebuilds them from the original downloads (kept outside Git in
`.tools/music/sources`, checked against their recorded SHA-256).

## How music follows the narration

The narration plays one sentence at a time through one `<audio>` element (ADR-3). The music session
subscribes to `PlaybackController`'s state and never touches the narration element:

- **Narrating** means status `playing` or `loading` (fetching the next sentence). Music plays only
  while narrating, so it carries on across sentences, seeks, voice, speed and pace changes, and slow
  voices that take seconds to prepare a sentence.
- **Paused** (by the listener, a sleep timer, another app taking the audio, or an error) fades the
  music out at once. An audio element also fires `pause` just before `ended` when a sentence plays to
  its end; the controller ignores that one (`media.ended` is set), so the player never reports
  "paused" between sentences. No timer is involved: the distinction comes from the element's own
  `ended` flag, not from how quickly the next sentence starts.
- **A narration session** is one document in the player. Loading a different document (or none),
  reaching the end (`ended`), or reloading or restarting the app turns music off. Pausing, resuming,
  seeking and replaying from a sentence of the same document keep it.

Fades: on 1.5 s, off 1.2 s, pause 0.4 s, resume 1 s, track change 2 s (crossfade), end 2.5 s,
preview 0.6 s. The music volume is one gain node after every track, ramped over 80 ms.

## The audio mixer

One button in the player opens every level. Each channel is a `VolumeControl`:

- **Narration**: `PlaybackController.setVolume` sets the audio element's `volume` and `state.volume`
  (so both copies of the button, phone and desktop, agree), saved per device and applied when the app
  starts. iPhone and iPad fix an audio element's volume at 1; the mixer detects that by setting a probe
  element's volume and reading it back, and then disables the slider with an explanation. Routing the
  narration through Web Audio to work around it was rejected (ADR-18: a suspended context would
  silence the narration).
- **Background music**: its switch (off for every narration), volume, track and library.

### Contract for sound effects (`feat/sound-effects`, ADR-22)

Effects plug in as a third channel without changing the other two:

- Render one more `VolumeControl` in `MixerMenu` after `MusicChannel`: `name="Sound effects"`,
  `label="Effects volume"`, and an `action` holding the effects switch (a `SwitchControl` labelled
  "Sound effects"), mirroring `MusicChannel`. Keep the switch off for every narration and the volume
  (default 40 %) in a device setting (for example `ltts.sfx` via `lib/deviceSettings`), as ADR-22 says.
- Follow the narration the same way the music does: subscribe to `PlaybackController`, treat
  `playing`/`loading` as narrating, act on `paused`/`error` at once (no timer needed now), and turn off
  on a new document or `ended`.
- Each feature keeps its own `AudioContext` for now. Merging them into one context with one limiter
  is a later, separate change: the music engine needs only a `createContext` that returns a shared
  context and a master node to connect to instead of `destination`.
- The mixer button's label and highlight can then also reflect effects being on.

## Resources

- One `AudioContext`, created on the click that first needs it (autoplay rules), suspended after 5 s
  with nothing playing, closed when the player unmounts. Closing the window ends it with the page.
- Each playing track is a looping `AudioBufferSourceNode` with its own fade gain. A retired track
  stops at the end of its fade and is disconnected on `ended`, which also drops its listener. A third
  track (switching faster than a fade) is cut short with a 50 ms ramp, so at most two are audible.
- Decoded tracks: the current one and one more (for returning from a preview instantly). A decoded
  track takes 36–69 MB (48 kHz stereo float), so up to about 140 MB while switching.
- Timers: the engine's idle-suspend timer and the session's 20 s preview timer, each a single handle
  that is cleared before it is set again and on detach.
- Loads are guarded by a generation counter: a track replaced while loading never starts, and no
  source exists until a track has decoded, so a failed load leaves nothing behind. Failure turns music
  off with a message; a browser without Web Audio says so; the narration is never affected.

## The files

- Opus in WebM (64 kbps, constrained VBR, 48 kHz stereo): decodes in Chromium, Firefox and Safari
  (Ogg Opus is unreliable in Safari). 11 tracks, 26 minutes, 13.3 MB. Only the audio stream: no cover
  art or tags from the originals.
- Each loop's end is crossfaded into its start when the file is made (equal-power for ambient
  material; a one-beat linear blend at a bar-aligned cut, found by cross-correlation, for the lo-fi
  tracks). Decoded in Chrome, every seam's jump is smaller than the track's
  99.9th-percentile sample-to-sample step, and decoded lengths are exact (no codec padding).
- Loudness: -28 LUFS integrated per track, true peak ≤ -10 dBTP before encoding (≤ -8.4 after). Kokoro
  narration measures about -25.5 LUFS, so the default 10 % puts music about 22 dB under the voice and
  100 % about 2.5 dB under it.
- Licences: CC0 1.0 or a creator's public-domain release, checked on each source page and on an
  independent archived copy (`licence.archived`); see `CREDITS.md` for the full manifest.

## Measured in a real browser

Chromium (Playwright and the in-app browser) against a dev server with real Kokoro narration; the
audit wraps `AudioNode.connect`/`disconnect` to see which nodes stay wired, not only how many sources
play:

- **Lifecycle:** the narration finishing turns music off and a replay starts without it; pause stops
  it (within 0.6 s) and play resumes it in place; seeking, speed and voice changes start nothing;
  switching documents (also rapidly) turns it off; closing the window raises no errors; after a
  restart music is off with the track and both levels kept.
- **Graph:** after every scenario only the volume gain stays wired (plus one source and one fade
  while a track plays); one context for the whole session; at most two sources audible at once.
- **Long session:** 12 minutes, about 150 sentence ends, a track switch and a pause each minute: one
  source live throughout, two new sources a minute and nothing else, JS heap 33 MB at both ends.
- **Elsewhere:** all tracks decode in Firefox 155; Playwright's Windows WebKit build has no Web Audio
  and shows the "isn't available" message (real Safari wasn't tested); no requests leave the machine.

`tests/e2e/music.spec.ts` keeps the narration journey and the seam check in CI.

## Not built, and how it could be

- **Ducking** (music dips while the voice speaks). The browser only knows whole sentences, and each
  sentence's audio includes its pause, so state-based ducking would barely move. The server could
  measure where speech and silence fall in each sentence's audio and return that with it, so the
  music's gain can be scheduled from it without touching narration playback.
- **Music in exported audio.** Mix on the server, after the narration is assembled, as a separate
  step that leaves the current export untouched when it is off: loop the same `.webm`, apply the same
  gain curve (linear `volume / 100`, 1.5 s fade-in, 2.5 s fade-out at the end), sum, and limit the
  result to -1 dBTP. All bundled tracks are CC0 or public domain, so exports may be shared freely; a
  future CC BY track would need its credit in the export, and anything stricter should be excluded.
- **Downloadable packs.** `library.json` and the `/music/` folder already describe a pack. A future
  pack would be a checked archive (manifest, licences, files and their SHA-256) downloaded only when
  the reader asks, stored under the data folder and served by the local server.

## Merging with other branches

- `docs/architecture/decisions.md` is the one file every branch appends to; keep every ADR, in number
  order. Numbers in use: 11–17 (Studio Voice), 18 (this branch), 19–21 (desktop release), 22 (sound
  effects).
- `feat/studio-voice-plus` changes `controller.ts` (skipped sentences) in other places than this
  branch does; a trial merge typechecks and passes all 451 web tests. Its service worker caches only
  `/assets/` and a few top-level files, so `/music/*` always comes from the local server.
- `feat/desktop-release` copies `apps/web/dist` into the installer, so the music ships (+13 MB). After
  both merge, `scripts/desktop/notices.mjs` should name `web\music\CREDITS.md` beside the web
  licence files (not required by CC0, but it keeps every bundled asset's notes in one list).
