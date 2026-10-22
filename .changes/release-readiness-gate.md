---
bump: none
desktop: unchanged
browser: unchanged
phone: unchanged
website: unchanged
docs: changed
---

## Technical

- Release-readiness gate (`npm run release:gate -- X.Y.Z`, `scripts/lib/gate.mjs`): from 2.2.0 the
  Release workflow refuses a tag unless CI, Desktop, CodeQL and Inference & E2E passed on that exact
  commit, `docs/readiness/X.Y.Z/quality.json` records a passing SonarQube gate for it (or for a commit
  that differs only by that evidence), and `docs/readiness/X.Y.Z/acceptance.md` has every manual check
  done or waived with a reason and no open blocker. `npm run sonar:evidence` writes the SonarQube file
  from the server's API (token from `SONAR_TOKEN` only). Release builds download and verify the bundled
  Python and models afresh instead of restoring them from a cache.
