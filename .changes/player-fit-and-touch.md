---
bump: patch
desktop: changed
browser: changed
phone: changed
website: unchanged
docs: unchanged
---

## Fixed

- In windows between 768 and 1023 pixels wide, such as a tablet or a narrow window beside the
  sidebar, the player bar no longer pushes its voice, speed and export buttons past the edge: it uses
  the two-row layout there, with the audio mixer beside the play button.
- On phones the position slider is no longer squeezed between the buttons. It gets a line of its own,
  and on touch screens every slider responds to a 44-pixel-tall area, not just the thin track.

## Technical

- Player bar: the compact layout runs up to `lg` (1024 px) instead of `md`; from `lg` the title
  shrinks (`max-w-64`) instead of keeping a fixed width. The position row wraps, with the slider group
  at least `basis-60`. `Slider` is `h-11` under `pointer-coarse`.
- `npm run perf:listening` names the minutes its closing rate covers ("last N minutes"), so a short
  run no longer claims ten.
