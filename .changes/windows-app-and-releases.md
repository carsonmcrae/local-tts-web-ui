---
bump: minor
---

## New

- Install TTSNative on Windows 11 like any other app: it opens in its own window from the Start menu
  or an optional desktop shortcut, with nothing else to set up.
- The default voice comes with the app, so you can start listening right after installing.
- TTSNative lets you know when a new version is available, shows what's new, and installs it for you
  once you agree. You can turn these checks off.
- See what changed in every version under Settings, About, even without an internet connection.

## Improved

- Updating keeps your documents, voices and settings, and uninstalling asks twice before deleting them.

## Technical

- apps/desktop: Tauri 2 shell (single instance, window state, navigation allowlist, kill-on-close Job
  Object for the server, loopback port from 8770), splash screen and per-user NSIS installer with
  hooks; runtime assembled by scripts/desktop/build-runtime.mjs (python-build-standalone 3.12 via the
  pinned uv, hash-checked server packages, byte-compiled, Kokoro bundled); `npm run desktop:build`.
- Signed updates with tauri-plugin-updater (minisign) from GitHub Releases `latest.json`; Authenticode
  signing hooks ready for when a certificate exists.
- Server: `ltts serve --exit-with-stdin`, `LTTS_BUNDLED_MODELS_DIR` (read-only models, repair copies
  intact files), `LTTS_WORKER_PROJECT_DIR`, `LTTS_UV_PYTHON_DIR`, and no console windows for helper
  processes on Windows.
- Release tooling: change files (.changes/), `npm run change`, `release:status`, `release:prepare`,
  check-changes in CI, user-facing notes in docs/releases/ (backfilled for 1.0.0 and 2.0.0), build
  identifiers for development builds, and version files listed once (scripts/lib/version-files.mjs).
- Web: update notice, release history and What's new in Settings → About; website download and
  release history pages generated from docs/releases.
