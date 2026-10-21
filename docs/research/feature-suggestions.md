# Feature suggestions from comparable open-source apps

> **In short:** TTSNative already matches or beats most open-source readers on privacy, start-up speed
> and voice cloning. The features that would most help real users next are: resumable long exports
> with **M4B** chapters, re-generating **one bad sentence** (with a seed), **voice blending**, **EPUB3
> read-along export**, an **accessibility pass** (screen readers, dyslexia-friendly spacing) and a
> **local, opt-in API** other apps can use. Each is listed below with the projects that do it, a rough
> effort and the licensing or privacy care it needs.

Research date: 2026-10-20. Star counts and features were read on each project's own GitHub page that
day. Nothing was downloaded, installed or run, and no code was copied. Each entry is marked
**verified** (read on the project's page) or **inference** (our own reasoning). GPL and AGPL projects
can inform ideas but their code can't be copied into MIT TTSNative.

## Projects surveyed (500+ stars)

| Project                                                                  | Stars | Licence      | Most relevant features (verified)                                                                                                        |
| ------------------------------------------------------------------------ | ----- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [ebook2audiobook](https://github.com/DrewThomasson/ebook2audiobook)      | 20.4k | Apache-2.0   | Many ebook formats and OCR; M4B/FLAC/OGG with chapters and metadata; inline `[break]`, `[pause:N]`, `[voice:…]` tags; resumable sessions |
| [audiblez](https://github.com/santinic/audiblez)                         | 8.8k  | MIT          | EPUB to M4B with chapter picking; speed 0.5–2.0; Kokoro voices; GUI                                                                      |
| [abogen](https://github.com/denizsafak/abogen)                           | 6.1k  | MIT          | Voice mixer saved as profiles; subtitle modes (SRT/ASS, word groups); per-file queue; M4B; Audiobookshelf upload                         |
| [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)               | 5.6k  | Apache-2.0   | OpenAI-compatible speech API; weighted voice mixes; inline pause/IPA/voice tokens; word timestamps; streaming                            |
| [OpenReader](https://github.com/richardr1126/openreader)                 | ~544  | MIT          | Plays while generating; reuses the playback cache for export; word highlighting via alignment; layout-aware PDF; M4B                     |
| [AllTalk TTS](https://github.com/erew123/alltalk_tts)                    | 2.4k  | AGPL-3.0     | Several engines; narrator and character voices; bulk editor; fine-tuning; low-VRAM mode                                                  |
| [TTS-WebUI](https://github.com/rsxdalv/TTS-WebUI)                        | 3.3k  | MIT\*        | 15+ models; RVC, Demucs, Resemble Enhance, Whisper tools; extension manager (\*some dependencies are GPL or CC BY-NC)                    |
| [Chatterbox-TTS-Server](https://github.com/devnen/Chatterbox-TTS-Server) | 1.5k  | MIT          | Adjustable chunk size; seeds for repeatable output; voice folder and presets; UI state that survives reloads                             |
| [Audiobookshelf](https://github.com/advplyr/audiobookshelf)              | 14.7k | GPL-3.0      | Progress synced across devices; mobile apps with offline listening; chapter editor; RSS feeds; backups                                   |
| [Readest](https://github.com/readest/readest)                            | 25.5k | AGPL-3.0     | EPUB3 Media Overlays (read-along); dictionary and Wikipedia lookup; translation; KOReader and Readwise sync                              |
| [KOReader](https://github.com/koreader/koreader)                         | 30.5k | AGPL-3.0     | Dictionaries, OPDS/calibre catalogues, reflowing scanned PDFs                                                                            |
| [Foliate](https://github.com/johnfactotum/foliate)                       | 8.8k  | GPL-3.0      | Popup footnotes, hyphenation, vertical writing, Wikipedia lookup                                                                         |
| [Thorium Reader](https://github.com/edrlab/thorium-reader)               | 2.9k  | BSD-3-Clause | Screen-reader support (NVDA, JAWS, Narrator, VoiceOver); DAISY books; letter/word/line spacing; sepia and night themes                   |
| [epub2tts](https://github.com/aedocw/epub2tts)                           | 963   | Apache-2.0   | A different speaker per chapter; M4B with chapters and cover; resume; skip links and footnotes                                           |
| [Speech Note](https://github.com/mkiol/dsnote)                           | 1.7k  | MPL-2.0      | Offline speech-to-text, TTS and translation; reads subtitles in sync; global shortcuts                                                   |
| [Read Aloud](https://github.com/ken107/read-aloud)                       | 1.8k  | MIT          | Reads any web page with highlighting; speed and pitch; keyboard shortcuts                                                                |
| [Speaches](https://github.com/speaches-ai/speaches)                      | 3.7k  | MIT          | OpenAI-compatible TTS and STT; loads models on demand and unloads them when idle                                                         |
| [Audiobook Creator](https://github.com/prakharsr/audiobook-creator)      | 530   | GPL-3.0      | Finds characters and attributes dialogue with an LLM; assigns voices automatically                                                       |

Also checked: Piper (11.3k, MIT, archived; its successor piper1-gpl is GPL-3.0), openedai-speech (archived),
kokoro-tts (~1.9k, MIT, CLI). Storyteller (read-along EPUBs) and pdf-narrator are under 500 stars.

## Suggestions

Priority: **P1** do first, **P2** next, **P3** later. Effort: **S** days, **M** a week or two, **L** more.

### Reading & listening

1. **Re-generate one sentence (P1, S–M).** A "this sentence sounds wrong, try again" action on any
   sentence, using a new seed, kept until you change it. Cloned voices occasionally produce a bad line,
   and today the only fix is changing the voice or delivery. Seen in: Chatterbox-TTS-Server (seeds),
   abogen (partial reprocessing). TTSNative now seeds every cloned sentence, so a stored per-sentence seed
   override is a small step (inference).
2. **Skip the clutter (P1, M).** Popup footnotes, skip footnote markers and URLs, and drop PDF running
   headers, footers and page numbers. Seen in: Foliate, epub2tts, pdf-narrator.
3. **Look up and translate (P3, M–L).** User-imported offline dictionaries (StarDict, Yomitan) and
   opt-in Wikipedia or translation. Seen in: Readest, KOReader, Foliate, Speech Note. Caution: let users
   bring dictionaries rather than bundling them (licences vary); any online lookup must be opt-in to
   keep the offline promise.

### Library & formats

4. **M4B audiobooks (P1, S–M), already on the roadmap.** Chapters, an embedded cover and metadata, and
   choosing which chapters to include. Seen in: audiblez, abogen, epub2tts, Audiobookshelf. Caution: use
   an LGPL ffmpeg build or one the user installed (inference).
5. **Read-along EPUB export, EPUB3 Media Overlays (P2, M).** A book that plays with highlighting in
   Readest, Thorium and other readers; TTSNative already has exact sentence timings (inference). Seen in:
   Storyteller (makes them), Readest and Thorium (play them). Caution: exports of copyrighted books are
   for personal use; don't add hosting or sharing.
6. **More inputs (P2, M).** MOBI, AZW3, FB2, HTML, a web page by URL, and subtitle files. Seen in:
   ebook2audiobook, KOReader, Readest, abogen, Read Aloud. Caution: never remove DRM; calibre is GPL,
   so call it as an outside program if at all; fetching a URL is a network request and must be explicit.
7. **A queue of documents with their own settings (P2, M).** Convert several files in the background.
   Seen in: abogen, ebook2audiobook.

### Voices & audio quality

8. **Voice blending (P1, S).** Mix built-in voices into a new one ("60% Heart, 40% Bella") and save it.
   Kokoro voices are style vectors, so a blend is a weighted average (inference). Seen in: Kokoro-FastAPI,
   abogen, kokoro-tts. It also gives characters more distinct voices.
9. **Inline markup (P2, M).** `[pause:1.5]`, a voice switch, or an IPA pronunciation inside the text,
   complementing the pronunciation dictionary and the new per-sentence voices. Seen in:
   ebook2audiobook, Kokoro-FastAPI.
10. **Automatic casting (P3, L).** Find the characters and give each their own voice. Seen in: Audiobook
    Creator, AllTalk. Caution: those are GPL/AGPL (re-implement, don't copy); attribution needs a model,
    which must run locally and opt-in, or the privacy promise breaks (see ADR-6).
11. **Fine-tuning a studio voice (P2, L).** See [voice quality research](voice-quality.md): a LoRA on
    Chatterbox Turbo's T3 from the 30-minute session is the biggest remaining quality lever.
12. **Plug in other engines through an OpenAI-compatible client (P2, M).** For example Piper on a slow
    CPU, or a GPU machine elsewhere on the home network. Seen in: OpenReader, Speaches, Kokoro-FastAPI.
    Caution: piper1-gpl must run as a separate process; label any cloud provider as not private;
    XTTSv2 weights are non-commercial (inference).

### Accessibility

13. **Screen-reader and dyslexia pass (P1, M).** Letter and word spacing, high-contrast and sepia themes,
    reduced motion, and a full screen-reader review of the player and highlighting. Seen in: Thorium.
14. **Read the selection anywhere (P2, M).** A global shortcut or clipboard reader, or a browser
    extension that sends page text to TTSNative. Seen in: Speech Note, Read Aloud. Caution: anything that
    calls the local server from a browser extension needs a token and an origin check.

### Integrations & sharing

15. **Local, opt-in speech API (P2, S).** `/v1/audio/speech`, compatible with OpenAI's API, so apps such
    as Readest or Open WebUI can use TTSNative's voices. Seen in: most server projects. Caution: off by
    default, local only, token-protected, and custom voices excluded unless their owner opts in.
16. **Send to Audiobookshelf, notes to Obsidian or Readwise (P2, S).** Seen in: ebook2audiobook, abogen,
    Readest. Caution: keep tokens in the operating system's keychain.
17. **Listen on a phone over the home network, with synced progress (P3, L).** Seen in: Audiobookshelf,
    Readest, OpenReader. Caution: leaving 127.0.0.1 needs authentication and TLS and must be off by default.

### Reliability & operations

18. **Long exports you can pause, resume and recover after a crash (P1, M).** Seen in: ebook2audiobook
    (`--session`), epub2tts, pdf-narrator. Also reuse audio already generated while listening (OpenReader
    does; TTSNative's cache already makes this mostly true, inference).
19. **Packaging and resource controls (P2, M).** A winget installer, Docker images (CPU and CUDA), a
    low-VRAM mode and unloading idle models. Seen in: Kokoro-FastAPI, TTS-WebUI, Speaches, AllTalk.

**If only five:** 1, 18, 4, 8 and 13.
