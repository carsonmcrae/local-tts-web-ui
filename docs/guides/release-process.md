# Release process

TTSNative follows [Semantic Versioning](https://semver.org/): **major** for changes that break data,
setup or behaviour people rely on, **minor** for anything new, **patch** for fixes, security fixes and
maintenance. The design behind this guide is in
[desktop-and-releases.md](../architecture/desktop-and-releases.md) (ADR-19 to ADR-21).

## The flow

1. Development happens on a branch.
2. The pull request adds a **change file** (`npm run change -- minor`) that declares its bump and its
   notes: plain-language entries for users, technical ones for developers. See
   [.changes/README.md](../../.changes/README.md). Nobody edits version numbers or `CHANGELOG.md`.
3. CI checks the change file, the version, the code and, for app changes, builds and smoke-tests the
   Windows installer (an artifact for testing; nothing is published).
4. The pull request is reviewed and merged. Each CI run on `main` shows the next version in its summary
   (`npm run release:status` shows it locally).
5. **Preparing a release** (when you decide to ship):

   ```bash
   git switch main && git pull --tags && git switch -c release/next
   npm run release:prepare
   ```

   This sets the next version in every version file, adds the dated `CHANGELOG.md` entry, drafts
   `docs/releases/X.Y.Z.md` and deletes the consumed change files. Rewrite the draft's summary in two or
   three plain sentences, check every line against what really shipped, delete the draft line, rename
   the branch to `release/vX.Y.Z`, then commit and open a pull request. CI refuses the release pull
   request unless the version is exactly the one the change files lead to, the notes are finished, and
   the version was never used.

6. Merge the release pull request.
7. **Publishing** is your explicit approval: tag the merge commit and push the tag.

   ```bash
   git switch main && git pull
   git tag -a vX.Y.Z -m "TTSNative X.Y.Z"
   git push origin vX.Y.Z
   ```

8. The [Release workflow](../../.github/workflows/release.yml) verifies the tag, runs every check,
   builds the installer signed for updates, checks that signature against the key in the app,
   smoke-tests the installer on a clean Windows runner, and then waits for approval of the `release`
   environment (if you configured reviewers). It creates the GitHub Release as a draft, attaches the
   installer, `latest.json`, the source and web-UI archives, the source of the installer's GPL and LGPL
   parts, SBOMs, the runtime manifest and `SHA256SUMS.txt` with signed provenance, checks they are all
   there, and only then publishes it.
9. The reviewed notes become the release's description (with the developer changes folded away).
10. ttsnative.com rebuilds: the download button points at the new installer, the new version gets its
    own release notes page (`/releases/X.Y.Z/`), the release history opens on it, and the footer
    names it.
11. Installed copies of the Windows app find the update at their next check.

If anything fails, nothing is published; fix the cause and run the workflow again for the same tag
(**Actions → Release → Run workflow**). A published version is never replaced or reused, and tags
matching `v*` are protected.

## One-time setup before the first Windows release

These need the repository owner; none of them is in the repository.

1. **Updater signing key.** A key pair was generated for this project on the maintainer's computer
   (`C:\Users\wcars\.ttsnative-release\updater.key` with its password in `updater.key.password`); its
   public key is already in `apps/desktop/src-tauri/tauri.conf.json`. Store both files in your password
   manager, then in **Settings → Environments** create an environment named `release` and add two
   environment secrets: `TAURI_SIGNING_PRIVATE_KEY` (the contents of `updater.key`) and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Delete the local copies afterwards if you like.
   _If you'd rather create your own key_, run `npx tauri signer generate -w <path>` and replace
   `plugins.updater.pubkey` before the first release; after that, the key can never change without
   breaking updates for installed copies. **Losing the private key means existing installations can't
   update themselves any more.**
2. **Approval.** In the `release` environment, add yourself as a required reviewer and limit it to tags
   matching `v*`. Each release build then waits for your approval before the signing key is used.
3. **Back the key up and know how to recover.** Every update an installed copy accepts must carry a
   signature from this key; the public half is compiled into the app.
   - Keep the key file and its password as two entries in your password manager, and a second copy
     somewhere offline (an encrypted drive). GitHub's environment secret is write-only and is not a
     backup. Keep the password apart from the key.
   - Check a backup before trusting it: sign any file with it and verify the signature against the key in
     the app. With the key file and its password in `TAURI_SIGNING_PRIVATE_KEY` and
     `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (set them in a shell, never on a command line or in a script
     that is committed): `npx tauri signer sign <any file>` writes `<any file>.sig`, and
     `node scripts/release/verify-update-signature.mjs <any file>` must print that it matches.
   - **If the key is lost:** generate a new pair, replace `plugins.updater.pubkey`, and ship the next
     version. Installed copies refuse updates signed with the new key (they show that the update couldn't
     be verified), so that release's notes and the website must tell people to download the installer
     once from ttsnative.com/download; the update check in the app then works again from the new version.
   - **If the key leaks:** treat it as lost, rotate it the same way at once, and replace the GitHub
     secret. A leaked key alone cannot push an update to anyone: the app only takes updates from this
     repository's latest release, so keep the repository itself protected (two-factor authentication,
     the rulesets on `main` and on `v*` tags, required review of the `release` environment).
   - Never paste the key into a terminal that is being recorded, a chat, an issue, a script in the
     repository or a CI log; the workflow passes it only through the environment secret.
4. **Windows code signing (Authenticode), when you're ready.** Without it, SmartScreen warns on download
   and first run. Options in 2026:
   - **Azure Artifact Signing** (formerly Trusted Signing): about $10 a month; individuals in the US
     and Canada can verify their identity; no hardware token. Install its signing tool in the
     release job, set the repository variable `TTSNATIVE_WINDOWS_SIGN_COMMAND` to the tool's command
     with `%1` for the file (for example
     `artifact-signing-cli -e https://wus2.codesigning.azure.net -a <account> -c <profile> -d TTSNative %1`)
     and add `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` and `AZURE_TENANT_ID` to the `release` environment.
   - **SignPath Foundation**: free for open-source projects that meet its conditions; the publisher
     shown is "SignPath Foundation".
   - **OV/EV certificates** from a CA: the key must live on a hardware token or cloud HSM; reputation
     with SmartScreen still builds over time.

   The build signs the app, the server's executables and the installer before the updater signature
   is computed. Until then the website's install steps explain the SmartScreen warning.

## Changes that predate change files

Everything merged after 2.0.0 and before change files existed is described for developers under
`[Unreleased]` in `CHANGELOG.md` and for users in `.changes/merged-since-2.0.0.md`; the next
`release:prepare` folds both into that release. Branches started before change files existed should
move any lines they added under `[Unreleased]` into a change file (user entries plus Technical).

## Historical releases

`docs/releases/1.0.0.md` and `2.0.0.md` hold plain-language notes for the two earlier releases (both
published under the name Local TTS); they appear in the app and on the website. Their GitHub Release
descriptions were left as they are. To replace them with the plain-language notes, keeping the
original text below, run (after reviewing the files in `docs/releases/github/`):

```bash
gh release edit v2.0.0 --notes-file docs/releases/github/v2.0.0.md
gh release edit v1.0.0 --notes-file docs/releases/github/v1.0.0.md
```

## Licences and the source offer

The installer ships the licences it owes (`scripts/desktop/notices.mjs` writes
`THIRD-PARTY-NOTICES.txt`; the build fails when a Python package has no licence). It also includes GPL
and LGPL code (espeak-ng, phonemizer, libsndfile, LAME, mpg123, GNU libiconv), so every release
attaches their corresponding source, `ttsnative-X.Y.Z-third-party-sources.tar.gz`, built from the
archives pinned in `apps/desktop/third-party-sources.json`.

- **When a dependency update changes one of those packages** (espeakng-loader, phonemizer, soundfile,
  lxml), `npm run test:scripts` fails until the manifest is updated: find the source of the exact
  binaries the new version ships, add or replace its entries with their size and SHA-256, and update
  the `for` versions.
- **When the release fails with a size or SHA-256 mismatch**, an upstream archive changed (GitHub can
  regenerate its tag and commit archives). Download it again, check that its extracted contents match
  the old archive, then update the size and hash in the manifest. Never skip the check.
- **Never delete a release or its `ttsnative-X.Y.Z-third-party-sources.tar.gz`:** the installer's
  written offer promises that source for at least three years after someone received the installer.

## Testing a Windows build

Every pull request that changes the app runs the **Desktop** workflow: download the
`ttsnative-windows-installer` artifact from the run to test the installer by hand. To build locally you
need Rust (the version in `apps/desktop/src-tauri/rust-toolchain.toml`) and the Visual Studio C++ build
tools, then `npm run desktop:build` (the installer lands in `dist/desktop/`). Such builds are labelled
as development builds in Settings → About and can't be offered as updates. Before a major or minor
release, also run the checklist in [windows-app-testing.md](windows-app-testing.md).

## Clean-install check (source)

This proves the developer quick start works on a machine with nothing but Node.js and Git. It uses a new
folder, empty npm and uv caches, the checksum-pinned uv download (not a uv already on `PATH`) and uv's own
Python (not one already installed), on ports that don't clash with a running copy:

```bash
export npm_config_cache="$PWD/npm-cache" UV_CACHE_DIR="$PWD/uv-cache" LTTS_UV_PINNED_ONLY=1 UV_PYTHON_PREFERENCE=only-managed LTTS_NO_OPEN=1 LTTS_API_PORT=8781 LTTS_WEB_PORT=5181
```

```bash
git clone --branch <branch> --depth 1 https://github.com/carsonmcrae/ttsnative.git && cd ttsnative && npm install && npm run dev
```

Then, in the browser at `http://127.0.0.1:5181`, choose a voice, upload a document, play past the first
sentence and export an MP3, and check that the file plays.

**Last run (2026-10-20, Windows 11, Node 24.19):** 81 seconds from clone to a running app. `npm install`
took 38 s; the first `npm run dev` downloaded and verified uv 0.12.21, installed Python 3.12.14 and the
locked dependencies, downloaded and verified the Kokoro model, and started the app. Voice choice, PDF
upload, speech, playback and MP3 export all worked. No other software was needed: MP3 export uses the
bundled libsndfile, not FFmpeg. Not yet repeated on macOS or Linux, where the server's unit tests run in CI.

## Demo and showcase videos

When the UI changes noticeably, regenerate the videos in `docs/media` (FFmpeg and the installed models
are required; see [docs/media/README.md](../media/README.md)):

```bash
npm run media:demo
npm run media:promo
```

The v1 Gradio prototype is tagged `v1.0.0` (commit `1452251`).
