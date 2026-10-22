---
bump: patch
desktop: changed
browser: changed
phone: changed
website: unchanged
docs: changed
---

## Security & reliability

- A paired phone or tablet can no longer remove a saved cast; like other deletions, that is done on the
  computer, and the phone says so.
- A phone or tablet may ask for voice previews and alternative takes of a sentence in moderation; after a
  burst it is asked to wait a few minutes, and told why.
- Settings and the guides now say plainly that on macOS and Linux the Audiobookshelf key is kept in a file
  only your user account can read, not encrypted as it is on Windows.

## Technical

- `lan/policy.py`: `DELETE /api/cast-presets/{id}` joins `_ON_THE_COMPUTER`; voice previews and segment takes
  (`_BRIEF`) draw on a second per-device `WorkBudget(BRIEF_PER_WINDOW)` (`LanService.previews`, 60 per 10
  minutes) and are refused with 429 `lan_busy` and a previews-specific message; `WorkBudget` takes a `limit`.
  The reader hides a saved cast's remove control on a phone and says where casts are removed. The
  Audiobookshelf Settings copy, the wiki and the threat model describe the key file on macOS and Linux.
  Security review for 2.2.0 in `docs/security/review-2.2.0.md`; threat-model rows for web-page import, Audiobookshelf
  upload and the bundled book catalog; supply-chain.md states the real Dependabot cool-downs; the licence inventory
  lists the bundled books and sound effects.
