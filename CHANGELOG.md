# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). See [docs/guides/release-process.md](docs/guides/release-process.md).

## [Unreleased]

### Added

- **Fine-tune a studio voice (experimental).** **Fine-tune this voice** trains a small adapter
  (about 13 MB) on the takes a studio voice kept, on your own NVIDIA graphics card, in a few
  minutes. It stops once passages it held back stop getting closer to your reading, and offers
  nothing if it barely helped. You hear three sentences **Now** and **Fine-tuned**, then keep or
  discard it; **Remove fine-tune** goes back. Nothing new is downloaded or installed, and nothing
  trains unless you press the button. In a blind listening test it didn't sound clearly better
  than the voice without it.
- **A shorter, honest studio session.** The tiers now follow what a studio voice actually uses:
  **Foundation** (a working voice), **Developing** (its sound has settled after twelve clean takes)
  and **Complete** (every speaking style has its three takes). Each style shows its takes out of
  three, the session suggests the **most useful next** passage (**Go to it**), and a complete
  session says more passages won't change the voice: about 15 passages instead of 48. The intro
  and docs say plainly that no model is trained. See the
  [studio voice audit](docs/research/studio-voice-audit.md).
- **Switch to the previous expression:** rebuilding a studio voice's speaking styles keeps the
  ones from before, and you can switch back (and forward again).
- **A blind listening panel** for comparing several voices: `ltts voice-panel make` and
  `ltts voice-panel score` (ratings with 95 % intervals and a paired sign test).
- **Local speech API:** OpenAI's voice names (alloy, nova, shimmer and the rest) read with fixed
  built-in Kokoro voices (`GET /v1/voices` shows them as `openai_name`). Settings shows the exact
  address to use with a Copy button and warns when TTSNative has moved to another port since a
  program last used it; `npm run start` and `npm run dev` warn in the terminal too.
- **Footnotes and citation markers in the cleanup.** PDF footnotes at the foot of a page (small
  type below the text, starting with a number that marks a word on the page) are skipped like
  running headers, and citation markers such as [12], [3, 4] or [5–7] are left unread; both can be
  reviewed and read again.
- **Listening times count what is read.** Library cards, the reader and the player count only what
  is read aloud, and update when you skip a sentence, read one again or undo the cleanup.
- **LAN mode, hardened.** A phone's pairing works only from the address it paired from and ends
  after 30 days (or 14 days unused); the computer shows a refused use of a device's cookie, and the
  phone says why it must pair again. Paired devices reach only an explicit list of features (voice
  recordings, cancelling the computer's jobs and the data folder's path are no longer available to
  them). LAN mode turns itself off when the computer's network changes or after it slept, the
  address list hides virtual-machine and container adapters and labels VPNs, turning it off stops
  at once (downloads included), unpaired devices may send only small requests, and costly work from
  one device is limited. The sidebar shows when LAN mode is on. See
  [HTTPS options for phones](docs/research/lan-https.md).
