---
bump: none
desktop: unchanged
browser: unchanged
phone: unchanged
website: unchanged
docs: changed
---

## Technical

- Change files declare each surface's impact (`desktop`, `browser`, `phone`, `website`, `docs`:
  `changed`, `unchanged`, `limited: <why>` or, for the website, `pending-release`). `lib/changes.mjs`
  rejects undeclared surfaces, app surfaces that diverge without a stated limitation, `none` changes
  that alter the app, user-facing bumps that reach no surface and undocumented New features;
  `check-changes.mjs --base` checks `website`/`docs` against the files the pull request changes.
  `npm run change` writes placeholders CI refuses. New `AGENTS.md`; CONTRIBUTING, the PR template and
  `.changes/README.md` describe the rule.
