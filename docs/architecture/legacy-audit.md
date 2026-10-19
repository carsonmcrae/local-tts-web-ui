# Legacy audit (v1, Gradio)

> **Baseline:** `main` at commit `1452251` ("Improve setup instructions"), audited 2026-10-19 before any
> destructive change. The v1 code remains available in Git history; nothing on `main` was modified.

## In short

v1 was a single 250-line Gradio script (`kokoro_tts_ui.py`) that shelled out to the third-party
`kokoro-tts` CLI for every request. It worked for plain text and EPUB on the author's machine, but
its dependencies were unpinned, model downloads were unverified, PDF reading **silently produced no
audio**, and current versions of its dependencies are no longer compatible with newer model exports.
There were no tests, no license, and no CI.

## What was tested, and how

The legacy app was exercised in an isolated scratch virtual environment (Python 3.12.10, Windows 11)
with dependencies resolved exactly as `requirements.txt` would resolve them on 2026-10-19
(`gradio` 6.30.0, `kokoro-tts` 2.3.2 → `kokoro-onnx` 0.3.9, `pymupdf` 2.0, `ebooklib` 0.20). The same
`kokoro-tts` command line the UI builds was run against small TXT, PDF and EPUB files.

| Path | Result |
| --- | --- |
| Gradio UI construction (`import kokoro_tts_ui`) | ✅ Builds with Gradio 6.30 |
| TXT → WAV with the model URLs the app downloads (nazdridoy v1.0.0 release) | ✅ Audio produced |
| EPUB → WAV (same models) | ✅ Audio produced |
| **PDF → WAV** (single-page text PDF, no outline) | ❌ **Exit code 0, no audio file.** The CLI found "0 chapters" (no outline, short page) and wrote nothing. The UI would then return a path to a file that does not exist. |
| TXT with the current official model export (`kokoro-onnx` model-files-v1.1) | ❌ `Required inputs (['input_ids']) are missing` — the pinned `kokoro-onnx` 0.3.9 cannot load newer exports, so the app only works with the specific third-party mirror it hard-codes. |
| Error path output under a Windows non-UTF-8 pipe | ⚠️ `UnicodeEncodeError` from the CLI's braille spinner observed once in a failure path. |

## Classification

### 1. Preserve and improve

| v1 behaviour | v2 outcome |
| --- | --- |
| Kokoro as the local engine | Kept as the default engine, now via `kokoro-onnx` 0.6 in-process (no subprocess per request) with checksum-pinned v1.1 models. |
| 50+ voices, speed control | All 54 voices with language, gender and upstream quality grades; native pace control plus pitch-preserving playback speed. |
| Preview with caching | Generalised: every synthesised sentence is cached under a content hash (engine + model revision + voice + pace + text), with an LRU size limit. |
| Automatic first-run model download | Kept, but verified (exact size + SHA-256), resumable, atomic, and visible in the UI. |
| Local-only, no accounts | Kept and enforced (loopback binding, host/CSRF checks, no telemetry). |

### 2. Replace

| v1 | Why | v2 |
| --- | --- | --- |
| Gradio single-file UI | Developer-tool look, no read-along, no mobile layout | React + TypeScript app with Reader, Voices, Voice Studio, Settings. |
| `subprocess` call to the `kokoro-tts` CLI per request | Slow (model reload each time), fragile output parsing, silent failures | In-process engine behind an engine interface and a priority scheduler. |
| PyMuPDF / EbookLib (via `kokoro-tts`) | **AGPL-3.0** — incompatible with a permissively licensed project | pypdfium2 (Apache/BSD), python-docx (MIT), own EPUB reader on `zipfile` + defusedxml. |
| `urllib.request.urlretrieve` model download | No integrity check; a partial file is later treated as complete | Model store with manifest, SHA-256, `.part` files and atomic rename. |
| Manual venv + `python kokoro_tts_ui.py` | Many manual steps, Python version pitfalls | `npm install && npm run dev`; uv provisions Python 3.12 inside the repo. |

### 3. Remove

- "Text Prompts" folder browsing and "batch generate every .txt" — replaced by the document library and whole-document export.
- `demo.mp4` and `tts_screenshot.png` of the old UI (still in Git history).
- Output files written into the repository folder (`outputs/`) — runtime data now lives in the git-ignored `data/` directory.

### 4. Missing and implemented in v2

PDF/DOCX/Markdown support, scanned-PDF detection, read-along highlighting, resume position,
progressive playback, MP3 export and per-chapter export, custom voices with consent, voice library
and comparison, engine/model management, storage management, accessibility, mobile layout, tests,
CI, security hardening, documentation and licensing.

## Features that did not work as advertised

1. **PDF upload** — accepted by the UI, but produced no audio for PDFs without an outline/long pages (silent failure).
2. **"Upload File" accepts `.pdf`** while the CLI path for it depended on AGPL PyMuPDF and optional OCR packages that were never installed ("RapidOCR is missing").
3. **Reproducibility** — `requirements.txt` was unpinned (`gradio`, `kokoro-tts`), so behaviour depended on install date.

## Security and licensing findings

| Finding | Severity | Status in v2 |
| --- | --- | --- |
| Unverified model download over redirects; partial downloads accepted as installed | High | Fixed: pinned manifest, SHA-256, size checks, atomic install |
| Unpinned dependencies | Medium | Fixed: `uv.lock` and `package-lock.json`, exact versions, 14-day release cool-down |
| Transitive AGPL dependencies in an unlicensed repo | Medium (legal) | Removed; license inventory documented |
| No LICENSE file | Medium (legal) | MIT license added (owner to confirm) |
| No input size/time limits on uploads | Medium | Fixed: size, page, text, archive and time limits; sandboxed parsing |
| Personal sample text (`test.txt` greeting the author by name) | Low | Removed |
| No tests or CI | — | Added (see docs/guides/testing.md) |

Gradio itself bound to `127.0.0.1` by default, so v1 was not exposed to the network unless changed.
