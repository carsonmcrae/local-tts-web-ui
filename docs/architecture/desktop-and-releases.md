# Windows app, updates and releases

> **In short:** the Windows app is a small Tauri 2 window around the existing React UI. It starts the
> existing FastAPI server, bundled with its own Python, on `127.0.0.1` and stops it on exit (LAN mode,
> turned on in Settings, adds a second listener on one home-network address until the app restarts). A per-user
> NSIS installer puts the program in `%LOCALAPPDATA%\TTSNative` and keeps the user's data separately in
> `%LOCALAPPDATA%\com.ttsnative.desktop`. Updates come only from GitHub Releases and are verified with a
> signature before anything is installed. Every pull request declares its release impact in a change
> file. A release turns those files into the next version and into reviewed, plain-language notes,
> which the app, the website and GitHub all show.

This document records the audit, the decisions and their trade-offs. The ADRs in
[decisions.md](decisions.md) (ADR-19 to ADR-21) summarise them, and
[release-process.md](../guides/release-process.md) is the maintainer's checklist.

## 1. What existed (audit, 2026-10-21)

| Area             | Before                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Running the app  | Source only: Git, Node.js 22.22 and `npm run dev` (the bootstrap fetches a pinned uv, Python 3.12 and the Kokoro model). One process serves UI and API on loopback in `npm start`.                                   |
| Data             | `<repo>/data` (database, documents, voices, models, engines, cache, exports). The database stores names and ids, not absolute paths, so the folder can be moved.                                                     |
| Version          | `2.0.0` written by hand in six places, kept equal by `check-version.mjs`; the newest `CHANGELOG.md` heading must match.                                                                                              |
| Changelog        | Keep a Changelog. Entries mix user-facing text with API, dependency and tooling details. Since 2.0.0 everything merged went under `[Unreleased]`, so concurrent branches all edited the same section.                |
| Releases         | `v1.0.0` (the Gradio prototype, tagged 2026-10-19 for history) and `v2.0.0`. Tag push → `release.yml`: checks, source + web-UI archives, SBOMs, `SHA256SUMS.txt`, provenance attestations, notes from the changelog. |
| Website          | `site/` built by `build-site.mjs`, deployed by `pages.yml` to ttsnative.com; install section described the source install only.                                                                                      |
| Settings → About | App and server version, system information, diagnostics; no update or release information.                                                                                                                           |
| Privacy promise  | No telemetry; the only network requests are model downloads the user starts.                                                                                                                                         |

**Recalen and PicPledge** (reviewed for reusable patterns). PicPledge keeps one canonical version in a
JSON file with a verifier that checks every copy, ships user-facing notes as data with a jargon test,
and shows them in a versions page; but each branch claims its own next version (heavy locking, and the
version moves while branches are open), and its enforcement lives in local hooks while CI is paused.
Recalen shows New / Improved / Fixed notes in Settings → About and orders them by SemVer; but its version
is hard-coded in about thirty files, there are three version schemes, and the guard isn't in CI.
TTSNative keeps the good parts (one verified version, notes as data with a plain-language lint, New /
Improved / Fixed sections, history in About, CI enforcement) and avoids per-branch version numbers.

## 2. Desktop shell: Tauri 2

| Option                  | Verdict                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tauri 2** (chosen)    | Uses the WebView2 runtime that ships with Windows 11 (no bundled browser), a small Rust shell, a signed updater that drives its own NSIS installer, capabilities that limit what the page may call. |
| Electron                | Bundles Chromium and Node (≈ 100 MB more, its own update cadence and attack surface) for no feature TTSNative needs.                                                                                |
| pywebview / browser tab | No installer or updater story; a browser tab isn't a desktop app.                                                                                                                                   |
| Wails, Neutralino       | Smaller ecosystems; no updater as mature as Tauri's.                                                                                                                                                |

The window loads the existing UI **from the local server** (`http://127.0.0.1:<port>/`), so the UI is
unchanged and every existing protection applies as before: Host checks, the custom request header,
`Sec-Fetch-Site`, the CSP and same-origin requests. Only the start-up screen is bundled in the shell.

- **Port.** 8770 first, then up to 8789. A fixed first choice keeps the page's origin, and so its
  per-device settings in `localStorage` (theme, reading text, library sort), the same between launches.
