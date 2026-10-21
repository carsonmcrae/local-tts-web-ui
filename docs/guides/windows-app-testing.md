# Testing the Windows app

What is tested automatically on every change to the app, what to check by hand before a major or minor
release, and the latest results. Design: [desktop-and-releases.md](../architecture/desktop-and-releases.md).

## Automated (Desktop workflow, clean `windows-2025` runner)

| Check                                                                                                                                                                    | Where                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Shell formatting, clippy (`-D warnings`), unit tests (settings file, reminders, version comparison)                                                                      | `desktop.yml` → shell                  |
| Installer builds from the locked runtime; the model is SHA-256 verified                                                                                                  | `npm run desktop:build`                |
| Silent per-user install; Installed Apps shows version and publisher                                                                                                      | `scripts/desktop/smoke-test.mjs`       |
| The app starts its server; the bundled Kokoro model is ready without a download                                                                                          | smoke test                             |
| Real speech (voice preview) and an MP3 export of pasted text                                                                                                             | smoke test                             |
| Only the app's window is visible: no console windows from the server or its helpers                                                                                      | smoke test                             |
| A second launch reuses the running app; closing the window stops the server                                                                                              | smoke test                             |
| The document is still there after a restart; uninstalling removes the app and keeps the data                                                                             | smoke test                             |
| Close, then crash: uploaded PDF, Word and EPUB files, reading position and voice, bookmark, pronunciation rule, preferences, MP3 export and window storage all come back | `scripts/desktop/persistence-test.mjs` |
| Update path: notice with notes; wrong signature and broken download refused (old version keeps running); verified update installs, reopens and keeps the user's document | `scripts/desktop/update-test.mjs`      |
| Release only: the update signature matches the key in the app, then the same smoke test on the signed build                                                              | `release.yml`                          |
| Release only: every GPL/LGPL source archive matches its pinned size and SHA-256; the release refuses to publish without it                                               | `release.yml`                          |
| The source manifest covers the versions of espeakng-loader, phonemizer, soundfile and lxml in `uv.lock`                                                                  | `npm run test:scripts`                 |
| UI: update notice, install progress and failures, remind later, automatic checks, release history, What's new (mocked app)                                               | `apps/web/src/features/updates`        |
| Version, change-file and release-notes rules; concurrent branches never collide                                                                                          | `npm run test:scripts`                 |

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

**2026-10-21, clean `windows-2025` runner, commit `4bac5e1` (with pull request #39 merged in):** every
automated check above passed in one run: the shell checks, the installer build, all smoke-test checks,
the close-and-crash persistence test (the window reached through the app's `--remote-debugging-port`
switch; WebView2 there ignores the environment-variable and registry overrides), and the update path
(notice with notes, wrong signature refused, interrupted download refused, verified update installed and
reopened with the document kept). uv 0.13.4 built the runtime.

**2026-10-21, CI build `2.1.0-dev.110` installed over dev.98 on this maintainer's Windows 11 PC (not a
clean machine).**

- **Voice cloning in the installed app:** Settings' install (NVIDIA option) finished in under two
  minutes (uv's cache on this PC already held most packages), a 23-second recording made with the
  built-in voice was analysed (no issues), a custom voice was created from it, a preview in that voice
  answered in 18 s (first use) and an MP3 export of a short text with it finished in 5 s.
- **Close and crash (persistence test, twice):** one run passed completely; in another the window
  closed but the process and its server stayed alive and ignored a second close request (no window
  left, nothing in the logs), so the test failed its close check. It did not happen again, and CI's
  smoke test passed its close check on the same build; this PC is known to flip memory bits, so it is
  recorded here rather than explained. Worth watching for in the manual checks.
- **Release rehearsal on a throwaway copy of the branch:** `release:prepare` produced 2.1.0 from the
  change files, the checks the release workflow runs passed (version in 11 places, no change file left,
  finished notes), the release notes rendered with the installer, download-page and source-archive
  links, the source archive and web SBOM were produced, and the website built against a simulated
  published 2.1.0 advertised the installer, redirected the download page to it and listed all three
  versions. Not rehearsed: the signed installer build, the environment approval and the GitHub
  Release itself (they need the secrets and a tag).

**2026-10-21, development builds up to `2.1.0-dev.98` (pull request #37), on this maintainer's Windows 11
PC (not a clean machine).**

- **Updating in place:** installing dev.98 over dev.88 kept all three documents.
- **Close and reopen, and a crash:** the persistence test against the installed app found every
  uploaded document (PDF, Word, EPUB), reading position and voice, bookmark with its note, pronunciation
  rule, preference, MP3 export and the window's own storage intact after a normal close and after the
  process was killed.
- **What the installed app touches:** the server listens on `127.0.0.1` only (port 8770); WebView2's
  network log shows only loopback traffic (update checks come from the app itself and go only to
  GitHub Releases); no firewall rule, service, scheduled task or startup entry; files only under `%LOCALAPPDATA%\TTSNative` (app) and
  `%LOCALAPPDATA%\com.ttsnative.desktop` (data, logs, WebView2).
- **Contents:** all 3,721 files of the installed Python packages match the SHA-256 in their wheels'
  RECORD files; no secrets, keys or tokens in any of the 7,224 files; the 7 signed executables are
  Microsoft's (ONNX Runtime, Visual C++ runtime) and uv's, byte-identical to the pinned uv release; the
  rest, including `TTSNative.exe` until Authenticode signing is set up, are unsigned. See
  `docs/security/supply-chain.md`.
- **Source offer:** all 16 archives in `apps/desktop/third-party-sources.json` downloaded and matched
  their pinned size and SHA-256 (bundle 58 MB).

**2026-10-21, development build `2.1.0-dev.88` (first build).**

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
