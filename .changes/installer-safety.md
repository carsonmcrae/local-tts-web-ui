---
bump: patch
desktop: changed
browser: limited: the installer and the update check exist only in the Windows app
phone: limited: the installer and the update check exist only in the Windows app
website: unchanged
docs: changed
---

## Fixed

- The Windows installer checks that the drive has room for the new version before it touches
  anything, and says so plainly when it doesn't; an update that can't go ahead for lack of space
  reopens the version you have.
- When no update has been published yet, the app says so instead of blaming your internet connection.
- The uninstaller's question about deleting your data now names everything it would remove: the data
  folder, the remembered window position and the entry the installer keeps for its folder.

## Technical

- `hooks.nsh`: `NSIS_HOOK_PREINSTALL` compares `${DriveSpace}` on the install drive with Tauri's
  `${ESTIMATEDSIZE}` plus a 200 MB margin, aborts with error level 3 (a message box unless silent) and
  in `/UPDATE` mode relaunches the installed `TTSNative.exe`; `scripts/desktop/space-test.mjs` proves it
  on a 256 MB virtual disk (diskpart; administrator). `updates.rs` maps
  `tauri_plugin_updater::Error::ReleaseNotFound` to a new `CheckResult::NoRelease` (the web app's
  `noRelease` status, "No update has been published yet."), logged but not remembered as a check.
  `update-test.mjs` also signs B with a second throwaway key and proves that signature is refused.
  `scripts/desktop/processes.mjs` lists every process under the install or data folder (server,
  WebView2, uv, the Chatterbox worker `python.exe`); the persistence test requires none after a close or
  a crash. `build.mjs` takes the `TTSNATIVE_TAURI_CONFIG` overlay only for a test build
  (`TTSNATIVE_TEST_HOOKS=1`) and only for `plugins.updater`; a release build refuses it
  (`build-config.mjs`, with tests).
