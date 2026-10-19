# Configuration

Defaults work out of the box. To change something, set an environment variable or copy
[`.env.example`](../../.env.example) to `.env` in the repository root (it is git-ignored).
User preferences (voice, speed, pace, export format, follow-along) are edited in **Settings** and stored
in the local database; the theme is stored per browser.

| Variable                                                                                       | Default           | Purpose                                                |
| ---------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------ |
| `LTTS_DATA_DIR`                                                                                | `./data`          | Library database, audio cache, recordings, exports     |
| `LTTS_MODELS_DIR`                                                                              | `<data>/models`   | Verified model files                                   |
| `LTTS_ENGINES_DIR`                                                                             | `<data>/engines`  | Optional engine environments (Chatterbox)              |
| `LTTS_HOST`                                                                                    | `127.0.0.1`       | Bind address (non-loopback requires `--allow-network`) |
| `LTTS_ALLOW_NETWORK` / `LTTS_ACCESS_TOKEN`                                                     | off / unset       | Network mode; see [LAN access](lan-access.md)          |
| `LTTS_MAX_UPLOAD_MB`                                                                           | 25                | Largest accepted document                              |
| `LTTS_MAX_TEXT_CHARS`                                                                          | 2,000,000         | Largest extracted text (≈ 330k words)                  |
| `LTTS_MAX_PDF_PAGES`                                                                           | 2,000             | PDF page limit                                         |
| `LTTS_MAX_ARCHIVE_ENTRIES` / `LTTS_MAX_ARCHIVE_UNCOMPRESSED_MB` / `LTTS_MAX_COMPRESSION_RATIO` | 5,000 / 300 / 200 | DOCX/EPUB container limits                             |
| `LTTS_EXTRACTION_TIMEOUT_S` / `LTTS_EXTRACTION_MEMORY_MB`                                      | 90 / 1,536        | Sandbox limits (memory: POSIX only)                    |
| `LTTS_MAX_CONCURRENT_EXTRACTIONS`                                                              | 2                 | Parallel document processing                           |
| `LTTS_MAX_DOCUMENTS`                                                                           | 500               | Library size                                           |
| `LTTS_AUDIO_CACHE_MAX_MB`                                                                      | 2,048             | Least-recently-used audio is evicted above this        |
| `LTTS_MIN_FREE_DISK_MB`                                                                        | 500               | Downloads/exports refuse to fill the disk              |
| `LTTS_MAX_VOICE_REFERENCE_S` / `LTTS_MAX_VOICE_PROFILES`                                       | 60 / 50           | Voice Studio limits                                    |
| `LTTS_WARM_UP_ENGINES`                                                                         | true              | Load Kokoro at startup for a fast first sentence       |
| `LTTS_CLONE_WORKER_IDLE_UNLOAD_S`                                                              | 600               | Free GPU/CPU memory after this much idle time          |

Bootstrap variables: `LTTS_SKIP_MODEL_DOWNLOAD`, `LTTS_NO_OPEN`, `LTTS_API_PORT`, `LTTS_WEB_PORT`,
`LTTS_UV_PATH`, `LTTS_UV_PINNED_ONLY` (see `.env.example`).

## Why 25 MB?

Text-based books and reports are small: a 400-page novel PDF is typically 1–5 MB and EPUBs are usually
under 10 MB. Large files are almost always scanned images (which need OCR, not supported yet) or image-heavy
layouts, whose text still fits comfortably. Raise the limit if you regularly read large illustrated PDFs.
