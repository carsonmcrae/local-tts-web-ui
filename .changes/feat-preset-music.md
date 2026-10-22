---
bump: patch
---

## Improved

- In a curated book's reading experience, the recommended background music track is named the way
  the player names it, and **Use this track** makes it this device's choice in the player at the
  suggested level. Music still stays off until you turn it on there.

## Fixed

- The reading experience no longer says that background music recommendations arrive with a later
  version: they are here.

## Technical

- Presets: `music` leaves `NOT_YET`; the report's `music` (`trackId`, `volume`, `note`) replaces
  `musicTrackId`; applying `music` records the track and level in `document_presets.components_json`
  and writes nothing else (the track a device plays is the web app's own setting there);
  `tests/test_library_presets.py` keeps `KNOWN_TRACKS` equal to `features/music/library.json`;
  `ReadingExperience` names tracks from that library and chooses them through `useMusic()`.
