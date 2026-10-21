---
bump: none
---

## Technical

- The server tests run in parallel with pytest-xdist (one worker per CPU, at most eight; `-n 0` runs
  them serially, and `npm run test:inference` always does), taking well under half as long. Two tests
  were made deterministic for it: a parametrized case named by bytes that embed the build time, and the
  idle-unload test, which now waits for the watcher to release the worker lock.
- CI runs the web unit tests in their own job beside the web checks, and Validate requires it.
- Desktop workflow: the installer and update-path jobs no longer wait for the shell checks; the installer
  job saves the Cargo and runtime caches right after its build (so a failing test still leaves them warm)
  and the update job only restores them; a lockfile change starts from the newest cache for the same
  toolchain; the Cargo cache leaves out the copied runtime and the built installer.
