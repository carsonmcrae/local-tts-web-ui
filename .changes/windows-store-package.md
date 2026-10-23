---
bump: minor
desktop: changed
browser: limited: deleting the app's data is only offered in the Windows app, which owns those folders
phone: limited: deleting the app's data is only offered in the Windows app, which owns those folders
website: unchanged
docs: changed
---

## New

- You can delete everything TTSNative keeps for you from **Settings → About → Delete my data…** in the Windows app. It asks you to confirm, then closes and removes your library, voices, recordings, settings and logs.

## Technical

- Microsoft Store build (ADR-26): the desktop shell's `store` Cargo feature leaves out the updater plugin, answers update checks with `store` and reports `updates: "store"` in `desktop_info`, so About says the Microsoft Store keeps TTSNative up to date and hides the GitHub checks. `npm run desktop:store` builds the program with that feature and packs `TTSNative-<version>.msix` with `scripts/desktop/msix.mjs`: a full-trust Windows 11 package whose user folder is excluded from file-system virtualisation, logos made from the brand icon, identity from `apps/desktop/store/identity.json` (a test identity until Partner Center's is recorded). The Desktop workflow lints and tests the shell with the feature too, and a new "Microsoft Store package (MSIX)" job builds the package with the runner's Windows SDK and keeps it as an artifact for sideloading.
- `delete_user_data` (`erase.rs`): refuses any folder not named after the app's identifier, stops the server, and a hidden `cmd.exe` removes `%LOCALAPPDATA%` and `%APPDATA%\com.ttsnative.desktop` with `rmdir /s` (links inside are removed, not followed) once the app has closed, retrying for 30 seconds; the folder paths reach it only through environment variables. `ConfirmDialog` takes `confirmDisabled`.
