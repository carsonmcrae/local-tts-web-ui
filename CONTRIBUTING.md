# Contributing

Thanks for helping improve Local TTS. This guide covers setup, the quality bar and how changes are reviewed.

## Setup

Prerequisites: **Node.js 22.22+** (see `.nvmrc`) and Git. Nothing else — the bootstrap installs a
checksum-verified `uv`, which installs Python 3.12 and the locked dependencies inside the repository.

```bash
npm install
npm run dev
```

## Everyday commands

| Command                                  | Purpose                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`                            | API (auto-reload) + web UI (hot reload)                                         |
| `npm run check`                          | Everything CI's fast gate runs: format, lint, types, API contract, tests, build |
| `npm run test` / `npm run test:coverage` | Unit and component tests (web + server)                                         |
| `npm run test:inference`                 | Real-model tests (needs the Kokoro model; Chatterbox optional)                  |
| `npm run test:e2e`                       | Playwright journeys with real inference (run `npx playwright install` once)     |
| `npm run lint` / `npm run format`        | ESLint + ruff + repository rules / Prettier + ruff format                       |
| `npm run typecheck`                      | TypeScript (web, scripts, e2e) and mypy (strict)                                |
| `npm run api:types`                      | Regenerate `apps/web/src/api/schema.gen.ts` after changing API models           |
| `npm run security` / `npm run licenses`  | Dependency audits / licence inventory                                           |
| `npm run doctor`                         | Environment diagnostics                                                         |

## Engineering rules

- **File headers.** Every source and test file starts with two licence lines,
  `SPDX-License-Identifier: MIT` and `Copyright (c) 2026 Carson McRae`, then `Purpose:`, `Scope:` and
  `Does NOT belong:` (all checked by `scripts/check-headers.mjs`). Write real content, not boilerplate.
- **Contributions** are made under the project's MIT License. You keep the copyright in your changes
  and may add your own copyright line under the existing one in a file you substantially change.
- **File size.** Aim for under 300 lines; over 400 is flagged; over 500 fails unless justified in
  `scripts/file-size-exceptions.json`. Split by responsibility, never into `part1`/`misc` files.
- **Complexity.** TypeScript logic ≤ 15 cyclomatic, React components ≤ 20 and ≤ 200 lines per function;
  Python ≤ 10 (ruff mccabe) with pylint argument/branch limits.
- **Types.** Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) and `mypy --strict`.
- **Errors.** Raise `AppError` subclasses with a stable `code` and a message a user can act on; never show stack traces in the UI.
- **Logging.** Log identifiers, never document text, recordings or original filenames.
- **Security-sensitive code** (`security.py`, `documents/safezip.py`, `documents/sandbox.py`,
  `modelstore/`, `voices/`, `scripts/lib/download.mjs`, `scripts/toolchain.json`) needs a test for every
  behaviour change and a review from a code owner.
- **Dependencies.** Ask before adding one. Prefer the standard library or an existing dependency; check
  its licence (no AGPL/GPL in app code), maintenance and install scripts. Releases must be ≥ 14 days old.
- **No dead code, no TODOs** in merged code — open an issue instead.
- **Accessibility.** Keyboard reachable, visible focus, labelled controls, WCAG 2.2 AA contrast. The e2e
  suite runs axe.

## Pull requests

1. Branch from `main`; keep the change focused.
2. Add or update tests; run `npm run check` (and `test:inference` / `test:e2e` for playback or UI changes).
3. Update docs and `CHANGELOG.md` under `Unreleased`.
4. Fill in the PR template, including anything you could not test.

By contributing you agree your contributions are licensed under the [MIT License](LICENSE).
