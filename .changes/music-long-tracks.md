---
bump: minor
desktop: changed
browser: changed
phone: changed
website: pending-release
docs: changed
---

## New

- Six more background music tracks: three piano pieces (a Chopin nocturne and two Beethoven sonata
  movements) and three nature recordings (gentle ocean waves, rain in a forest and a small stream),
  each running about five to eight minutes before it repeats.

## Improved

- Background music uses the same small amount of memory however long a track is, and passes from
  one part of a track to the next without a click, also on phones.

## Technical

- Music is chunked. `npm run music:build` cuts each prepared loop into chunks of about 20 s
  (`public/music/<id>/01.webm`, …) that each carry 960 frames (20 ms) of their neighbours, checks every
  chunk by decoding it with FFmpeg, and limits true peaks at four times the rate over the loop wrapped
  in its own end and start. `library.json` tracks list `chunks` (file, frames, bytes, SHA-256) and
  `edgeFrames` instead of one `file` and `sha256`.
- `MusicEngine` plays a track as its chunks on one frame-exact timeline (a 48 kHz `AudioContext` where
  the browser allows it): the chunk playing and the next one per track, plus three recently used
  chunks decoded. It finds each chunk's music from the decoded length (Chromium 156 trims 24 frames
  from the start, Firefox 157 0–1) and crossfades every join, the loop point included, over 10 ms.
  This replaces the whole-buffer loop for music, and with it `seamlessLoop`'s seam crossfade, which
  the music no longer calls. `dispose()` also disconnects the master gain.
- Measured in Chromium (the page's private memory, after a forced garbage collection): +24, +31 and
  +40 MB for 2, 10 and 20-minute tracks walked to the end, +55 MB during a crossfade between two
  20-minute tracks; decoding the whole track at once, as before: +52, +243 and +493 MB.
- `tests/e2e/music.spec.ts` (with `music-probe.ts`) measures every chunk join and loop point of all
  17 tracks as the player schedules them, in Chromium 156 and Firefox 157: at most 0.92 against the
  limit of 1 (cut without the crossfade, up to 2.83), each next chunk on the exact frame, copies
  aligned. It fails with the crossfade or the trim correction removed. Measured, not listened to.
- Six tracks added (the owner's approved selection; the library test caps the library at these 17):
  Musopen recordings on Wikimedia Commons (public domain or CC0, with the compositions in the public
  domain) and Freesound CC0 field recordings (their high-quality previews), licences checked on the
  live and archived pages on 2026-10-22 and credited in `CREDITS.md`. The bundled music grows from
  13.3 MB in 11 files to 33.5 MB in 200 (the web build from about 16 MB to 36 MB).
- Engine tests split into `engine.test.ts` (chunks and joins) and `engine.lifecycle.test.ts`, with
  `test/musicEngine.ts`; the shared loop helpers' tests moved to `lib/audio/webAudio.test.ts`.
