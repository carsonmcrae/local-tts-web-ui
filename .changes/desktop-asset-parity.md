---
bump: none
desktop: unchanged
browser: unchanged
phone: unchanged
website: unchanged
docs: unchanged
---

## Technical

- The Desktop workflow's smoke test proves the installed app serves the installer's own web build
  byte for byte (every file under `apps/web/dist`), opens every page in `scripts/lib/app-routes.mjs`
  and reports the build's version; `app-routes.test.mjs` keeps that list in step with the router.
