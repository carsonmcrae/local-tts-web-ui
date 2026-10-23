# Code-quality review: 2.2.0

SonarQube analysed `cca275b` on 2026-10-22 (local server, project `local-tts-web-ui`), judged by the
"TTSNative" gate described under Policy; the result the
release gate reads is in [quality.json](quality.json). This page says what that analysis covered, what
it didn't, and why each remaining finding was accepted rather than changed.

## Result

| Measure                                  | Value                                           |
| ---------------------------------------- | ----------------------------------------------- |
| Quality gate ("TTSNative", 8 conditions) | Passed                                          |
| Line coverage                            | 100 % (18,651 lines)                            |
| Branch coverage                          | 100 % (6,589 conditions)                        |
| Duplicated lines and blocks              | 0 % and 0                                       |
| Bugs, vulnerabilities, code smells       | 0, 0, 0                                         |
| Security hotspots                        | 27 found, 27 reviewed (all safe, reasons below) |
| Accepted issues                          | 6, plus 6 marked false positive (reasons below) |
| Reliability, security, maintainability   | A, A, A                                         |
| Lines of code analysed                   | 51,991 in 456 files                             |

The first analysis of the integrated branch (`c086acf`) failed the gate with 173 open issues (11 bugs,
2 vulnerabilities, 160 code smells) and 26 unreviewed hotspots. 161 were fixed in the code, with no
suppression comments, excluded files or lowered thresholds; two of them were real defects (the blend
dialog keyed its rows by position, and the update test used a fixed password for its throwaway keys).
The other 12 are the reviewed exceptions below.

## Policy

For the measured code (the web app and the server, below), the project requires 100 % line and branch
coverage, no duplicated lines or blocks, no bug, vulnerability or code smell, and every security hotspot
reviewed. Two things enforce it:

- **The SonarQube server** judges the project by a quality gate named "TTSNative" with those thresholds
  on new code and on the whole project. `npm run sonar:gate` creates or restores it. Until 2026-10-22 the
  server used SonarQube's default gate (80 % coverage and up to 3 % duplication on new code), which the
  analyses passed with room to spare but which allowed far less than the policy.
- **The release gate** checks the measures recorded in [quality.json](quality.json) against the same
  policy, so a server reset to a looser gate can't let a release through.

The test suites enforce coverage first: Vitest and pytest fail below 100 % line and branch coverage, and
jscpd fails on any duplicated block, in every CI run.

## What the analysis covers

- **Sources:** `apps/web/src`, `apps/server/src`, `apps/chatterbox-worker/src`, `scripts`, `.github`,
  `site` and three configuration files (`sonar-project.properties`).
- **Coverage imported:** Vitest's lcov for the web app and pytest's XML for the server. Both suites
  enforce 100 % line and branch coverage themselves (`apps/web/vite.config.ts`,
  `apps/server/pyproject.toml`), so the gate's coverage figure is the coverage contract.

## Outside the coverage figure

These files are analysed for bugs, smells and hotspots but not counted in coverage
(`sonar.coverage.exclusions`), each for the reason given and checked another way:

| Files                                        | Why                                                      | Checked instead                                                                                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/**` (70 modules)                    | Build, release and CI tooling, not shipped               | 66 script tests; the libraries they cover measure 96.1 % lines, 92.3 % branches, 97.8 % functions (`node --test` coverage). The CLIs run in CI                                                       |
| `apps/chatterbox-worker/**` (926 lines)      | Runs in its own CUDA and torch environment               | Real-model tests (`npm run test:inference`) on the maintainer's computer only; skipped in CI. No unit tests: a known gap                                                                             |
| `site/**`, `.github/**`, configuration files | Static website, workflow definitions, tool configuration | The website is built in CI (`npm run site:build`) and tested with axe in Inference & E2E (`site.spec.ts`); workflow actions are pinned to commit SHAs and reviewed by hand (no workflow linter runs) |

**Not analysed by SonarQube at all:** the Rust desktop shell (`apps/desktop/src-tauri`, 985 lines). The
Desktop workflow checks it with rustfmt, `cargo clippy -D warnings` (with and without the test hooks),
`cargo test` and cargo-deny; CodeQL covers JavaScript, TypeScript and Python only.

## Accepted issues

| Finding                                                             | Why it stays                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cookie without `Secure` (`lan/router.py`)                           | LAN mode is plain HTTP by design (accepted risk R-6); a browser never sends a Secure cookie over HTTP, so pairing would stop working. The cookie is HttpOnly, SameSite=Strict, bound to the pairing address, expiring, stored hashed |
| Regex complexity (`scripts/lib/semver.mjs`)                         | The SemVer 2.0.0 specification's own pattern, character-for-character identical to semver.org (checked 2026-10-22)                                                                                                                   |
| `role="region"` and `tabindex="0"` on a `<pre>` (`site/index.html`) | Keeps the sideways-scrolling install commands reachable by keyboard at phone width (WCAG 2.1.1); removing them fails axe                                                                                                             |
| Meta refresh (`site/download/index.html`)                           | Starts the installer download a second after the download page opens, with a visible link; GitHub Pages can't redirect on the server                                                                                                 |
| Cognitive complexity 47 (`scripts/library/gutenberg_dickinson.py`)  | A one-shot tool that built one bundled book; its pinned source text isn't on this machine, so a refactor couldn't be proved to rebuild the same book                                                                                 |

## False positives

`dataclasses.replace` results passed on in `speech_api/store.py` (five places) and returned in
`synthesis/render.py`: SonarQube resolves typeshed's `_DataclassT` to its bound instead of the argument's
type. `mypy --strict` infers the exact dataclass, and the server passes it.

## Security hotspots (27, all reviewed safe)

- **Regular expressions that could backtrack (14):** two see user input and are bounded first (an
  imported HTML file's first 4 KB; a text selection, refused over 1,000 characters before any pattern
  runs). The rest read the app's bundled release notes or this repository's own files at build time.
- **`http` addresses (6):** a language model on this computer (loopback only, enforced), the LAN address
  (R-6), and four XML namespace names that are never fetched.
- **Pseudorandom generators (2):** seeded shuffles that hide which voice is which in blind listening tests.
- **`PATH` lookups (3):** release tooling calling `gh` (twice) and `tar` on the maintainer's computer or a
  GitHub-hosted runner.

Each verdict is recorded in SonarQube with its reasoning.