- Research: [what a studio voice's recordings do](docs/research/studio-voice-audit.md), measured on
  a real session, and [open speech engines compared](docs/research/engine-comparison.md) for
  studio voices, with licences for code, weights and output checked separately.
- **Local speech API** (optional, off by default): an OpenAI-compatible `POST /v1/audio/speech`
  with `GET /v1/models` and `GET /v1/voices`, so scripts, screen readers and home automation on
  this computer can use TTSNative voices (MP3, WAV, FLAC, Ogg Opus or raw PCM). Set up in
  **Settings → Local speech API**: a token shown once and stored only as a hash (revoke or replace it
  at any time), custom voices refused until you allow each one, requests from other devices refused
  unless allowed, and web pages always refused. Limits on input length, body size, requests a
  minute, one request at a time and time per request. A **Speech API in use** sign shows while a
  program uses it. See [the guide](docs/guides/local-speech-api.md).
- **Phones and tablets (LAN mode)** (optional, off by default and after every restart): read and
  listen on other devices on the same Wi-Fi. Turn it on in **Settings → Phones and tablets**, which
  first says what a paired device can and can't do, then pair each device once with a QR code or an
  eight-character code (five minutes, used once). Paired devices can read, listen, change reading
  settings, add documents and run exports, but this computer's own settings, voices, engines and
  deleting documents stay here. Remove one or all devices at any time; turning it off stops at once.
  Plain HTTP on your network, nothing opened on the router. See
  [Other Devices](docs/wiki/Other-Devices.md).
- **Installable app and an offline notice** (on this computer): a web app manifest and a careful
  service worker that keeps only the app shell (never documents, audio or API answers), so the app
  opens without the server and says it can't reach it. A **Reconnecting…** bar appears while the
  server doesn't answer and goes away by itself.
- **Audiobook exports you can pause and resume.** Exports save each sentence as it is made, so a
  paused, interrupted (even by a crash or restart) or failed export carries on with only the missing
  sentences. A new **Exports** page lists them with Resume, Cancel, Download and Delete.
- **M4B audiobooks** with chapters, title, author, narrator, description and a cover (made with your
  own ffmpeg; the app says how to get it if it's missing), and **read-along EPUB 3** books whose text
  is highlighted as the audio plays (Media Overlays).
- **Send to Audiobookshelf** (optional): set your server address, API key (stored encrypted on
  Windows, never shown again), library and folder in Settings, then send a finished export.
- **More documents:** HTML pages, FB2 (and `.fb2.zip`) and MOBI books (DRM-protected books are
  refused, never unlocked), and **Import a web page** by its address: only public http(s) addresses,
  every redirect re-checked, connections pinned to the checked address, size and time limits.
- **A careful cleanup of running headers, page numbers and footnote markers.** They're skipped when
  reading aloud and exporting, but stay visible (marked "skipped"), and **Read them all again** undoes
  it; any sentence can be skipped or read by hand. Detection prefers missing one to skipping real text
  (it needs three or more pages, and page numbers that count along with the pages).
- **Speech marks** (optional, when pasting text): `{pause 2s}`, `{voice Sam}…{/voice}`,
  `{effect radio}…{/effect}`, `{style calm}…{/style}`, `{sound laugh}` and `{say Kael = Kay-el}`
  become sentence settings; the stored text never contains them, and unknown marks are listed.
- **Characters, takes, styles and pauses in the reader.** Quoted speech is read in the dialogue voice
  while the narration keeps the reading voice; characters named by dialogue tags ("…," said Mira) can
  each get a voice, saved as reusable cast presets. Studio voices can read a sentence in another
  speaking style, try other takes of it and keep the best, and any sentence can get a longer or
  shorter pause after it. New effects: **Quiet** (an aside or near-whisper) and **Memory** (a
  flashback).
- **Voice blends:** mix two to four built-in voices into a new one on the Voices page.
- **Better studio takes:** the background is named when it matters (a hum, a low rumble, hiss,
  clicks or other voices), a take cut off mid-word is pointed out, recording a passage again keeps
  the previous take to compare and restore, the session shows its tier (Foundation, Developing,
  Complete) and which speaking styles your takes can teach, and microphone problems (blocked,
  unplugged mid-take, not responding, no sound) say what happened and what to do.
- **A voice file preview:** choosing a `.ttsvoice` file shows its name, description, creator,
  styles, size and app version after checking it completely, before anything is imported; a file
  from a newer TTSNative says so. An import never replaces one of your voices. The format is
  documented in [docs/reference/ttsvoice-format.md](docs/reference/ttsvoice-format.md).
- **Blind A/B voice comparisons** for quality work: `ltts voice-ab compare` and `ltts voice-ab score`
  (see [voice quality research](docs/research/voice-quality.md)).
- **Accessibility:** a high-contrast option (also following the system setting), wider letter and
  word spacing for the reading text, and support for Windows high-contrast themes.
- **Expressive studio voices.** A studio voice keeps a speaking style for questions, lively lines,
  dialogue and narration, learnt from your takes of the matching passages, and reads each sentence
  in the style its punctuation asks for (the sound of the voice stays the same). Voices built
  earlier get **Improve expression**, which learns the styles from the takes they kept.
- **Natural sentence-to-sentence delivery for custom voices.** Each sentence is generated from a
  seed taken from its text (so it always sounds the same) and is generated again when it comes out
  implausibly short or long. Every sentence is then levelled to the built-in voices' loudness, with
  silent edges trimmed and long pauses shortened.
- **Studio recording guidance.** Every passage has **How to read it**: the inflection and pauses it
  teaches. **Listen to this take** before recording again, and **All passages** jumps to any passage
  and shows which are recorded, have advice or need another take.
- **An early studio voice.** A longer foundation passage (about a minute) plus 45 seconds of speech
  is enough to build an early version, with a clear warning that it's less complete than a full
  session.
- **Smarter take checks.** A take with no speech gets one message about the cause instead of every
  measurement that follows from it. Full takes estimate how much of the passage was read (syllables
  heard and speaking time, calibrated to the speaker) and compare background noise with the
  speaker's other takes. Both are advice and never block a take.
- **Share voices** as `.ttsvoice` files after confirming it's your voice (or the owner agreed). The
  file holds the built voice, its styles and a short reference; your session recordings stay on the
  computer. **Import a voice** needs your consent, and every file is checked: allowed names, sizes,
  checksums, the audio and each safetensors header, with no code run.
- **Characters and effects in the reader.** Select text and choose **Voice & effect** to read those
  sentences:
  - in another voice or accent;
  - as a loudspeaker announcement, a telephone call, a radio broadcast, in a large hall, far away or
    as a robot;
  - with a sound before them (custom voices, experimental).

  **Voices & effects** sets one voice for all quoted dialogue. Exports sound the same as playback.
- Research notes on [cloned voice quality](docs/research/voice-quality.md) and
  [feature suggestions](docs/research/feature-suggestions.md) from comparable open-source apps.
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

- The **Steady** delivery uses temperature 0.7 and top-k 600 for steadier prosody. Custom voices'
  audio is generated again once (engine revision `worker-2`).
- Background noise in a studio take is advice, not an error. Noisy takes still count but never give
  the voice its sound.
- Selecting text in the reader no longer starts playback from the sentence you clicked.
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

- Cloned voices no longer drop to dead silence between sentences: a voice that carries its recordings'
  faint hiss or hum keeps that room tone through the pauses after sentences and between narration
  and quoted speech, so the background doesn't switch off and on. Built-in voices are unchanged.
- Numbers in brackets are no longer dropped from speech: `array[3]`, `x[i+1]`, `matrix[2][3]`,
  `[0, 1]` and `list[-1]` are read as written, in the speech API too. In documents added before
  this version, citation numbers like [12] are read until the document is added again.
- Superscripts in equations (a² + b² = c², sin² x) are no longer taken for footnote markers.
- Reading progress reaches 100 % at the last sentence that is read, even when the last page number
  is skipped.
- Local speech API: a request body that takes more than 30 seconds gets 408; a client that
  disconnects no longer causes a server error or an extra sentence of work; and any voice made
  from a recording is refused unless you allowed it, whatever its id.
- The A/B comparison's default sentences are no longer taken from the studio recording script, so
  a studio or fine-tuned voice is compared on text it has never read.
- Privacy and the speech API section now say when LAN mode lets other devices in.
- Library cards no longer push the page sideways on phones.
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
