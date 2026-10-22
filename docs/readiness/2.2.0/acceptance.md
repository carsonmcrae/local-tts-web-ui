# Acceptance: 2.2.0

What has to be checked by a person, on a real machine or device, before 2.2.0 is tagged. The release
workflow refuses the tag while any item below is unticked (`npm run release:gate -- 2.2.0`). Tick an item
`- [x]` once it passes, or mark it `- [~] … waived: <reason>` when the maintainer decides it can wait;
a waiver without a reason doesn't count. Automated evidence (CI, Desktop, CodeQL, the browser journeys,
SonarQube) is checked separately by the gate.

## Manual checks

- [ ] Clean Windows 11 machine, with the release candidate's installer from the Desktop workflow: every
      step of [windows-app-testing.md](../../guides/windows-app-testing.md), including the SmartScreen
      warning (no Authenticode yet), first launch without developer tools, shortcuts, closing leaves no
      `ttsnative-backend` or `python` process, uninstall keeping data, uninstall deleting data only after
      confirmation, and a reinstall that finds the data again.
- [ ] An update on a real machine from the published 2.1.0 to the 2.2.0 candidate: the notes show, the
      signature verifies, documents, voices and settings survive, migration 17 runs, and About shows 2.2.0.
- [ ] Voice cloning in the installed app: install the engine, make a voice, restart, and it still reads.
- [ ] A Studio Voice session in the installed app (about 15 passages), usable after a restart.
- [ ] Fine-tuning in the installed app on a GPU computer (windows-app-testing.md step 5): it runs as a
      background job, the A/B plays, Keep, Discard and Remove behave; a phone shows status only.
- [ ] Listen: background music under narration, including the new long tracks: crossfades, pause and
      resume, both sliders; music never louder than the voice.
- [ ] Listen: sound effects at Minimal, Balanced and Immersive with narration and music; decide which
      Experimental sounds to promote (the listening page says how).
- [ ] Listen: an Immersive reading preset end to end (voices, music, effects), then remove it.
- [ ] Real phones on the home network, iPhone with Safari and Android with Chrome:
      [lan-phone-checklist.md](../../guides/lan-phone-checklist.md) (pair, read, play, export, revoke).
- [ ] An M4B export in an audiobook player (chapters and cover), and a read-along EPUB in a reader with
      Media Overlays.
- [ ] Send an export to a real Audiobookshelf server.
- [ ] The local speech API from an outside client (curl or the OpenAI SDK, per local-speech-api.md).
- [ ] A screen-reader pass (NVDA or Narrator) over the library, reader, Voice Studio and Settings.
- [ ] After publishing: ttsnative.com/download/ leads to the GitHub Release asset, its SHA-256 matches
      `SHA256SUMS.txt`, it installs, and the footer and release pages name 2.2.0.

## Blockers

- [ ] The `release` environment, its required reviewer and both `TAURI_SIGNING_PRIVATE_KEY` secrets exist
      (on 2026-10-22 GitHub showed no `release` environment and no secrets).
- [ ] 2.1.0 is published from `e71d192`, so 2.2.0 updates an installed 2.1.0.
