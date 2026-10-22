# Testing

| Command                                                                                                                                        | What it runs                                                                                                                                      | Needs models?                     | In CI?                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------ |
| `npm run test`                                                                                                                                 | Web unit/component tests (Vitest, jsdom) + server tests (pytest, `FakeEngine`)                                                                    | No                                | Yes                      |
| `npm run test:coverage`                                                                                                                        | The same with coverage gates: 100 % of statements, branches, functions and lines in both apps                                                     | No                                | Yes                      |
| `npm run test:inference`                                                                                                                       | Real Kokoro (and Chatterbox if installed) through the API: PDF → narration, voices, pace, cloning                                                 | Yes                               | Manual / weekly workflow |
| `npm run test:e2e`                                                                                                                             | Builds the UI, starts two isolated servers, runs Playwright across Chromium, Firefox, WebKit, Pixel 7 and iPhone 13 emulation with real inference | Yes (Kokoro; Chatterbox optional) | Manual workflow          |
| `npm run check`                                                                                                                                | Format, lint, type-check, API-contract check, unit tests, build                                                                                   | No                                | Yes                      |
| `node scripts/uv-run.mjs --cwd apps/server run --frozen python ../../tests/perf/benchmark.py`                                                  | Performance measurements                                                                                                                          | Yes                               | No                       |
| `node scripts/uv-run.mjs --cwd apps/server run --frozen python ../../tests/perf/narration_benchmark.py --out FOLDER --voice kokoro:af_heart …` | Reads thirteen held-out passages with the voices you name, measures each, and writes blind listening packs (docs/research/voice-library.md)       | Yes                               | No                       |

## Layout

- `apps/server/tests/` — pytest. `builders.py` generates PDFs, DOCX, EPUBs and hostile archives in code;
  `conftest.py` provides `FakeEngine` (deterministic tones) so API, cache, export and job logic run without
  models. `test_inference.py` is marked `inference` and skips when models are missing.
  The suite runs in parallel (pytest-xdist, one worker per CPU, at most eight), so every test must stand
  alone; add `-n 0` to run serially, e.g. when stepping through one test in a debugger. The inference tests
  always run serially.
- `apps/web/src/**/*.test.ts(x)` and `apps/web/src/test/` — Vitest + Testing Library. `render.tsx` mounts
  screens with the real providers and a route-table `fetch` mock.
- `tests/e2e/` — Playwright. `scripts/e2e-server.mjs` serves the production build from a throwaway data
  directory (`.e2e-data/<port>`) with the real installed models (port 8799) or no models (port 8798).
- `tests/fixtures/documents/` — small sample documents (regenerate with `tests/fixtures/make_fixtures.py`).

## What the coverage numbers mean

The 100 % gates measure **unit and component tests**, which run with fakes instead of models:

- **Web:** every file under `apps/web/src`, except tests and test helpers, the generated API types
  (`schema.gen.ts`) and the eight-line `main.tsx` bootstrap. `fetch` is mocked, so no real server or
  audio is involved.
- **Server:** the whole `ltts` package with branch coverage. Engines are replaced by `FakeEngine`, so
  the API, jobs, caching, exports, documents and model store are exercised without loading a model.
  Only `if TYPE_CHECKING:`, `raise NotImplementedError`, `@overload` and `__main__` guards are
  excluded.
- **There are no ignore comments** (`# pragma: no cover`, `v8 ignore`) in either app.

Outside those numbers:

- **The Chatterbox worker** (`apps/chatterbox-worker/src`, about 360 lines) has no unit tests. Its
  protocol is tested from the server side with a fake worker, and its real behaviour only by
  `npm run test:inference` on a machine with Chatterbox installed (not in CI).
- **The Node scripts** (`scripts/`, about 4,000 lines: setup, dev, start, doctor, site and media builds)
  have no unit tests. CI runs the site build; the weekly inference workflow runs a clean `setup`; the
  e2e suite starts every server through `scripts/e2e-server.mjs`.
- **The website script** (`site/demo.js`) is tested in real browsers by `tests/e2e/site.spec.ts`, not by
  a coverage tool.

Real inference and real browsers are covered separately: `npm run test:inference` (real Kokoro and
Chatterbox through the API) and `npm run test:e2e` (real Kokoro audio played in Chromium, Firefox,
WebKit and phone emulation, plus the website in all of them).

## What the end-to-end suite proves

Real audio is generated by Kokoro and played by each browser: the tests wait for the highlighted sentence
to advance, which only happens when the `<audio>` element reaches `ended`. Uploads of every format,
invalid files, resume after reload, voice switching, export + download, custom voice creation and deletion
(with a synthetic Kokoro voice as consented test audio), Chromium fake-microphone recording, the
missing-model experience, axe accessibility scans and phone layouts are covered.

## What is not covered automatically

- Real microphones and real Safari/iOS devices (Playwright's WebKit build on Windows was used; real Apple
  hardware was not available).
- macOS and Linux runs of the full suite (CI runs the server unit tests on Ubuntu, Windows and macOS and the web tests on Ubuntu; see `ci.yml`).
- Subjective audio quality — tests check that speech is present, loud enough and correctly timed, and
  cloning is checked with speaker-embedding similarity during development, not by listening.

## Conventions

- Test files carry the same `Purpose / Scope / Does NOT belong` header as source files.
- No snapshot-only tests; assert behaviour.
- A test that only passes on retry is reported as flaky, not as passing.
