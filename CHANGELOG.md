# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). See [docs/guides/release-process.md](docs/guides/release-process.md).

## [2.1.0] - 2026-10-22

### Added

- **Model integrity checks and repair.** Every model file is checked against its published SHA-256
  checksum before an engine loads it, including files installed long ago. A missing, incomplete or
  mismatched file puts the engine in a **Needs repair** state that names the file, and **Repair**
  downloads only the damaged files again. `npm run setup`, `npm run doctor` and `ltts models verify`
  report and fix damaged files too, and speech that comes back empty or invalid is refused with a
  clear message instead of a server error.
- **Project website** rebuilt for TTSNative: features, the overview and demo videos, screenshots,
  privacy, install steps, how it is built and a FAQ, plus a speech demo that uses the browser's own
  voices (clearly labelled as not TTSNative's, with online voices flagged). Built and link-checked by
  `npm run site:build`, tested in Chromium and on phones, and published to GitHub Pages.
- **Studio voices:** a guided, resumable session for your most faithful voice. A microphone check
  (including a thin, "tinny" microphone), 48 passages in six styles recorded losslessly or imported
  from a long recording, then a build that averages the speaker over the session, tests five candidate
  voices and lets you pick by ear. Quick voices are unchanged.
- **Delivery** for custom voices: Steady, Natural or Expressive.
- **Microphone tone checks** (bright or thin, measured on vowels so "s" sounds don't count) in every
  voice-recording check. In a studio session, the microphone check plays your recording back, picks
  your USB/XLR microphone, and can correct the tone automatically, with a before-and-after preview.
- **Chatterbox updates in place:** when the worker's locked packages change, Settings → Engines &
  models offers "Update available" instead of a reinstall.
- **Recording cleanup** for quick and studio voices: background noise reduction, a low-rumble filter
  and treble and low-end controls, with a suggestion measured from the recording, a before-and-after
  preview, and your last choice remembered for the next recording. Noise reduction follows the
  approach of [noisereduce](https://github.com/timsainb/noisereduce) (MIT), re-implemented without
  new dependencies.
- **Adjust this section** in the reader: rename a chapter or move where it starts, sentence by
  sentence.
- **Pronunciation dictionary** (Settings → Pronunciation): whole-word rules such as "Kael" → "Kale",
  optionally case-sensitive, heard before saving, applied to reading, previews and exports; only
  sentences containing a changed word are regenerated.
- **Bookmarks and notes**: bookmark the sentence being read (button or `B`), a Bookmarks tab beside
  Contents, notes on each bookmark, and an export of all notes as Markdown.
- **Search** inside a document, with matches marked and a jump to the sentence; **library search and
  sort** (title, date added, least listened).
- **Sleep timer**: stop after 5–60 minutes or at the end of the section, always between sentences.
- **Reading text settings**: text size, line spacing and typeface, per device.
- **Export subtitles and tags**: optional sentence-timed SRT subtitles, and title, album and track
  tags in exported audio.
- **Attribution**: [ATTRIBUTION.md](ATTRIBUTION.md) (what the MIT License requires and what is only
  asked) and [CITATION.cff](CITATION.cff); SPDX licence and copyright lines in every source file, checked
  by `npm run lint:repo`; the author and licence in Settings → About, the API description and package
  metadata. The built web app now ships the licences of the packages and fonts it bundles
  (`THIRD-PARTY-LICENSES.md`). Exported audio carries only the document's own title, album and track
  tags.
- Play quiet background music under the narration: turn it on from the music button in the player, choose from eleven free tracks (ambient, fantasy, cinematic, lo-fi, focus and nature), and preview any of them before you pick.
- Music has its own volume, separate from the narration, and follows it: it pauses when you pause, carries on when you play, and fades gently in and out.
- Set the narration and the music volumes side by side in the new audio mixer in the player.
- Music is off at the start of every new narration. TTSNative remembers your track and volume on each device, but you always choose when the music plays.
- Organise your library: put documents in folders (nested as deep as you like), gather them in collections (a document can be in several), mark favourites, give each one a type and genres, and add your own tags.
- The library has a rail of views: all documents, continue reading, favourites, recently added, your collections and your folders, with a matching menu on phones.
- Search finds authors, file names and tags as well as titles; filter by genre, type and progress; sort by author too.
- Select several documents at once to move, tag, favourite, add to a collection or delete them together, or drag a document onto a folder.
- Poems and other verse keep their lines: a line break is read with a short pause and shown as a line break, not as a new paragraph.
- Explore: 25 public-domain books come with TTSNative (Alice, Frankenstein, Pride and Prejudice, Sherlock Holmes, Poe, Dickinson, Whitman, Douglass, Thoreau and more), grouped by kind, each with a cover, a description and content notes.
- Every included book says where it is public domain: always the United States, and elsewhere by its author's death year, naming the countries where a longer term still runs.
- Open an included book and it joins your library like any other document; hide the ones you don't want to see. The credits name every edition, cover artist and source.
- Reading experiences: six of the included books come with a curated cast. In the reader, choose **Multi-voice** to give Alice, Scrooge, Holmes, Elizabeth Bennet and the rest their own voices and to hand untagged lines such as the Raven's "Nevermore" to their speaker.
- **Standard** takes an experience out again and keeps every voice you chose yourself. Sound effects and music are described but arrive with a later version; nothing starts playing on its own.
- Record a guided studio session for your most faithful custom voice: a microphone check, short passages to read or a long recording to import, then pick the best of five candidate voices by ear.
- Choose how a custom voice delivers its lines: steady, natural or expressive.
- Clean up a voice recording with background noise reduction, a rumble filter and tone controls, with a before-and-after preview.
- Teach TTSNative how to say names and words with a pronunciation dictionary.
- Bookmark the sentence being read, add notes to bookmarks, and export all your notes.
- Search inside a document and jump to a match; search and sort your library.
- Set a sleep timer that stops between sentences, after a set time or at the end of the section.
- Adjust the reading text's size, line spacing and typeface.
- Rename a chapter or move where it starts.
- Export subtitles timed to each sentence, with the title, album and track filled in on exported audio.
- Read HTML pages, FB2 and MOBI books, and import a public web page by its address.
- Running headers, page numbers, footnotes and citation markers are skipped when reading aloud and exporting; they stay visible, marked as skipped, and you can read them all again or skip any sentence by hand.
- Fix how a word is said from the reader: select it, write it the way it sounds (gnocchi → NYOH-kee), hear both versions, and keep the fix for this document or for all documents.
- Export M4B audiobooks with chapters, a description and a cover, and read-along EPUB books whose text is highlighted as the audio plays.
- Pause and resume audiobook exports, even after a crash or restart; the new Exports page lists them, shows each one's place in line, and lets you resume, cancel, download or delete them.
- Send a finished export to your own Audiobookshelf server.
- Give characters their own voices, read quoted speech in a dialogue voice, and read chosen sentences as an announcement, a phone call, a radio broadcast, from far away, as a robot, quietly or as a memory.
- Mix two to four built-in voices into a new voice.
- Paste text with speech marks for pauses, voices, effects, styles, sounds and pronunciations.
- Share a custom voice as a file and import one shared with you; the file is checked completely and previewed before anything is imported, and an import never replaces one of your voices.
- Pair a phone or tablet on your home Wi-Fi to read and listen from it, with the computer doing the work (optional, off by default and after every restart; home networks only).
- Let other programs on this computer use TTSNative's voices, including OpenAI-style voice names (optional, off until you turn it on; Settings shows the exact address to use).
- Fine-tune a studio voice on its takes with an NVIDIA graphics card, and keep it only after hearing it against the voice as it is (experimental; in a blind test it didn't sound clearly better).
- Rebuilding a studio voice's speaking styles keeps the ones from before, and you can switch back.
- A high-contrast option, wider letter and word spacing for the reading text, and support for Windows high-contrast themes.
- The app's screens open even while the server can't be reached and say so, and a Reconnecting bar shows until it answers again.
- Install TTSNative on Windows 11 like any other app: it opens in its own window from the Start menu or an optional desktop shortcut, with nothing else to set up.
- The default voice comes with the app, so you can start listening right after installing.
- TTSNative lets you know when a new version is available, shows what's new, and installs it for you once you agree. You can turn these checks off.
- See what changed in every version under Settings, About, even without an internet connection.

### Changed

- **Renamed to TTSNative** (formerly Local TTS), with a new identity: an N drawn as five waveform bars,
  the app icon and favicon, logos and a brand guide (`brand/`). The repository is now
  `carsonmcrae/ttsnative`; old GitHub links redirect. Internal identifiers are unchanged, so existing
  installations keep working: the `ltts` package and command, `LTTS_*` settings, the `data/` folder and
  saved browser preferences. Releases are now named `TTSNative <version>`, with `ttsnative-*` files.
- PDF chapters now start at their heading line, not at the top of the page the outline points to, so
  the end of one chapter no longer appears at the start of the next.
- API: `POST /api/voice-profiles/analyze` returns `{report, suggested}`;
  `POST /api/voice-sessions/tone-preview` is replaced by `POST /api/voice-profiles/cleanup-preview`;
  a studio session's `tone` is now `cleanup`. New: `PATCH /api/documents/{id}/sections/{index}`,
  `GET /api/documents/{id}/search`, `/api/documents/{id}/bookmarks` and `/api/pronunciations`;
  exports accept `captions`. Database migration 5 adds the
  `pronunciations` and `bookmarks` tables.
- **Node.js 22.22 or newer** is now required (React Router 8 and jsdom 30 need it).
- Dependencies: React Router 8, radix-ui 1.7, Vitest 5, jsdom 30.
- Development tooling: ESLint 10 (ESLint 9 is no longer supported). eslint-plugin-jsx-a11y has not
  yet published ESLint 10 support, so an npm override accepts it; its rules run unchanged. The server
  tests use httpx2, which Starlette's test client now prefers; the app itself still uses httpx.
- Local TTS is now called TTSNative, with a new look. Your documents, voices and settings carry over.
- Voice recordings tell you when a microphone sounds too bright or thin, and a studio session can correct its tone automatically.
- PDF chapters now begin at their heading, so the end of one chapter no longer appears at the start of the next.
- A shorter studio session: about 15 passages instead of 48, tiers that follow what the voice uses (Foundation, Developing, Complete), a suggested next passage, and progress that weighs how clean and long your takes are.
- Studio takes name the background noise when it matters, point out a take cut off mid-word, keep the previous take to compare and restore, and say what to do about microphone problems.
- Listening times count only what is read aloud, and follow skipped sentences and the cleanup.
- The Steady delivery of custom voices is steadier, and their audio is generated again once.
- Background noise in a studio take is advice, not an error.
- Selecting text in the reader no longer starts playback from the sentence you clicked.
- English voices read money, clock times and phone numbers the way a narrator does where the meaning is clear: £1,284.50 is "1,284 pounds 50", "at 4:45 p.m." is "at 4 45 PM", and a phone number is read digit by digit. Code, formulas, ratios and lists of numbers are read as before.
- English voices read years and abbreviations naturally too: "in 1998" is "in nineteen ninety-eight", Chapter IV is "Chapter 4", and Lt. Col., Rev., Mt., Rd., Ave., Ms. and approx. become words. The text you see never changes, and a pronunciation you saved still wins.
- Every voice card says where its voice comes from and under what licence, and that it is synthetic speech rather than a recording of a person.
- Updating keeps your documents, voices and settings, and uninstalling asks twice before deleting them.
- Release history shows one version at a time: pick a version from the list or step to the older or newer one, see when it came out and what changed, and find the version you're running marked.
- The version you're running is shown at the bottom of the sidebar and leads to About, where What's new and Release history are.
- On the website, every version has its own release notes page with links to the older and newer versions, and the home page names the latest version.

### Fixed

- **Website on phones:** the install commands scroll sideways on narrow screens and can now be reached
  and scrolled with a keyboard (a labelled, focusable region). The phone tests now run axe.
- Pausing or cancelling an export never ends it as failed, and cancelling removes everything it made; after a crash, half-built files are tidied and finished sentences are kept for Resume.
- Custom voices keep a faint, steady room tone through pauses instead of dropping to dead silence, never louder than the background just before the pause.
- Numbers in brackets, such as array[3] or [0, 1], are read as written; superscripts in equations are no longer taken for footnote markers.
- Reading progress reaches 100 % at the last sentence that is read.
- Library cards no longer push the page sideways on phones.

### Security

- **ONNX Runtime telemetry is now switched off.** Official ONNX Runtime builds send usage telemetry
  to Microsoft by default (Windows TraceLogging, or HTTPS on other platforms). TTSNative now sets
  `ORT_DISABLE_TELEMETRY` and calls `disable_telemetry_events()` before Kokoro loads, so the
  "no telemetry" promise holds.
- **certifi 2026.10.19** in the server and the Chatterbox worker, fixing GHSA-6q48-6c7w-9gw2. It is
  one day old, so it comes in through a documented exception to the 14-day release cool-down.
- **Pillow 13.0.0** in the Chatterbox worker, fixing nine advisories in 12.3.0 (one critical, six
  high). The worker never opens images, so none was reachable; the release is four days old and also
  comes in through a documented cool-down exception.
- The optional Chatterbox worker moved to torch 2.11, transformers 5.11 and setuptools 84, clearing
  its open advisories; the one remaining, in code the worker never calls, is documented in
  [docs/security/supply-chain.md](docs/security/supply-chain.md).
- Voice model files are checked before every use; a damaged file is named, and Repair downloads only that file again.
- The speech engine's built-in usage reporting is switched off, so TTSNative sends no usage data.
- Security updates for the optional voice-cloning engine.
- Requests passed on by a proxy, tunnel or port forward are refused, and only a page opened as localhost or 127.0.0.1 counts as the person at this computer.
- A paired phone works only from the address it paired from and for 30 days at most (14 days unused); paired devices reach only an explicit list of features, and phone access turns itself off when the computer's network changes or after it slept.
- On Windows, phones can connect only on a network marked private; on macOS and Linux you confirm each time that it's a home network you trust.
- Other programs' use of the voices is off by default, needs a token shown once and stored only as a hash, refuses web pages, and has limits on length, size, rate and time per request.
- The switch the automated tests use to look inside the Windows app's window is no longer built into released versions, and a release can't be built with it.
- Security update for the optional voice-cloning engine.

### Technical

- Web: features/music (Web Audio engine with fades, crossfades and sample-accurate loops; a session that follows PlaybackController; per-device `ltts.music` preference), features/mixer (audio mixer in PlayerBar: narration volume `ltts.narrationVolume`, music channel, room for sound effects), `PlaybackController.setVolume` and `state.volume`, lib/deviceSettings, ADR-18 and docs/architecture/background-music.md.
- Player: a sentence that plays to its end no longer reports a brief pause (the `pause` fired just before `ended` is ignored); the music, play button and lock-screen state all follow that status between sentences.
- 11 CC0/public-domain tracks as Opus/WebM loops in apps/web/public/music (13.3 MB) with CREDITS.md; library.json records sources, licences, edits and SHA-256; `npm run music:build` rebuilds them from the checked originals.
- Tests: engine, session, preferences, library-licence and UI tests; tests/e2e/music.spec.ts.
- Server: migration 14 (`folders`, `document_shelf`, `document_genres`, `document_tags`, `collections`, `collection_documents`; `CREATE TABLE IF NOT EXISTS` so parallel branches merge in any order), `documents/shelf.py`, `folders.py`, `collections.py`, `shelf_router.py` (`/api/library/*`, `PUT /api/documents/{id}/shelf`), library summaries carry `author`, `hasCover` and `shelf`; paired LAN devices may use `/api/library`.
- Verse: the `line` boundary (`structures.Boundary`, `audio.PAUSE_SECONDS`, `SegmentOut`), set by `html_text.BlockBuilder` for `<br>` inside a paragraph and carried by the HTML page extractor, the segmenter and the read-along EPUB export (`<br/>`). It applies to documents imported from now on; existing documents keep their sentence numbering, so bookmarks, styling and progress are untouched.
- Migrations 14–16 belong to this branch (1–13 are main's); the sound-effects branch takes 17 next (`docs/architecture/literary-library.md` section 2). `tests/test_db_migrations.py` upgrades databases at versions 1, 5 and 13.
- Web: `api/libraryQueries.ts`, `features/library/{LibraryRail,LibraryFilters,OrganizeDialogs,RailDialogs,views,vocabulary}`, the reader draws `<br>` after a `line` boundary. ADR-24 and ADR-25; `docs/architecture/literary-library.md`.
- Catalog: package data in `ltts/library/` (`catalog.json`, 25 text-only EPUBs, 22 covers, `CREDITS.md`, about 4 MB) checked against recorded SHA-256 hashes at load and built by `scripts/library/build_catalog.py` from `scripts/library/sources.json`; migration 15 (`bundled_documents`, `hidden_works`); `GET /api/library/works`, `POST …/{work_id}/open`, `GET …/{work_id}/cover`, `PUT …/{work_id}/hidden`, `GET …/credits`; `features/explore/`.
- Presets: `ltts/library/presets.py` (schema `ttsnative.immersive-preset/1`, 16-hex sentence-hash anchors shared with the sound-effects work, frozen music track ids), six presets in `ltts/library/presets/`, migration 16 (`document_presets`), the `speaker` sentence annotation kind the planner reads as a tagged line, `GET|DELETE /api/documents/{id}/preset` and `POST …/preset/apply`; `api/presetQueries.ts`, `features/reader/ReadingExperience.tsx`; `scripts/library/anchor_tool.py` prints anchors for writing presets.
- These features merged to main after 2.0.0 and are described for developers under Unreleased in CHANGELOG.md; this file carries them into the next release's notes and version.
- Server: an OpenAI-compatible local speech API under `/v1` (`POST /v1/audio/speech`, `GET /v1/models`, `GET /v1/voices`; `speech_api_*` settings); LAN mode (`lan/`: a second listener on one private address, pairing codes, device cookies, `lan/policy.py` allow-list, per-device limits, Windows network-category check); `SecurityMiddleware` refuses forwarding headers, loopback requests under a non-loopback Host, and changes without a loopback `Origin`; new routers for styling, document details, integrations (Audiobookshelf, encrypted `SecretStore`), speech API settings and LAN.
- Exports: resumable per-sentence working folders, an export queue (one running, four waiting) with disk-space checks, M4B and read-along EPUB 3 (ffmpeg), Audiobookshelf upload; `JobStatus.PAUSED`.
- Documents: HTML, FB2 and MOBI extractors, pinned web-page import, running-header/footnote/citation cleanup, speech marks (`{pause}`, `{voice}`, `{effect}`, `{style}`, `{sound}`, `{say}`), spoken-word counts; sentence styling, casting and document-scoped pronunciation rules.
- Voices: speaking styles with a kept previous expression, voice blends (`blend:` prefix), `.ttsvoice` sharing and preview (docs/reference/ttsvoice-format.md), fine-tuning (`voices/tuning.py`, ADR-16), smarter take checks and tiers; `ltts voice-ab` and `ltts voice-panel` for blind listening tests; worker engine revision `worker-5` (seeds, retries, polish and styles, then steady capped room tone; temperature 0.7, top-k 600 for Steady).
- Web: `public/sw.js` (app shell only, never `/api` or `/v1`) with a web app manifest, `ConnectionBanner`, an Exports page, LAN and speech API settings, high-contrast and forced-colours styles; `npm run start` reads `LTTS_API_PORT`; the website build adds a content security policy.
- Docs: ADR-11 to ADR-17, guides for the local speech API and the phone checklist, research notes (studio voice audit, engine comparison, voice quality, LAN HTTPS options), threat-model rows.
- `synthesis/english.py`: bounded regular-expression rewrites applied to English voices of every engine after the pronunciation dictionary, skipped for sentences that look like code or a formula; times, years and digit-by-digit numbers need context; idempotent. The spoken text is part of the audio cache key, so the sentences it changes render again once. 219 rule cases and path tests (dictionary precedence, written text and subtitles unchanged, playback, export, regeneration, preview and speech API saying the same words).
- `VoiceInfo.attribution` on the voices API; web types regenerated.
- `tests/perf/narration_benchmark.py` and `narration_corpus.json`: thirteen held-out passages read through the real synthesis path; cold and warm starts, memory, GPU and signal measurements with a recorded environment; refuses to write audio where Git would track it; blind listening packs.
- `tests/perf/g2p_compare.py` and `g2p_corpus.json`: a blind espeak-ng versus misaki comparison with catch trials, confidence intervals and a pre-registered decision rule (misaki is not installed in the app). Narrator programme proposal in `docs/legal/narrator-programme.md`. Research and proposals in `docs/research/voice-library.md`; `ltts voice-panel score --pair A,B` pairs voice ids that contain colons.
- Chatterbox worker: virtualenv 21.14.7 for CVE-2026-113725 (security exception; unreachable, as virtualenv is never run).
- uv 0.13.4 (security exception for GHSA-hq85-5cpj-mr62: a compromised root CA removed from uv's bundled store), verified against the published checksums; the installer bundles it.
- apps/desktop: Tauri 2 shell (single instance, window state, navigation allowlist, kill-on-close Job Object for the server, loopback port from 8770), splash screen and per-user NSIS installer with hooks; runtime assembled by scripts/desktop/build-runtime.mjs (python-build-standalone 3.12 via the pinned uv, hash-checked server packages, byte-compiled, Kokoro bundled); `npm run desktop:build`.
- Signed updates with tauri-plugin-updater (minisign) from GitHub Releases `latest.json`; Authenticode signing hooks ready for when a certificate exists.
- Server: `ltts serve --exit-with-stdin`, `LTTS_BUNDLED_MODELS_DIR` (read-only models, repair copies intact files), `LTTS_WORKER_PROJECT_DIR`, `LTTS_UV_PYTHON_DIR`, and no console windows for helper processes on Windows.
- Release tooling: change files (.changes/), `npm run change`, `release:status`, `release:prepare`, check-changes in CI, user-facing notes in docs/releases/ (backfilled for 1.0.0 and 2.0.0), build identifiers for development builds, and version files listed once (scripts/lib/version-files.mjs).
- Web: update notice, release history and What's new in Settings → About; website download and release history pages generated from docs/releases.
- Dependency updates past the 14-day cool-down, replacing Dependabot's proposals: tauri-plugin-updater 2.13.2 (Windows app), fastapi 0.142.4 (server), and the development tools @playwright/test 1.64.0 and knip 6.40.0. Held until 2026-10-29: github/codeql-action v4.39.0 (released 2026-10-15).
- Website build: one page per release (`releases/<version>/`, plus `releases/` for the latest), a title and canonical address per version, `%LATEST_*%` placeholders behind an `if:release` block, and a link check that follows the base URL into folders.
- apps/desktop: a `test-hooks` Cargo feature gates `--remote-debugging-port=N`; `build.mjs` compiles it only with `TTSNATIVE_TEST_HOOKS=1`, refuses it for a release version, and checks the binary for the switch text either way (`scripts/desktop/check-test-hooks.mjs`); the Desktop workflow sets it for its installer and update builds and checks a plain release build; release.yml leaves it unset. The app drops `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` from its environment at start.
- release.yml fails closed: the `release` environment must exist with a required reviewer, and both signing secrets must be present.
- Dependabot: a cargo entry for the Windows shell with a 14-day cool-down; `glib` (Linux-only, not compiled for Windows) is ignored so its security-update job stops failing.
- Chatterbox worker: virtualenv 21.14.10 for CVE-2026-113716, -113722 and -113724 (security exception; virtualenv is never run). Only virtualenv changes in the lock.
- The Windows app test checklist covers the release history one version at a time and the sidebar version link; the website's phone test covers the release history pages as well as the home page.
- CONTRIBUTING.md states the cross-surface consistency rule (app, website, documentation and release information change together), and the pull request template asks for it.
- The server tests run in parallel with pytest-xdist (one worker per CPU, at most eight; `-n 0` runs them serially, and `npm run test:inference` always does), taking well under half as long. Tests made deterministic for it: two parametrized cases named by zip bytes that embed the build time; the idle-unload test, which now waits for the watcher to release the worker lock; the speech API's log-secrets test, which now checks what the log handler writes (at debug and normal levels, with tests proving it catches a leaked token or text) instead of each record's clock and thread numbers; and two CLI tests that left the app's logging setup in place for later tests.
- CI runs the web unit tests in their own job beside the web checks, and Validate requires it.
- Desktop workflow: the installer and update-path jobs no longer wait for the shell checks; the installer job saves the Cargo and runtime caches right after its build (so a failing test still leaves them warm) and the update job only restores them; a lockfile change starts from the newest cache for the same toolchain; the Cargo cache leaves out the copied runtime and the built installer.
- Every CI and Desktop job has a timeout well above its real run time (30 minutes for CI jobs and the desktop shell checks, 45 for the installer job, 60 for the update path), so a hung job fails instead of running for GitHub's six-hour default.
- Website: a `<!-- if:released-X.Y.Z -->` block for a version that has no notes yet (the next release, before `release:prepare`) was left in place because no flag existed for it; such blocks are now dropped, so the published site never shows a card for an unreleased version.
- Website: a "Background music" feature card, gated on `<!-- if:released-2.1.0 -->`, so it stays out of the published site until GitHub lists 2.1.0 as released and appears on release day by itself. Local builds show it.
- Website: `<!-- if:released-X.Y.Z -->` blocks in `site/index.html` stay out of the published site until GitHub lists that version as a released version (`scripts/site/releases.mjs` `releasedFlags`), so a feature card can merge with its feature and appear on release day by itself. Local builds show them.
- The voice library report (`docs/research/voice-library.md`) now matches what was merged in #45: the narrowed English reading rules, the benchmark method (cold and warm starts, recorded environment, privacy) with the second run's measurements, the blind listening packs, the misaki decision rule fixed before listening, and a link to the narrator programme proposal. It no longer describes clips as heard, or Kokoro's run-to-run differences as inaudible: nobody has listened yet. The benchmark's README says the same.

## [2.0.0] - 2026-10-19

A complete rebuild. v1 was a single Gradio script; v2 is a local-first document reader and voice
studio with a React UI and a hardened Python service. Nothing from v1 is required to upgrade — start
fresh with `npm install && npm run dev`.

### Added

- **Reader:** upload PDF, DOCX, EPUB, Markdown or TXT (or paste text), read along with sentence
  highlighting, navigate chapters/pages, resume where you left off, keyboard shortcuts and lock-screen
  media controls.
- **Progressive playback:** sentences are generated just ahead of the listener and cached, so long
  books start playing in about a second.
- **Voice Library:** 54 Kokoro voices with language, gender and upstream quality grades; compare voices
  on the same passage.
- **Voice Studio:** create a voice from a 10–20 s recording or an imported clip with live quality checks,
  explicit consent, a test generation, and permanent deletion (optional Chatterbox Turbo engine).
- **Export:** WAV or MP3, whole document or a chapter range, single file or one file per chapter with a
  playlist; interrupted exports resume using cached audio.
- **Settings:** theme, playback defaults, engine install/remove with sizes and hardware advice, storage
  usage and cache clearing, privacy summary, diagnostics and version information.
- **Engine updates:** when the voice-cloning worker's locked packages change (for example a security
  fix), existing installs show **Update available** and update in place with one click instead of a
  remove and reinstall.
- **One-command setup:** `npm run dev` provisions a checksum-verified `uv`, an isolated Python 3.12
  environment and the default voice model, then starts the API and UI together.
- Security hardening: loopback binding, Host/CSRF/cross-site checks, CSP, sandboxed document parsing,
  archive/XML attack defences, upload and processing limits, pinned and SHA-256-verified model downloads.
- Tests (pytest, Vitest, Playwright with real inference), CI workflows, documentation and license inventory.
- Releases: pushing a version tag checks it against the app version and this changelog, runs the full
  check suite, and publishes the source, the prebuilt web UI, CycloneDX SBOMs and `SHA256SUMS.txt`
  with signed build provenance.
- A user guide in the [wiki](https://github.com/carsonmcrae/local-tts-web-ui/wiki), kept in
  `docs/wiki/` and published automatically.
- A demo video recorded from the running app with its real narration, and a short showcase video whose
  voice-over is spoken by Local TTS (`docs/media/`, reproducible with `npm run media:demo` and
  `npm run media:promo`).
- Community files: code of conduct, support guide, issue labels and release-note categories.

### Changed

- Kokoro now runs in-process through `kokoro-onnx` 0.6 with the official v1.1 ONNX export instead of
  spawning the `kokoro-tts` CLI for every request.

### Removed

- Gradio UI, the "Text Prompts" folder workflow and batch mode (replaced by the library and export).
- AGPL-licensed transitive dependencies (PyMuPDF, EbookLib).

### Fixed

- PDFs without an outline produced no audio and no error in v1; text PDFs now always extract, and
  scanned PDFs are reported clearly.

## [1.0.0] - 2025

Initial Gradio prototype (`kokoro_tts_ui.py`), tagged `v1.0.0` at commit `1452251`. See
[docs/architecture/legacy-audit.md](docs/architecture/legacy-audit.md).

[2.1.0]: https://github.com/carsonmcrae/ttsnative/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/carsonmcrae/ttsnative/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/carsonmcrae/ttsnative/tree/v1.0.0
