---
bump: patch
---

## Fixed

- In the Voice Studio, a reading recorded far too quietly is now called too quiet, instead of being
  reported as having no speech at all.
- In a noisy room, the Voice Studio no longer says a take was cut off mid-word when the reading ended
  normally.

## Technical

- `take_checks`: when the fixed −45 dBFS speech threshold finds a take short or too quiet, the whole
  recording is measured against its own background (its quietest tenth of 30 ms frames). At least 3 s
  of voice 15 dB above that background, at under −40 dBFS, now gives `too_quiet` alone: previously
  `no_speech` or `no_sound`, or `too_quiet` plus `pauses`/`incomplete` that followed from it.
- `cut_off` also needs the edge frames 6 dB above that background, so steady noise within 15 dB of the
  speech no longer reads as a word cut off.
- A local benchmark of 540 clips edited from 48 studio takes: false warnings on complete clips fell
  from 27.9 % to 0 %, and incomplete-take detection is unchanged (65 %).
