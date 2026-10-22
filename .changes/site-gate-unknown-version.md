---
bump: none
---

## Technical

- Website: a `<!-- if:released-X.Y.Z -->` block for a version that has no notes yet (the next release,
  before `release:prepare`) was left in place because no flag existed for it; such blocks are now
  dropped, so the published site never shows a card for an unreleased version.
