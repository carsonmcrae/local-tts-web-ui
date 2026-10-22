---
bump: patch
desktop: changed
browser: changed
phone: changed
website: unchanged
docs: unchanged
---

## Security & reliability

- A security update for one of the local server's libraries.

## Technical

- `opentelemetry-api` 1.45.0 → 1.45.1 (via fastapi) in `apps/server/uv.lock` for CVE-2026-114603; released
  2026-10-06, so within the 14-day cool-down, no exception needed. Only that package changed in the lock.
