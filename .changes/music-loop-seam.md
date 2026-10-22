---
bump: patch
desktop: changed
browser: changed
phone: changed
website: unchanged
docs: unchanged
---

## Fixed

- Background music no longer clicks each time a track starts over in the Windows app, Chrome and Edge: newer versions of their audio decoder dropped a fraction of a millisecond from the start of each track.

## Technical

- Chromium 156 decodes the bundled Opus/WebM tracks 24 samples short at the start (FFmpeg 9, Chrome 152 and Firefox 157 decode the full length), so the sample-exact loop jumped at its seam on 7 of the 11 tracks (seam ratio 1.05–3.85 against a limit of 1). `seamlessLoop` (`lib/audio/webAudio.ts`) blends each loop's last 30 ms into its first (equal power, in place, once per decoded buffer) and ends the loop 30 ms earlier, so the join is continuous whatever the decoder does at the edges; every track measures under 0.25 in Chromium 156 and Firefox 157. The e2e test now measures the loop the player actually starts for every track, and fails on the old engine. Sound-effect loops (MP3) decode to full length in both browsers and are unchanged.
