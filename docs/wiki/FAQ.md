# FAQ

## Does TTSNative work offline?

Yes, once it is set up. The [Windows app](Windows-App) comes with everything it needs to read with the
built-in voices, so it works offline straight after installing. From source, the first run needs
internet access to download uv, Python 3.12, the server's packages and the Kokoro voice model.
Installing the optional Chatterbox Turbo engine needs one more download. After that, reading,
listening, voice creation and export all work offline.

## Do I need a GPU?

No. Kokoro, the default engine, runs on the CPU only and uses about 1 GB of RAM while speaking. On the
machine used for the
[performance measurements](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/performance.md)
it generated speech about five times faster than real time. Older or low-power CPUs may not keep up
with continuous playback at high speeds.

A GPU is only recommended for voice cloning: Chatterbox Turbo works best with an NVIDIA GPU (4 GB+
VRAM) or Apple Silicon, and is slower than real time on a CPU.

## Where are my documents, recordings and audio stored?

In TTSNative's data folder: `data/` inside the project for a source install (unless you set
`LTTS_DATA_DIR`), or `%LOCALAPPDATA%\com.ttsnative.desktop\data` in the Windows app.
**Settings → Storage** shows the exact path and how much space each part uses. See
[Installation](Installation#where-things-are-stored) and
[the Windows app](Windows-App#where-your-data-is).

## Does anything leave my computer?

No documents, recordings or generated audio, unless you send an export to your own Audiobookshelf
server. There are no accounts, analytics or telemetry, and the app itself loads nothing from the
internet. TTSNative only connects to the internet when you do one of these:

| When                                                           | What is contacted                                                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| You set it up from source (`npm install`, first `npm run dev`) | The npm registry, uv and Python from GitHub, Python packages from PyPI, and the Kokoro model from GitHub, all pinned and checked    |
| You install or repair a voice model or voice cloning           | GitHub (Kokoro), Hugging Face (Chatterbox Turbo), PyPI and `download.pytorch.org` (the cloning runtime), pinned and checked         |
| You import a web page by its address                           | That one page; the computer fetches it, and only from a public internet address                                                     |
| You test or use your Audiobookshelf connection                 | Only the Audiobookshelf server you entered, and only with the export you send                                                       |
| The Windows app checks for updates                             | GitHub Releases, at most every 12 hours and when you press **Check for updates**; turn automatic checks off in **Settings → About** |
| You choose **Install and restart** for an update               | The installer from that GitHub Release, which must match the update signature built into the app                                    |

Phones and tablets paired in LAN mode talk only to the computer, over your home network. Links to the
website, GitHub or the release notes open in your browser only when you click them. See
[Privacy and Security](Privacy-and-Security).

## Which operating systems and browsers are supported?

| Platform                | Status                                                                                                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows 11, Windows app | Not published yet: the installer first comes with version 2.1.0. Every change to it is built and tested on GitHub's Windows Server 2025 runners (install, speech, an export, data kept after a close and a crash, the update path); see [the Windows app](Windows-App) |
| Windows, from source    | The server's tests run in CI on Windows Server 2025                                                                                                                                                                                                                    |
| macOS, Linux            | The server's tests run in CI on macOS 15 and Ubuntu 24.04, and the web and browser tests on Ubuntu; the full app hasn't been tested by hand on them                                                                                                                    |
| Chrome, Edge, Firefox   | End-to-end tested                                                                                                                                                                                                                                                      |
| Safari                  | Tested with Playwright's WebKit build; not verified on real Apple hardware                                                                                                                                                                                             |
| Phones                  | Layout and playback tested with Pixel 7 and iPhone 13 emulation; see [Other Devices](Other-Devices)                                                                                                                                                                    |

## Why is voice cloning optional?

Chatterbox Turbo is a large download (several gigabytes) and works best with a GPU. Its pinned
dependencies also conflict with Kokoro's (it needs NumPy below 2, Kokoro's runtime needs NumPy 2 or
newer), so it has to run in its own isolated environment. Keeping it optional means the basic reader
never needs a GPU or a multi-gigabyte download. You install it from **Settings → Engines & models**
only if you want it.

## Can I clone a voice in a language other than English?

Not yet. In this app, Chatterbox Turbo is an English engine. Multilingual voice cloning is on the
[roadmap](https://github.com/carsonmcrae/ttsnative/blob/main/README.md#roadmap).

## Can it read scanned PDFs?

Not yet: OCR isn't supported, so PDFs that are only images of text are refused, and image-only pages
in other PDFs are skipped with a warning. Optional OCR is on the roadmap. See
[Reading Documents](Reading-Documents#scanned-pdfs).

## Does it highlight each word as it's spoken?

It highlights the whole sentence being spoken. Each sentence is its own audio clip, so the highlight is
always in sync. Word-level highlighting from real model timings is on the roadmap.

## Can I make audiobooks?

Yes. Export a document as an M4B audiobook with chapters, title, author, narrator and cover, as a
read-along EPUB, or as MP3 or WAV (one file or a ZIP with one file per chapter and a playlist).
Long exports pause, resume and survive a restart. See [Exporting Audio](Exporting-Audio).

## What licences apply?

| Component                                            | Licence                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| TTSNative                                            | MIT                                                                                   |
| Kokoro-82M model weights                             | Apache-2.0; training data includes CC BY material (Koniwa CC BY 3.0, SIWIS CC BY 4.0) |
| kokoro-onnx (ONNX export and runtime library)        | MIT                                                                                   |
| Chatterbox Turbo (optional)                          | MIT, code and weights                                                                 |
| espeak-ng (phonemisation, installed as a dependency) | GPL-3.0                                                                               |

Other dependencies have their own licences; see the
[licence inventory](https://github.com/carsonmcrae/ttsnative/blob/main/docs/security/license-inventory.md).

## Can I use it on my phone?

Yes, on the same trusted Wi-Fi network: turn on LAN mode in **Settings → Phones and tablets** and
pair the phone with the code shown there. The computer does the reading; the phone reads, listens,
adds documents and downloads exports. Voices are created only on the computer: phones can't record
over plain HTTP, and LAN mode keeps voice recordings off the network. See
[Other Devices](Other-Devices) and [What Works Where](What-Works-Where).
