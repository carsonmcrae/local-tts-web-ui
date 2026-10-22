---
bump: none
---

## Technical

- The server tests run in parallel with pytest-xdist (one worker per CPU, at most eight; `-n 0` runs
  them serially, and `npm run test:inference` always does), taking well under half as long. Tests made
  deterministic for it: two parametrized cases named by zip bytes that embed the build time; the
  idle-unload test, which now waits for the watcher to release the worker lock; the speech API's
  log-secrets test, which now checks what the log handler writes (at debug and normal levels, with
  tests proving it catches a leaked token or text) instead of each record's clock and thread numbers;
  and two CLI tests that left the app's logging setup in place for later tests.
- CI runs the web unit tests in their own job beside the web checks, and Validate requires it.
- Desktop workflow: the installer and update-path jobs no longer wait for the shell checks; the installer
  job saves the Cargo and runtime caches right after its build (so a failing test still leaves them warm)
  and the update job only restores them; a lockfile change starts from the newest cache for the same
  toolchain; the Cargo cache leaves out the copied runtime and the built installer.
