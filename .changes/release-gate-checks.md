---
bump: none
desktop: unchanged
browser: unchanged
phone: unchanged
website: unchanged
docs: changed
---

## Technical

- The release-readiness gate separates the acceptance list into **Before release** (each tick needs a "verified:" note; a **(required)** check can't be waived), **After publishing** (listed, and refused if marked before the release exists) and **Blockers** (ticked with "verified:"). The next version's gate requires the previous gated version's after-publishing checks, so post-release smoke tests can't be skipped. This removes the circular requirement that the website and download be verified before the release that creates them.
- The gate checks on GitHub that the previous release is published, not a draft, from a commit whose version files name it and that has no pending change file, so a tag on `main` by mistake is caught.
- SonarQube evidence must meet the project's policy (100 % line and branch coverage, no duplication, no bug, vulnerability or code smell, no unreviewed hotspot) whatever the server's gate allows; `npm run sonar:gate` sets the server's gate to the same thresholds on new code and the whole project. The SonarQube API calls are shared in `scripts/lib/sonar.mjs`.
