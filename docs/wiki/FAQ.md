# FAQ

## Does TTSNative work offline?

Yes, once setup has finished. The first run needs internet access to download uv, Python 3.12, the
server's packages and the Kokoro voice model. Installing the optional Chatterbox Turbo engine needs
one more download. After that, reading, listening, voice creation and export all work offline.

## Do I need a GPU?

No. Kokoro, the default engine, runs on the CPU only and uses about 1 GB of RAM while speaking. On the
machine used for the
[performance measurements](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/performance.md)
it generated speech about five times faster than real time. Older or low-power CPUs may not keep up
with continuous playback at high speeds.

A GPU is only recommended for voice cloning: Chatterbox Turbo works best with an NVIDIA GPU (4 GB+
VRAM) or Apple Silicon, and is slower than real time on a CPU.

## Where are my documents, recordings and audio stored?

In the `data/` folder inside the project, unless you set `LTTS_DATA_DIR`. **Settings → Storage** shows
the exact path and how much space each part uses. See
[Installation](Installation#where-things-are-stored).

## Does anything leave my computer?

No documents, recordings or generated audio. There are no accounts, analytics or telemetry. The only
network requests are the downloads you start (setup and optional engines), from pinned sources with
checksums. See [Privacy and Security](Privacy-and-Security).

## Which operating systems and browsers are supported?

| Platform              | Status                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Windows 11            | Fully tested: setup, unit and integration tests, real inference, and browser tests                      |
| macOS, Linux          | Automated tests run in CI on macOS 15 and Ubuntu 24.04; the full app hasn't been tested by hand on them |
| Chrome, Edge, Firefox | End-to-end tested                                                                                       |
| Safari                | Tested with Playwright's WebKit build on Windows; not verified on real Apple hardware                   |
| Phones                | Layout and playback tested with Pixel 7 and iPhone 13 emulation; see [Other Devices](Other-Devices)     |

## Why is voice cloning optional?

Chatterbox Turbo is a large download (several gigabytes) and works best with a GPU. Its pinned
dependencies also conflict with Kokoro's (it needs NumPy below 2, Kokoro's runtime needs NumPy 2 or
newer), so it has to run in its own isolated environment. Keeping it optional means the basic reader never needs a GPU or a multi-gigabyte
download. You install it from **Settings → Engines & models** only if you want it.

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

Yes. Export a document as MP3 or WAV, as one file or as a ZIP with one file per chapter and a
playlist. See [Exporting Audio](Exporting-Audio). M4B export with chapter markers is on the roadmap.

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
pair the phone with the code shown there. Recording isn't available over plain HTTP, but you can
import a recording. See [Other Devices](Other-Devices).
