# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). See [docs/guides/release-process.md](docs/guides/release-process.md).

## [Unreleased]

### Added

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

### Changed

- PDF chapters now start at their heading line, not at the top of the page the outline points to, so
  the end of one chapter no longer appears at the start of the next.
- API: `POST /api/voice-profiles/analyze` returns `{report, suggested}`;
  `POST /api/voice-sessions/tone-preview` is replaced by `POST /api/voice-profiles/cleanup-preview`;
  a studio session's `tone` is now `cleanup`. New: `PATCH /api/documents/{id}/sections/{index}`.
- **Node.js 22.22 or newer** is now required (React Router 8 and jsdom 30 need it).
- Dependencies: React Router 8, radix-ui 1.7, Vitest 5, jsdom 30.

### Security

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

[Unreleased]: https://github.com/carsonmcrae/local-tts-web-ui/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/carsonmcrae/local-tts-web-ui/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/carsonmcrae/local-tts-web-ui/tree/v1.0.0
