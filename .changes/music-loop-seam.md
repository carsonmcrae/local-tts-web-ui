---
bump: patch
desktop: changed
browser: changed
phone: changed
website: unchanged
docs: changed
---

## Fixed

- Background music no longer clicks each time a track starts over in the Windows app, Chrome and Edge: newer versions of their audio decoder dropped a fraction of a millisecond from the start of each track.

## Technical

- Chromium 156 decodes the bundled Opus/WebM tracks 24 samples short at the start (FFmpeg 9, Chrome 152 and Firefox 157 decode the full length), so the sample-exact whole-track loop jumped at its seam on 7 of the 11 tracks (seam ratio 1.05–3.85 against a limit of 1). The chunked player (see the long-tracks change) finds each chunk's music from its decoded length and crossfades every join and loop point over 10 ms; every join of all 17 tracks measures at most 0.92 in Chromium 156 and 0.91 in Firefox 157, and the e2e test fails when the crossfade or the trim correction is removed. Sound-effect loops (MP3) decode to full length in both browsers and are unchanged.
