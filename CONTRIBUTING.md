# Contributing

Thanks for helping improve TTSNative. This guide covers setup, the quality bar and how changes are reviewed.

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
- **Adding a language or package manager.** The project's ecosystems are npm, Python through uv, Rust
  through Cargo and GitHub Actions, and each has Dependabot updates, an audit and a code scanner.
  `scripts/check-ecosystems.mjs` (part of `npm run lint:repo`) fails on anything else: PHP, Ruby, Go,
  the JVM, .NET, a second JavaScript or Python package manager, a container image and so on. Adding one
  needs an architecture decision (`docs/architecture/decisions.md`) and, in the same pull request, its
  Dependabot entry, an audit in `npm run security`, CodeQL or SonarQube coverage and an update to
  `scripts/lib/ecosystems.mjs`, so nothing arrives before its security tooling does.
- **No dead code, no TODOs** in merged code — open an issue instead.
- **Accessibility.** Keyboard reachable, visible focus, labelled controls, WCAG 2.2 AA contrast. The e2e
  suite runs axe.

## Cross-surface consistency

TTSNative has several user-facing surfaces: the Windows app, the browser UI (desktop and phone
widths, including over the LAN), the website, the documentation and the release information. When a
change touches user-facing functionality, terminology, navigation, settings, version information or
documented behaviour, find every surface it affects and keep them consistent. That does not mean every
change touches every surface.

Every change file declares the change's impact on each surface (`desktop`, `browser`, `phone`,
`website`, `docs`; see [.changes/README.md](.changes/README.md#surfaces)), and CI checks the
declaration against the pull request: the three app surfaces change together unless one is
`limited:` with a reason, site/ changes need `website:`, documentation changes need `docs: changed`.
Before declaring, answer for every user-facing change:

1. Does the Windows app need it, and is it built from the same web assets the browser gets?
2. Does the browser on the computer need it?
3. Does a phone need it, or an explicit, explained limitation (never a weaker LAN security rule)?
4. Does ttsnative.com need new product information, once the version that has it is published?
5. Do the README, wiki, guides or release notes need updating?
6. Which surfaces need new or changed regression tests?

- Review which surfaces the change affects.
- Update the affected interfaces, website content, documentation and tests together.
- Keep terminology, version labels, navigation and feature descriptions the same everywhere.
- Keep desktop and phone layouts working where they are affected.
- Never advertise on the website what the corresponding released app does not have.
- When a feature is deliberately available only on some platforms, say so clearly.
- If a surface update is deliberately deferred, say so in the pull request, with the reason.
- Check the affected surfaces before calling the change complete.

Backend-only changes, internal refactors and test improvements need no unrelated website or interface
changes.

## Pull requests

`main` only accepts pull requests that pass CI, and outside contributions need a code owner's approval
(see [repository protection](docs/security/repository-protection.md)).

1. Branch from `main`; keep the change focused.
2. Add or update tests; run `npm run check` (and `test:inference` / `test:e2e` for playback or UI changes).
3. Update docs, and add a change file: `npm run change -- <major|minor|patch|none>` writes
   `.changes/<branch>.md`; fill in what changes for people (plain language) and for developers. Don't
   edit version numbers or `CHANGELOG.md`; releases do that (see [.changes/README.md](.changes/README.md)).
4. Fill in the PR template, including anything you could not test.

By contributing you agree your contributions are licensed under the [MIT License](LICENSE).
