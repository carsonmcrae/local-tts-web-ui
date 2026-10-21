# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). See [docs/guides/release-process.md](docs/guides/release-process.md).

## [Unreleased]

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

### Fixed

- **Website on phones:** the install commands scroll sideways on narrow screens and can now be reached
  and scrolled with a keyboard (a labelled, focusable region). The phone tests now run axe.

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

[Unreleased]: https://github.com/carsonmcrae/ttsnative/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/carsonmcrae/ttsnative/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/carsonmcrae/ttsnative/tree/v1.0.0
