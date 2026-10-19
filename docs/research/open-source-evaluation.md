# Open-source evaluation

> **In short:** Kokoro-82M via `kokoro-onnx` is the default engine (MIT code, Apache-2.0 weights, CPU,
> ~340 MB). Resemble AI Chatterbox Turbo is the optional cloning engine (MIT code **and** weights),
> isolated in its own environment. Documents are parsed with permissively licensed libraries only;
> PyMuPDF and EbookLib were rejected because they are AGPL. No third-party application code was copied.

Research date: 2026-10-19. Repository facts come from the GitHub API, PyPI and Hugging Face model
cards. Everything read was treated as untrusted reference material; no install scripts were run
during research. Licences are recorded separately for **code**, **model weights** and **data/voices**.

## Reference applications

| Project                                                                                           | Stars / activity       | Code licence | Stack                                                                           | What we learned                                                                                                                                                                                                                               | Used?             |
| ------------------------------------------------------------------------------------------------- | ---------------------- | ------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| [richardr1126/openreader](https://github.com/richardr1126/openreader) (formerly OpenReader-WebUI) | 544, pushed 2026-10-19 | MIT          | Next.js 15, pdf.js, epub.js, NATS, SeaweedFS; TTS via OpenAI-compatible servers | Play-while-generating on one timeline, segment audio cache reused for export, sentence-then-word highlighting, chaptered export. Its current architecture (message broker, object store, auth) is heavier than a single-user local app needs. | Ideas only        |
| [ijeetu/OpenReader-WebUI](https://github.com/ijeetu/OpenReader-WebUI)                             | 0, stale fork          | MIT          | as above                                                                        | Fork of the project above; nothing additional.                                                                                                                                                                                                | No                |
| [allenguarnes/kokoro-webui](https://github.com/allenguarnes/kokoro-webui)                         | 1, last push 2026-03   | Apache-2.0   | FastAPI + kokoro-onnx + uv                                                      | Confirms the FastAPI + kokoro-onnx + uv shape; OpenAI-compatible endpoint idea. No documents or read-along.                                                                                                                                   | Ideas only        |
| [remsky/Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)                                 | 5.5k, active           | Apache-2.0   | PyTorch Kokoro, Docker                                                          | Word timestamps via duration predictor; voice mixing. Docker-first and PyTorch-based (heavier).                                                                                                                                               | Roadmap reference |

## Speech engines

| Engine                                                                                            | Code              | Weights                                                                      | Cloning                             | CPU viable                   | Size                  | Assessment                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- | ----------------------------------- | ---------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kokoro-82M** via [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) 0.6.1               | MIT               | Apache-2.0 ([hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)) | No                                  | **Yes** (RTF ≈ 0.2 measured) | 326 MB + 28 MB voices | **Default.** Python 3.10–3.13 wheels, bundled espeak-ng (no system install), official checksummed release assets.                                                      |
| `kokoro` (PyTorch, hexgrad) 0.9.4                                                                 | Apache-2.0        | Apache-2.0                                                                   | No                                  | Yes                          | + torch               | Stalled since 2025-04, Python < 3.13, pulls torch, needs system espeak on Windows.                                                                                     |
| **Chatterbox Turbo** ([resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox), 27k ★) | MIT               | **MIT**                                                                      | **Yes (zero-shot, >5 s reference)** | Slow                         | ~3 GB + PyTorch       | **Optional cloning engine.** Only strong option with MIT weights. Pins `torch==2.6.0`, `numpy<2`, `gradio` → isolated environment. Output carries the Perth watermark. |
| Chatterbox Multilingual V3 / Nano / Turbo-ONNX                                                    | MIT               | MIT                                                                          | Yes                                 | Nano/ONNX claimed            | 0.7–3.3 GB            | Roadmap: multilingual cloning and a lighter CPU option.                                                                                                                |
| F5-TTS                                                                                            | MIT               | **CC-BY-NC-4.0**                                                             | Yes                                 | Poor                         | ~1.3 GB               | Rejected: non-commercial weights.                                                                                                                                      |
| XTTS-v2 (Coqui)                                                                                   | MPL-2.0           | **CPML (non-commercial)**                                                    | Yes                                 | Slow                         | ~1.8 GB               | Rejected: non-commercial weights, vendor defunct.                                                                                                                      |
| Fish-Speech / OpenAudio                                                                           | Community licence | Research / CC-BY-NC-SA                                                       | Yes                                 | No                           | 0.5–4 B               | Rejected: licence.                                                                                                                                                     |
| NeuTTS Air                                                                                        | Other             | Apache-2.0 (gated)                                                           | Yes                                 | Yes (GGUF)                   | ~0.7 B                | Credible backup for CPU cloning; gated weights.                                                                                                                        |
| Piper (OHF-Voice)                                                                                 | GPL-3.0           | per-voice                                                                    | No                                  | Yes                          | 20–100 MB/voice       | Rejected as default: GPL code and per-voice licences; Kokoro sounds more natural.                                                                                      |
| OpenVoice v2                                                                                      | MIT               | MIT                                                                          | Yes                                 | Yes                          | small                 | Stale (2025-04), Linux-oriented.                                                                                                                                       |
| Zonos, Dia, Orpheus, IndexTTS, VibeVoice, Sesame CSM, KittenTTS 2                                 | various           | various                                                                      | various                             | mostly no                    | 1–35 B                | Rejected for hardware needs, platform limits, licence restrictions or removed code.                                                                                    |

## Document processing

| Library                                                                       | Licence            | Decision                                                                                                   |
| ----------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| [pypdfium2](https://github.com/pypdfium2-team/pypdfium2) 5.14 (Google PDFium) | Apache-2.0 / BSD-3 | **Used for PDF.** Fast, robust parser fuzzed by the Chromium project; outline and per-page text.           |
| pypdf 6.x                                                                     | BSD-3              | Not used: many 2026 DoS CVEs; would be a second PDF stack.                                                 |
| pdfminer.six / pdfplumber                                                     | MIT                | Not used: slower; pdfplumber already depends on PDFium.                                                    |
| PyMuPDF                                                                       | **AGPL-3.0**       | **Rejected** (the v1 app pulled it in transitively).                                                       |
| [python-docx](https://github.com/python-openxml/python-docx) 1.2              | MIT                | **Used for DOCX** after our own ZIP and XML-entity checks (it parses with `resolve_entities=False`).       |
| EbookLib                                                                      | **AGPL-3.0**       | **Rejected.** EPUB is read with `zipfile` + defusedxml (container/OPF/nav/NCX) and Python's `html.parser`. |
| [defusedxml](https://github.com/tiran/defusedxml) 0.7.1                       | PSF                | **Used** for every EPUB XML part.                                                                          |
| [markdown-it-py](https://github.com/executablebooks/markdown-it-py) 4.2       | MIT                | **Used for Markdown**, raw HTML disabled.                                                                  |

## Audio

| Option                                                                                                  | Licence                                         | Decision                                                                 |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| [soundfile](https://github.com/bastibe/python-soundfile) 0.14 (bundled libsndfile 1.2 with LAME/mpg123) | BSD-3 (libsndfile LGPL-2.1, dynamically loaded) | **Used** for WAV and MP3 export — no ffmpeg needed; verified on Windows. |
| lameenc                                                                                                 | LGPL-3.0                                        | Not needed.                                                              |
| ffmpeg                                                                                                  | LGPL/GPL                                        | Avoided as a dependency.                                                 |

## Tooling

- **uv** (MIT/Apache-2.0) manages Python 3.12 and the locked environments. The bootstrap downloads a
  pinned uv release and verifies its SHA-256 (no `curl | sh`).
- **onnxruntime** 1.30 CPU. The CUDA/DirectML builds are not installed by default: Kokoro is fast on CPU
  and mixing onnxruntime variants is fragile. `kokoro-onnx[gpu]` resolves to nothing on Windows.

## Licensing consequences

- The repository is MIT. Runtime dependencies are permissive except **phonemizer** and the **espeak-ng**
  library bundled by `espeakng-loader` (GPL-3.0), used by kokoro-onnx for phonemisation. They are
  installed by uv into the user's environment and are not redistributed here. Anyone shipping a frozen
  bundle (PyInstaller, Electron, Docker image) must comply with GPL-3.0 for those components. See
  [license inventory](../security/license-inventory.md).
- Kokoro weights are Apache-2.0; its training data includes CC-BY sources (credited in the README).
- Chatterbox weights are MIT. Generated audio carries Resemble AI's imperceptible Perth watermark.
