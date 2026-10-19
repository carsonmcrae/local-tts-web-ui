# Development

A short orientation for contributors. For the full rules, read
[CONTRIBUTING.md](https://github.com/carsonmcrae/local-tts-web-ui/blob/main/CONTRIBUTING.md).

## How it fits together

A React and TypeScript single-page app talks to one local FastAPI process over same-origin HTTP. The
server extracts documents in a sandboxed subprocess, splits them into sentences, synthesises each
sentence on demand, caches the audio by content hash and streams it back. The optional voice-cloning
engine runs in a separate Python environment and is driven over stdio.

## Repository layout

| Path                     | What's there                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | The UI: Vite, React 19, Tailwind v4, Radix primitives, TanStack Query, React Router                                        |
| `apps/server`            | The API server, Python package `ltts` (`src/ltts`): `documents`, `synthesis`, `engines`, `voices`, `exports`, `modelstore` |
| `apps/chatterbox-worker` | The optional cloning engine: a separate uv project (Python 3.11, PyTorch 2.6) installed on demand                          |
| `scripts/`               | Node scripts: bootstrap (pinned uv, locked environment, model install), process orchestration and repository checks        |
| `tests/`                 | Playwright end-to-end tests (`e2e/`), sample documents (`fixtures/`) and the benchmark (`perf/`)                           |
| `docs/`                  | Architecture, guides, security documents, and this wiki's source (`docs/wiki`)                                             |

Web unit tests sit next to the code (`apps/web/src/**/*.test.ts(x)`); server tests are in
`apps/server/tests/`.

## Main npm scripts

| Command                                  | Purpose                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`                            | API (auto-reload) and web UI (hot reload)                                       |
| `npm run start`                          | Production-style: one process serves the built UI and the API                   |
| `npm run check`                          | Everything CI's fast gate runs: format, lint, types, API contract, tests, build |
| `npm run test` / `npm run test:coverage` | Unit and component tests (web and server)                                       |
| `npm run test:inference`                 | Real-model tests (needs the Kokoro model; Chatterbox optional)                  |
| `npm run test:e2e`                       | Playwright journeys with real inference (run `npx playwright install` once)     |
| `npm run lint` / `npm run format`        | ESLint, ruff and repository rules / Prettier and ruff format                    |
| `npm run typecheck`                      | TypeScript (web, scripts, e2e) and mypy (strict)                                |
| `npm run api:types`                      | Regenerate the web app's API types after changing API models                    |
| `npm run security` / `npm run licenses`  | Dependency audits / licence inventory                                           |
| `npm run doctor`                         | Environment diagnostics                                                         |

## Testing levels

| Level           | Command                  | Models needed             | Runs in CI                            |
| --------------- | ------------------------ | ------------------------- | ------------------------------------- |
| Unit, component | `npm run test`           | No (`FakeEngine`)         | Yes                                   |
| Coverage gates  | `npm run test:coverage`  | No                        | Yes (web ≥ 75 % lines, server ≥ 85 %) |
| Real inference  | `npm run test:inference` | Yes                       | Manual or weekly workflow             |
| End to end      | `npm run test:e2e`       | Yes (Chatterbox optional) | Manual workflow                       |

The end-to-end suite builds the UI, starts isolated servers, and runs Playwright in Chromium, Firefox,
WebKit, and Pixel 7 and iPhone 13 emulation with real audio. CI runs the server tests on Ubuntu,
Windows and macOS. See the
[testing guide](https://github.com/carsonmcrae/local-tts-web-ui/blob/main/docs/guides/testing.md) for
what is and isn't covered.

## Conventions

- **File headers.** Every source and test file starts with `Purpose:`, `Scope:` and
  `Does NOT belong:`.
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

Security-sensitive code (request security, the document sandbox and ZIP checks, the model store, voice
profiles and the download helper) needs a test for every behaviour change and a review from a code
owner.

## Pull requests

1. Branch from `main` and keep the change focused.
2. Add or update tests and run `npm run check` (plus `test:inference` and `test:e2e` for playback or
   UI changes).
3. Update the docs and `CHANGELOG.md` under `Unreleased`.
4. Fill in the pull request template, including anything you couldn't test.

Contributions are licensed under the MIT licence.

## Releases

Releases follow Semantic Versioning. The version appears in six places, and `npm run lint:repo` fails
if they disagree. Pushing a version tag runs the Release workflow, which checks the tag against the
app version and a dated `CHANGELOG.md` entry, runs `npm run check`, and publishes the release with
checksums (`SHA256SUMS.txt`), SBOMs and signed build provenance. See the
[release process](https://github.com/carsonmcrae/local-tts-web-ui/blob/main/docs/guides/release-process.md).

## Editing this wiki

The wiki is written in the repository under `docs/wiki/` and published by the **Wiki** workflow when
changes reach `main`, so wiki edits are reviewed in pull requests like code. File names are page
names (`Getting-Started.md` becomes **Getting Started**), and links between pages look like
`[Voices](Voices)`.

## Further reading

- [Architecture overview](https://github.com/carsonmcrae/local-tts-web-ui/blob/main/docs/architecture/overview.md)
  and [design decisions](https://github.com/carsonmcrae/local-tts-web-ui/blob/main/docs/architecture/decisions.md)
- [Configuration](https://github.com/carsonmcrae/local-tts-web-ui/blob/main/docs/guides/configuration.md)
  and [performance](https://github.com/carsonmcrae/local-tts-web-ui/blob/main/docs/guides/performance.md)
- [Threat model](https://github.com/carsonmcrae/local-tts-web-ui/blob/main/docs/security/threat-model.md)
  and [supply chain](https://github.com/carsonmcrae/local-tts-web-ui/blob/main/docs/security/supply-chain.md)
