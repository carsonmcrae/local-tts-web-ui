---
bump: minor
desktop: changed
browser: changed
phone: changed
website: pending-release
docs: changed
---

## New

- **Immersive** reading experience for the six curated books: the characters' voices, the book's sound
  effects placed in the Sounds panel, and the recommended music track chosen for this device. Sound
  effects and music still stay off until you turn them on in the player.

## Improved

- The reading experience no longer says sound effects arrive with a later version: it says how many it
  placed, and the Sounds panel marks them "From the reading experience". Adjust one and it becomes
  yours; remove one and it stays gone until you choose the experience again.

## Technical

- Presets: `NOT_YET` and the 409 `component_unavailable` path are gone (every component is
  `available`); `PresetService._apply_effects` resolves anchors and places rows through
  `SoundEffectStore.apply_preset` (origin `preset`, status `accepted`, detector `preset:<id>@<version>`,
  volume `round(gain × preset volume)`, `until` from the end anchor or `duration_s / 4` sentences),
  records `{placed, skipped}` in `components_json` (skipped by reason: occupied, experimental, invalid,
  limit, unresolved), and `remove_preset` takes the rows out; the report
  gains `effectsPlaced`; `PresetStores` groups the service's stores. Store: `Origin` gains `preset`,
  `PresetEffectIn`, `apply_preset`, `remove_preset`; a PATCH makes a preset row `manual`. Web:
  Immersive offered, an effects line, "From the reading experience" in `EffectRows`, sound-effects
  queries invalidated on apply and remove. `persistence-test.mjs` applies the whole experience. No
  migration.