- **Process lifetime.** The server is started with `CREATE_NO_WINDOW` (no console) inside a Job Object
  with _kill on job close_: if the app crashes, Windows ends the server and its helpers. On a normal
  exit the app closes the server's stdin (`ltts serve --exit-with-stdin`), the server shuts down
  cleanly, and after 8 s it is ended. Inherited `LTTS_*` variables are removed so a global setting
  can't turn on network mode, and Python runs isolated (`-I`), ignoring `PYTHON*` variables.
- **Single instance.** A second launch focuses the running window; only the app starts the server.
- **Navigation.** Only the start-up screen and the server's own origin load in the window. Other links,
  including `target="_blank"`, open in the default browser; nothing can open a second web view.
- **What the page may call** (`capabilities/app.json`, granted to `http://127.0.0.1:*` only): version
  and folders, update check / remind later / automatic checks / install, and opening the data or log
  folder. No file system, shell or HTTP access is exposed to the page.
- **Drag and drop** is left to the web UI (Tauri's handler is disabled), so dropping documents and
  recordings works as in a browser. Microphone access uses WebView2's normal permission prompt.

## 3. Bundled runtime

| Option                               | Verdict                                                                                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **python-build-standalone** (chosen) | The same CPython builds uv uses for development, installed and checksum-verified by the pinned uv; packages from the locked `uv.lock` with hashes. No packer, so nothing unpacks to `%TEMP%` and antivirus heuristics have less to object to. |
| PyInstaller / Nuitka                 | Self-extracting bootloaders are frequent antivirus false positives; another build tool to trust.                                                                                                                                              |
| python.org embeddable zip            | 3.12 is security-only and its binaries stop at 3.12.10.                                                                                                                                                                                       |

`scripts/desktop/build-runtime.mjs` assembles `apps/desktop/runtime/`: Python 3.12.14 (renamed
`ttsnative-backend.exe` so Task Manager shows what it is), the server's locked packages and `ltts`
byte-compiled with unchecked hashes (run with `-B`, nothing is written into the install folder), the
built UI, the optional voice-cloning project and the pinned uv (installed on request into the user's
folder, as in development), and the Kokoro model downloaded and SHA-256-verified by the server's own
model store. `runtime-manifest.json` records what went in. The model is used read-only from the
install folder (`LTTS_BUNDLED_MODELS_DIR`) until the user has a copy of their own; **Repair** copies
the intact bundled files and downloads only damaged ones. Chatterbox stays out of the installer
(≈ 4.5–8 GB) and is installed from Settings, as before.

## 4. Installer and user data

Tauri's NSIS bundler, per-user (`installMode: currentUser`, no administrator rights):

- Program: `%LOCALAPPDATA%\TTSNative` (replaced on every update). User data:
  `%LOCALAPPDATA%\com.ttsnative.desktop\` → `data\` (the server's data directory), `logs\`
  (`server.log`, `server.previous.log`, `desktop.log`), `desktop.json` (update settings) and the web
  view's storage. Window size and position: `%APPDATA%\com.ttsnative.desktop`.
- Start Menu shortcut; desktop shortcut offered on the finish page; Installed Apps entry with version,
  publisher, size and homepage; no downgrades. WebView2 is part of Windows 11 (the installer fetches
  Microsoft's bootstrapper only if it is missing).
- **Upgrades** install over the old version; the runtime folder is replaced as a whole (installer hook),
  so files a newer version no longer ships don't linger. User data is never touched.
- **Uninstall** keeps user data by default. Ticking _Delete the application data_ brings up a second,
  explicit question naming what will be deleted; only then is the data folder removed.
- **From a source install**: close both, then copy the contents of `<repo>\data` into
  `%LOCALAPPDATA%\com.ttsnative.desktop\data`, leaving out `engines\` (the voice-cloning environment is
  tied to its folder; reinstall it from Settings). Nothing is moved or deleted automatically.

NSIS was kept over Inno Setup because Tauri's updater knows how to run its own installer (passive mode,
`/UPDATE`, restart afterwards); Inno would need a separate updater.

## 5. Updates

```text
GitHub Release vX.Y.Z ── latest.json (version, notes, date, url, minisign signature)
        │ HTTPS, at most every 12 h (or on request); off with one switch
        ▼
TTSNative (Tauri updater) ── newer than this build? (SemVer; stable releases only)
        │ user: Update now → Install and restart (second confirmation)
        ▼
download → verify signature against the public key built into the app → stop the server
        → run the signed installer in passive mode → the app reopens on the new version
```

- **Source.** `https://github.com/carsonmcrae/ttsnative/releases/latest/download/latest.json`. GitHub's
  _latest_ release is never a draft or pre-release, so development builds and pre-releases are never
  offered. The comparison is SemVer: an older or equal version is never offered, and a development
  build (`2.1.0-dev.4+…`) is offered `2.1.0` once it is released.
- **Notice.** On launch (and every six hours while open) the UI asks the app; the app contacts GitHub
  at most every 12 hours and remembers what it found. _Remind me later_ hides that version for three
  days. Offline, nothing is shown. After an update, _What's new_ opens once.
- **Failures.** Download, signature and launch failures leave the installed version untouched and say
  so, with _Try again_ and the website as a fallback. If the installer itself fails part-way, the app
  may need reinstalling from the website; data is in a separate folder and is kept.

**Updater signing vs. Windows code signing.** They are independent. The _updater signature_
(minisign / Ed25519) proves an update came from this project's release key; Tauri always enforces it
and it cannot be disabled. The private key lives only in the release environment's secrets; losing it
means installed copies can't verify updates any more (they would need a manual reinstall), so it must
be backed up. _Authenticode_ is Windows' publisher signature: without it SmartScreen warns on download
and first run, and Smart App Control may block unsigned binaries. It needs a certificate (see the
release guide); the build accepts a sign command (`TTSNATIVE_WINDOWS_SIGN_COMMAND`) as soon as one
exists. Neither is bypassed: an unsigned build is only ever a test artifact.

**Network connections of the Windows app**: the update check and update download (GitHub, can be
turned off), model and voice-cloning downloads the user starts (as before), and WebView2's own
servicing by Windows. Nothing else; no telemetry was added.

## 6. Versions, change files and release notes

- **One version, never edited on branches.** The current version lives in the files listed in
  `scripts/lib/version-files.mjs` and changes only in a release pull request. `check-version.mjs`
  keeps them equal and refuses anything older than a published tag. The voice-cloning worker keeps its
  own version, because changing its lockfile would offer every installation a needless runtime update.
- **Change files.** Every pull request adds `.changes/<name>.md` with `bump: major | minor | patch |
none` and its entries (see `.changes/README.md`). Separate files never conflict, so concurrent
  branches can't collide; the next version is the current one bumped by the strongest pending bump,
  computed from `main` whenever it is needed (`npm run release:status`, and in every CI run's summary).
- **Development builds** carry `<next>-dev.<commits since the last tag>+<branch>.<commit>`, unique per
  branch and commit, sorted after the release they started from and before the one they lead to.
- **Releasing** is explicit: `npm run release:prepare` writes the version, the dated changelog entry and
  a _draft_ of `docs/releases/X.Y.Z.md`, which CI refuses until a person rewrites it; the maintainer
  merges and pushes the tag. The release workflow publishes nothing unless every check, build and smoke
  test passed and every file is attached.
- **Two audiences.** User-facing sections (New, Improved, Fixed, Security & reliability) are checked for
  technical terms, code, issue numbers, hashes and test counts; Technical entries go to `CHANGELOG.md`
  only. Published notes can be corrected only with a new `revised` date.

## 7. Known limitations

- **No Authenticode signature yet**: SmartScreen will warn until a certificate is in place and the
  installer earns reputation.
- **Windows 11 x64 only.** The shell, runtime builder and installer are separate modules
  (`apps/desktop`, `scripts/desktop`), so macOS (`.app`/`.dmg`) and Linux (AppImage) builds can be added
  later; none is advertised.
- **No beta channel.** Pre-release tags aren't built by the release workflow; the updater follows stable
  releases only.
- **Transitive Rust crates** aren't held to the 14-day cool-down (Cargo has no such setting); direct
  dependencies are pinned and `Cargo.lock` is committed.
