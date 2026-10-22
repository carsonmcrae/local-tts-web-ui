# Development

A short orientation for contributors. For the full rules, read
[CONTRIBUTING.md](https://github.com/carsonmcrae/ttsnative/blob/main/CONTRIBUTING.md) and
[AGENTS.md](https://github.com/carsonmcrae/ttsnative/blob/main/AGENTS.md) (how changes land, the
gates, and the five surfaces every change is checked against).

## How it fits together

A React and TypeScript single-page app talks to one local FastAPI process over same-origin HTTP. The
server extracts documents in a sandboxed subprocess, splits them into sentences, synthesises each
sentence on demand, caches the audio by content hash and streams it back. The optional voice-cloning
engine runs in a separate Python environment and is driven over stdio.

The same web app and server reach people in three ways: a browser on the computer (from a source
install), the Windows app (a Tauri window around the same server, with its own bundled Python), and a
paired phone or tablet on the home network (LAN mode). Background music and sound effects play in the
browser beside the narration. See the
[architecture overview](https://github.com/carsonmcrae/ttsnative/blob/main/docs/architecture/overview.md)
and [What Works Where](What-Works-Where).

## Repository layout

| Path                     | What's there                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | The UI: Vite, React 19, Tailwind v4, Radix primitives, TanStack Query, React Router. Pages and features under `src/features` (library, explore, reader, player, voices, studio, exports, settings, lan, music, sfx, mixer, updates…); the bundled music and sounds in `public/` |
| `apps/server`            | The API server, Python package `ltts` (`src/ltts`): `documents`, `synthesis`, `engines`, `voices`, `exports`, `modelstore`, `library` (included books), `sfx` (sound effects), `lan` (phones), `speech_api`, `pronunciation`                                                    |
| `apps/chatterbox-worker` | The optional cloning engine: a separate uv project (Python 3.11, PyTorch 2.11) installed on demand                                                                                                                                                                              |
| `apps/desktop`           | The Windows app: the Tauri 2 shell (`src-tauri`, Rust), the start-up screen, installer hooks and the runtime manifest                                                                                                                                                           |
| `scripts/`               | Node scripts: bootstrap (pinned uv, locked environment, model install), process orchestration, repository checks, `desktop/` (runtime, installer, smoke tests), `release/`, `site/`, `media/`                                                                                   |
| `tests/`                 | Playwright end-to-end tests (`e2e/`), sample documents (`fixtures/`) and benchmarks (`perf/`)                                                                                                                                                                                   |
| `site/`                  | The website, ttsnative.com, built by `npm run site:build`                                                                                                                                                                                                                       |
| `docs/`                  | Architecture, guides, security, release notes (`releases/`), release evidence (`readiness/`) and this wiki's source (`wiki/`)                                                                                                                                                   |
| `.changes/`              | One change file per pull request, combined into the next version's notes                                                                                                                                                                                                        |

Web unit tests sit next to the code (`apps/web/src/**/*.test.ts(x)`); server tests are in
`apps/server/tests/`; script tests are `scripts/**/*.test.mjs`.

## Main npm scripts

| Command                                   | Purpose                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                             | API (auto-reload) and web UI (hot reload)                                                                          |
| `npm run start`                           | Production-style: one process serves the built UI and the API                                                      |
| `npm run check`                           | Everything CI's fast gate runs: format, lint, types, API contract, dependency rules, duplication, all tests, build |
| `npm run test` / `npm run test:coverage`  | Script, web and server tests / the same with coverage                                                              |
| `npm run test:inference`                  | Real-model tests (needs the Kokoro model; Chatterbox optional)                                                     |
| `npm run test:e2e`                        | Playwright journeys with real inference (run `npx playwright install` once)                                        |
| `npm run lint` / `npm run format`         | ESLint, ruff and repository rules / Prettier and ruff format                                                       |
| `npm run typecheck`                       | TypeScript (web, scripts, e2e) and mypy (strict)                                                                   |
| `npm run api:types`                       | Regenerate the web app's API types after changing API models                                                       |
| `npm run change -- <bump>`                | Start the change file every pull request needs                                                                     |
| `npm run release:status` / `release:gate` | The next version from the change files / whether a commit may be released                                          |
| `npm run desktop:build`                   | Build the Windows installer (Windows only; needs Rust and the Visual Studio C++ build tools)                       |
| `npm run site:build`                      | Build the website and check its links                                                                              |
| `npm run security` / `npm run licenses`   | Dependency audits / licence inventory                                                                              |
| `npm run doctor`                          | Environment diagnostics                                                                                            |

## Testing levels

| Level           | Command                  | Models needed             | Runs in CI                                                                  |
| --------------- | ------------------------ | ------------------------- | --------------------------------------------------------------------------- |
| Unit, component | `npm run test`           | No (`FakeEngine`)         | Yes                                                                         |
| Coverage gates  | `npm run test:coverage`  | No                        | Yes: 100 % of lines and branches in the web app and the server              |
| Real inference  | `npm run test:inference` | Yes                       | The **Inference & E2E** workflow: weekly, by hand, and before a release     |
| End to end      | `npm run test:e2e`       | Yes (Chatterbox optional) | The same workflow                                                           |
| Windows app     | `npm run desktop:build`  | Kokoro (bundled)          | The **Desktop** workflow: installer smoke test, persistence and update path |

The end-to-end suite builds the UI, starts isolated servers, and runs Playwright in Chromium, Firefox,
WebKit, and Pixel 7 and iPhone 13 emulation with real audio. CI runs the server tests on Ubuntu,
Windows and macOS. Don't exclude files, lower thresholds or add hollow tests to make a gate pass. See
the [testing guide](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/testing.md) for
what is and isn't covered.

## Conventions

- **File headers.** Every source and test file starts with the SPDX licence line and the copyright
  line, then `Purpose:`, `Scope:` and `Does NOT belong:`.
- **File size.** Aim for under 300 lines; over 400 is flagged; over 500 fails unless justified.
- **Types.** Strict TypeScript and `mypy --strict`.
- **Errors.** Raise `AppError` subclasses with a stable `code` and a message a user can act on; never
  show stack traces in the UI.
- **Logging.** Log identifiers, never document text, recordings or original file names.
- **Dependencies.** Ask before adding one; no AGPL or GPL in app code; releases must be at least 14
  days old.
- **No dead code and no TODOs** in merged code; open an issue instead.
- **Accessibility.** Keyboard reachable, visible focus, labelled controls, WCAG 2.2 AA contrast.
- **Tests.** Assert behaviour (no snapshot-only tests); a test that only passes on retry is flaky.
- **Phones.** What a paired phone may do is listed in `apps/server/src/ltts/lan/policy.py`; a new API
  route stays on the computer until it is added there. Never weaken LAN security to make a phone
  behave like the computer.

Security-sensitive code (request security, the document sandbox and ZIP checks, the model store, voice
profiles and the download helper) needs a test for every behaviour change and a review from a code
owner.

## Pull requests

1. Branch from `main` and keep the change focused.
2. Add or update tests and run `npm run check` (plus `test:inference` and `test:e2e` for playback or
   UI changes).
3. Update the docs, and add a change file with `npm run change -- <major|minor|patch|none>`. It says
   how the change affects the next version, what to tell people, and how it reaches each surface
   (`desktop`, `browser`, `phone`, `website`, `docs`); see
   [.changes/README.md](https://github.com/carsonmcrae/ttsnative/blob/main/.changes/README.md). Don't
   edit version numbers or `CHANGELOG.md`: CI refuses it, and releases write them.
4. Fill in the pull request template, including anything you couldn't test.

Contributions are licensed under the MIT licence.

## Releases

Releases follow Semantic Versioning. The next version is the current one bumped by the strongest
pending change file (`npm run release:status` shows it). The version is kept in 11 places (the files in
`scripts/lib/version-files.mjs` and the newest `CHANGELOG.md` heading), and `npm run lint:repo` fails if
they disagree. `npm run release:prepare` writes the version, the dated changelog entry and a draft of
the release notes, which a person rewrites. From 2.2.0, a tag is only released when its commit passes
the [readiness gate](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/release-process.md#readiness-gate):
CI, the Windows app, CodeQL and the browser journeys passed on that commit, SonarQube's result is
recorded, and the manual checks are done. The Release workflow then publishes the release with
checksums (`SHA256SUMS.txt`), SBOMs and signed build provenance. See the
[release process](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/release-process.md).

## Editing this wiki

The wiki is written in the repository under `docs/wiki/` and published by the **Wiki** workflow when
changes reach `main`, so wiki edits are reviewed in pull requests like code. File names are page
names (`Getting-Started.md` becomes **Getting Started**), and links between pages look like
`[Voices](Voices)`.

## Further reading

- [Architecture overview](https://github.com/carsonmcrae/ttsnative/blob/main/docs/architecture/overview.md)
  and [design decisions](https://github.com/carsonmcrae/ttsnative/blob/main/docs/architecture/decisions.md)
- [The Windows app and releases](https://github.com/carsonmcrae/ttsnative/blob/main/docs/architecture/desktop-and-releases.md)
  and [testing the Windows app](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/windows-app-testing.md)
- [Configuration](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/configuration.md)
  and [performance](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/performance.md)
- [Threat model](https://github.com/carsonmcrae/ttsnative/blob/main/docs/security/threat-model.md)
  and [supply chain](https://github.com/carsonmcrae/ttsnative/blob/main/docs/security/supply-chain.md)
