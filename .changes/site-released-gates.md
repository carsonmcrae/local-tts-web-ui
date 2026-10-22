---
bump: none
---

## Technical

- Website: `<!-- if:released-X.Y.Z -->` blocks in `site/index.html` stay out of the published site until
  GitHub lists that version as a released version (`scripts/site/releases.mjs` `releasedFlags`), so a
  feature card can merge with its feature and appear on release day by itself. Local builds show them.
