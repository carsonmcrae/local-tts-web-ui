# Testing the Windows app

What is tested automatically on every change to the app, what to check by hand before a major or minor
release, and the latest results. Design: [desktop-and-releases.md](../architecture/desktop-and-releases.md).

## Automated (Desktop workflow, clean `windows-2025` runner)

| Check                                                                                                                                                                    | Where                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Shell formatting, clippy (`-D warnings`), unit tests (settings file, reminders, version comparison)                                                                      | `desktop.yml` → shell             |
| Installer builds from the locked runtime; the model is SHA-256 verified                                                                                                  | `npm run desktop:build`           |
| Silent per-user install; Installed Apps shows version and publisher                                                                                                      | `scripts/desktop/smoke-test.mjs`  |
| The app starts its server; the bundled Kokoro model is ready without a download                                                                                          | smoke test                        |
| Real speech (voice preview) and an MP3 export of pasted text                                                                                                             | smoke test                        |
| Only the app's window is visible: no console windows from the server or its helpers                                                                                      | smoke test                        |
| A second launch reuses the running app; closing the window stops the server                                                                                              | smoke test                        |
| The document is still there after a restart; uninstalling removes the app and keeps the data                                                                             | smoke test                        |
| Update path: notice with notes; wrong signature and broken download refused (old version keeps running); verified update installs, reopens and keeps the user's document | `scripts/desktop/update-test.mjs` |
| Release only: the update signature matches the key in the app, then the same smoke test on the signed build                                                              | `release.yml`                     |
| UI: update notice, install progress and failures, remind later, automatic checks, release history, What's new (mocked app)                                               | `apps/web/src/features/updates`   |
| Version, change-file and release-notes rules; concurrent branches never collide                                                                                          | `npm run test:scripts`            |

## By hand, before a major or minor release

On a Windows 11 machine (or VM) **without** developer tools, using the installer from the release
candidate's Desktop workflow artifact:

1. Download the installer in a browser and run it (note the SmartScreen prompt while unsigned).
2. Install with **Create desktop shortcut** ticked; start from the Start menu and from the shortcut.
3. Open a PDF, an EPUB and a Word document; choose a voice; listen past a few sentences.
4. Export an MP3 and a chapter ZIP; play them.
5. Resize, minimise, maximise, close and reopen; the window comes back where it was, the document resumes.
6. Record a quick custom voice (needs voice cloning from Settings, several GB) and read with it.
7. Settings → About: version, Release history, What's new, Check for updates, Open data/log folder.
8. Turn the network off: reading still works; Check for updates explains it couldn't connect.
9. Install the next build over it: data kept; What's new opens once.
10. Uninstall without and then (after reinstalling) with **Delete the application data**; check the
    second confirmation and which folders remain.

## Latest results

**2026-10-21, development build `2.1.0-dev.88` (first build, pull request #37).**

- **CI, clean `windows-2025` runner (Windows Server 2025, not Windows 11):** installer 371 MB, installed
  size about 600 MB. Every smoke-test check passed; the only failure was the test checking Installed Apps
  before the background uninstaller had finished (the test now waits).
- **This maintainer's Windows 11 PC (not a clean machine; installed per user, then uninstalled):**
  checksum verified; silent install from PowerShell (no app launch, Start Menu shortcut, Installed Apps
  entry with version, publisher, size and homepage); window titled "TTSNative"; server healthy in about
  2.5 s; the page reaches the app's commands (version, folders, update check; Tauri falls back from its
  `ipc.localhost` transport to `postMessage` because the server's CSP allows only `'self'`);
  WebView2 data in `%LOCALAPPDATA%\com.ttsnative.desktop\EBWebView`; silent uninstall removed the app,
  the shortcut, the Installed Apps entry and the install folder and kept the data.
- **Bundled runtime against the shell's launch (emulated):** bundled Kokoro ready without a download,
  speech in 0.8 s, clean exit 0.9 s after the app closes the server's stdin.
- **Found and fixed:** the server hung at start when the app watched its stdin (Windows stalls DLL loading
  while a thread reads a pipe; now polled); a layout comment rendered as text at the top of the UI; the
  server reported 2.0.0 while the app was a development build; update errors showed technical details.
- **Not yet done:** an interactive install on a clean Windows 11 machine without developer tools, a
  custom voice in the installed app (needs the multi-gigabyte voice-cloning download), and the
  SmartScreen experience of a published download.
