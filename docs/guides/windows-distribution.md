# Windows distribution: Microsoft Store and the signed direct download

Why TTSNative ships two ways on Windows, what each needs, and where the work stands. The decision is
[ADR-26](../architecture/decisions.md#adr-26-windows-ships-through-the-microsoft-store-with-a-signpath-signed-direct-download-beside-it).

## What people see today (2.1.0, unsigned)

Checked on a clean Windows 11 VM on 2026-10-23, downloading from ttsnative.com in Edge:

1. Edge holds the download: "TTSNative-Setup-2.1.0.exe isn't commonly downloaded". The way on is
   **⋯ → Keep**, then a second screen ("Publisher: Unknown") whose main button is **Delete**; **Keep
   anyway** is behind its arrow.
2. Run from a browser that doesn't check downloads itself, Windows shows "Windows protected your PC";
   the way on is **More info → Run anyway**.
3. Where Smart App Control is on, an unsigned app can't run at all.

## The two channels

|                 | Microsoft Store (main)                 | Direct download (alternative)                                                           |
| --------------- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| Package         | MSIX, re-signed by Microsoft           | NSIS installer, signed through SignPath Foundation                                      |
| Warnings        | None (Store installs skip SmartScreen) | A verified publisher instead of "Unknown"; early downloads of a new file may still warn |
| Publisher shown | Carson McRae                           | SignPath Foundation                                                                     |
| Updates         | The Store                              | The app's own updater (GitHub Releases, minisign key)                                   |
| Cost            | Free                                   | Free                                                                                    |

Both packages hold the same program and runtime from the same build. Both keep the user's files in
`%LOCALAPPDATA%\com.ttsnative.desktop`, so someone can switch from one to the other without losing
their library.

## Accounts (the owner's part)

### Microsoft Store (Partner Center)

1. Use a Microsoft account you'll keep, with two-step verification on.
2. Register as an **individual** developer at <https://storedeveloper.microsoft.com> (free) and
   complete the identity check. Publisher display name: **Carson McRae**. Store policy 10.14 asks for a
   company account when the publisher name reads as a business, so not "TTSNative".
3. **Apps and games → New product → MSIX or PWA app**, and reserve **TTSNative**.
4. **Product management → Product identity**: record `Package/Identity/Name`,
   `Package/Identity/Publisher` (`CN=…`), `Package/Properties/PublisherDisplayName` and the Store ID in
   `apps/desktop/store/identity.json`. These are public identifiers, not secrets.

### SignPath Foundation

1. Two-factor sign-in on GitHub (SignPath requires it for everyone on the team, for SignPath and the
   repository).
2. Once the code signing policy page is live on ttsnative.com, apply at <https://signpath.org/apply>:
   the repository, MIT licence, the download page, GitHub Actions on GitHub-hosted runners
   (`release.yml`), what is signed (`TTSNative.exe` and the installer), the team (the owner as author,
   reviewer and approver), and the question whether the bundled Microsoft Visual C++ runtime counts as
   a system library under their terms.
3. After acceptance: two-factor sign-in on SignPath, add the predefined trusted build system
   **GitHub.com** and link it to the project. Record the organisation ID, project slug and signing
   policy slug as repository variables (`SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`,
   `SIGNPATH_SIGNING_POLICY_SLUG`), and store a submitter's API token as the secret
   `SIGNPATH_API_TOKEN` in the `release` environment.

## How it works

### Store package

- `scripts/desktop/msix.mjs` lays out the installed program (`TTSNative.exe`, `runtime\`), writes
  `AppxManifest.xml` from `tauri.conf.json` and `apps/desktop/store/identity.json`, generates the tile
  and Store logos from the app icon, and packs it with the Windows SDK's `makeappx`. The release
  workflow attaches the `.msixupload` to the run; the owner uploads it in Partner Center until
  submission is automated.
- **Full trust, Windows 11:** `runFullTrust`, minimum version 10.0.22000.0. WebView2 is part of
  Windows 11.
- **User folder:** declared as an excluded directory from MSIX file-system virtualisation
  (`unvirtualizedResources`), so it is the same folder the direct install uses and it survives an
  uninstall. Partner Center asks for a justification of the restricted capability: the library and the
  voices are the user's work and must not vanish with the app.
- **No updater:** the Store build is compiled as the `store` channel. The updater plugin isn't
  registered, the web UI says updates come from the Microsoft Store, and nothing reaches GitHub.
- **Listing:** the description says up front that the optional voice-cloning engine downloads its own
  components when someone turns it on (Store policies 10.2.2 and 10.2.4), links the privacy policy and
  shows the app's screenshots.

### Signed direct download

The Windows release job, from GitHub-hosted runners only:

1. Build the program without bundling, upload `TTSNative.exe` as an artifact, and submit it to
   SignPath (`signpath/github-action-submit-signing-request`); the owner approves the request.
2. Bundle the NSIS installer around the signed program, upload it and submit it; the owner approves.
3. Make the updater's minisign signature over the signed installer, check it, smoke-test the signed
   installer and publish as today.

When the SignPath variables are absent the job builds an unsigned installer and says so; a repository
variable `TTSNATIVE_REQUIRE_SIGNING=true` turns that into a failure once signing is in place.

### Website

- The download section leads with the official "Get it from Microsoft" badge linking to the Store
  listing, once the listing is live (a site gate, like the released-version gates).
- The direct installer stays below it, with its checksum, the code signing policy and, while it's
  unsigned, the exact steps above.
- `/code-signing/` is the policy page SignPath requires, linked as "Code signing policy" from the home
  and download pages.

## Open questions

- **The uninstaller.** Tauri's NSIS installer writes `uninstall.exe` at install time; it has to be
  signed too, or Smart App Control may block uninstalling. Needs the two-pass NSIS approach or Tauri's
  own uninstaller signing hook, checked in a build.
- **Visual C++ runtime under SignPath's terms** (asked in the application).
- **Store certification of voice cloning.** The consent flow, the disclosure and the optional download
  are described in the listing; certification may still ask questions.
- **LAN access in the Store build.** A full-trust package can listen on the network; check whether
  Windows' firewall prompt appears as it does for the direct install.

## Status

- [x] Decision recorded (ADR-26).
- [x] Store account and reserved name (owner): `CarsonMcRae.TTSNative`, Store ID 9PP3BKBDJP9R,
      recorded in `apps/desktop/store/identity.json`.
- [x] `store` channel build (no updater) and the in-app data deletion (`npm run desktop:store`,
      Settings → About → Delete my data…). Compiled and tested only in CI (no MSVC tools locally).
- [x] MSIX packaging script, manifest and logos (`scripts/desktop/msix.mjs`, unit-tested).
- [x] CI builds the package: the Desktop workflow's "Microsoft Store package (MSIX)" job.
- [ ] The package installed on the clean VM.
- [x] Code signing policy page (live 2026-10-23) and the SignPath application (owner, submitted
      2026-10-23; awaiting their reply).
- [ ] Release workflow: SignPath signing, MSIX artifact.
- [ ] Website: Store badge (gated), direct-download steps.
- [ ] First Store submission (owner) and first signed direct release.
