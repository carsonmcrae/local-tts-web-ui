# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). See [docs/guides/release-process.md](docs/guides/release-process.md).

## [2.0.0] - Unreleased

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

Initial Gradio prototype (`kokoro_tts_ui.py`), preserved in Git history at commit `1452251`. It was never
tagged; see [docs/architecture/legacy-audit.md](docs/architecture/legacy-audit.md).

[2.0.0]: https://github.com/carsonmcrae/local-tts-web-ui/compare/1452251...HEAD
