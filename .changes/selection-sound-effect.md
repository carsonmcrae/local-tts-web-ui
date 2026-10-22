---
bump: minor
desktop: changed
browser: changed
phone: changed
website: unchanged
docs: changed
---

## New

- Select text in a document and choose Sound effect to place a sound at those sentences.

## Improved

- The Voice Studio's Import a voice and Create voice buttons sit side by side instead of stacked.

## Technical

- `SelectionStyler` gains a "Sound effect" button that opens `SoundLibraryDialog` (now with an optional
  `error`) and posts a manual effect at the first selected sentence; a looping sound's `untilSegment`
  is the last selected sentence. `PageHeader` actions no longer shrink beside a long description.
