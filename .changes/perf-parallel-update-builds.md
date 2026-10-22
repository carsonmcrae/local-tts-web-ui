---
bump: none
---

## Technical

- The Desktop workflow builds the update test's versions A and B at the same time: one job makes the
  throwaway update key (`update-test.mjs --make-key`, passed to the builds as a one-day artifact of the
  run), two jobs build A and B in parallel (`--build old|new`), and the update test runs on their
  installers and signatures (`--test`). The key, its password, what the builds trust and what the test
  checks (wrong signature and broken download refused, verified update installed, document kept) are
  unchanged; `npm run desktop:update-test` with no arguments still does everything in one go.
