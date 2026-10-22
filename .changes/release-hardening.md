---
bump: patch
---

## Security & reliability

- The switch the automated tests use to look inside the Windows app's window is no longer built into
  released versions, and a release can't be built with it.

## Technical

- apps/desktop: a `test-hooks` Cargo feature gates `--remote-debugging-port=N`; `build.mjs` compiles it
  only with `TTSNATIVE_TEST_HOOKS=1`, refuses it for a release version, and checks the binary for the
  switch text either way (`scripts/desktop/check-test-hooks.mjs`); the Desktop workflow sets it for its
  installer and update builds and checks a plain release build; release.yml leaves it unset. The app
  drops `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` from its environment at start.
- release.yml fails closed: the `release` environment must exist with a required reviewer, and both
  signing secrets must be present.
- Dependabot: a cargo entry for the Windows shell with a 14-day cool-down; `glib` (Linux-only, not
  compiled for Windows) is ignored so its security-update job stops failing.
