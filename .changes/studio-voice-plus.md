---
bump: minor
---

## New

- Read HTML pages, FB2 and MOBI books, and import a public web page by its address.
- Running headers, page numbers, footnotes and citation markers are skipped when reading aloud and
  exporting; they stay visible, marked as skipped, and you can read them all again or skip any
  sentence by hand.
- Fix how a word is said from the reader: select it, write it the way it sounds (gnocchi → NYOH-kee),
  hear both versions, and keep the fix for this document or for all documents.
- Export M4B audiobooks with chapters, a description and a cover, and read-along EPUB books whose text
  is highlighted as the audio plays.
- Pause and resume audiobook exports, even after a crash or restart; the new Exports page lists them,
  shows each one's place in line, and lets you resume, cancel, download or delete them.
- Send a finished export to your own Audiobookshelf server.
- Give characters their own voices, read quoted speech in a dialogue voice, and read chosen sentences
  as an announcement, a phone call, a radio broadcast, from far away, as a robot, quietly or as a
  memory.
- Mix two to four built-in voices into a new voice.
- Paste text with speech marks for pauses, voices, effects, styles, sounds and pronunciations.
- Share a custom voice as a file and import one shared with you; the file is checked completely and
  previewed before anything is imported, and an import never replaces one of your voices.
- Pair a phone or tablet on your home Wi-Fi to read and listen from it, with the computer doing the
  work (optional, off by default and after every restart; home networks only).
- Let other programs on this computer use TTSNative's voices, including OpenAI-style voice names
  (optional, off until you turn it on; Settings shows the exact address to use).
- Fine-tune a studio voice on its takes with an NVIDIA graphics card, and keep it only after hearing
  it against the voice as it is (experimental; in a blind test it didn't sound clearly better).
- Rebuilding a studio voice's speaking styles keeps the ones from before, and you can switch back.
- A high-contrast option, wider letter and word spacing for the reading text, and support for Windows
  high-contrast themes.
- The app's screens open even while the server can't be reached and say so, and a Reconnecting bar
  shows until it answers again.

## Improved

- A shorter studio session: about 15 passages instead of 48, tiers that follow what the voice
  uses (Foundation, Developing, Complete), a suggested next passage, and progress that weighs how
  clean and long your takes are.
- Studio takes name the background noise when it matters, point out a take cut off mid-word, keep the
  previous take to compare and restore, and say what to do about microphone problems.
- Listening times count only what is read aloud, and follow skipped sentences and the cleanup.
- The Steady delivery of custom voices is steadier, and their audio is generated again once.
- Background noise in a studio take is advice, not an error.
- Selecting text in the reader no longer starts playback from the sentence you clicked.

## Fixed

- Pausing or cancelling an export never ends it as failed, and cancelling removes everything it made;
  after a crash, half-built files are tidied and finished sentences are kept for Resume.
- Custom voices keep a faint, steady room tone through pauses instead of dropping to dead silence,
  never louder than the background just before the pause.
- Numbers in brackets, such as array[3] or [0, 1], are read as written; superscripts in equations are
  no longer taken for footnote markers.
- Reading progress reaches 100 % at the last sentence that is read.
- Library cards no longer push the page sideways on phones.

## Security & reliability

- Requests passed on by a proxy, tunnel or port forward are refused, and only a page opened as
  localhost or 127.0.0.1 counts as the person at this computer.
- A paired phone works only from the address it paired from and for 30 days at most (14 days unused);
  paired devices reach only an explicit list of features, and phone access turns itself off when the
  computer's network changes or after it slept.
- On Windows, phones can connect only on a network marked private; on macOS and Linux you confirm
  each time that it's a home network you trust.
- Other programs' use of the voices is off by default, needs a token shown once and stored only as a
  hash, refuses web pages, and has limits on length, size, rate and time per request.

## Technical

- Server: an OpenAI-compatible local speech API under `/v1` (`POST /v1/audio/speech`, `GET /v1/models`,
  `GET /v1/voices`; `speech_api_*` settings); LAN mode (`lan/`: a second listener on one private
  address, pairing codes, device cookies, `lan/policy.py` allow-list, per-device limits, Windows
  network-category check); `SecurityMiddleware` refuses forwarding headers, loopback requests under a
  non-loopback Host, and changes without a loopback `Origin`; new routers for styling, document
  details, integrations (Audiobookshelf, encrypted `SecretStore`), speech API settings and LAN.
- Exports: resumable per-sentence working folders, an export queue (one running, four waiting) with
  disk-space checks, M4B and read-along EPUB 3 (ffmpeg), Audiobookshelf upload; `JobStatus.PAUSED`.
- Documents: HTML, FB2 and MOBI extractors, pinned web-page import, running-header/footnote/citation
  cleanup, speech marks (`{pause}`, `{voice}`, `{effect}`, `{style}`, `{sound}`, `{say}`), spoken-word
  counts; sentence styling, casting and document-scoped pronunciation rules.
- Voices: speaking styles with a kept previous expression, voice blends (`blend:` prefix),
  `.ttsvoice` sharing and preview (docs/reference/ttsvoice-format.md), fine-tuning (`voices/tuning.py`,
  ADR-16), smarter take checks and tiers; `ltts voice-ab` and `ltts voice-panel` for blind listening
  tests; worker engine revision `worker-5` (seeds, retries, polish and styles, then steady capped room tone; temperature 0.7, top-k 600 for Steady).
- Web: `public/sw.js` (app shell only, never `/api` or `/v1`) with a web app manifest,
  `ConnectionBanner`, an Exports page, LAN and speech API settings, high-contrast and forced-colours
  styles; `npm run start` reads `LTTS_API_PORT`; the website build adds a content security policy.
- Docs: ADR-11 to ADR-17, guides for the local speech API and the phone checklist, research notes
  (studio voice audit, engine comparison, voice quality, LAN HTTPS options), threat-model rows.
