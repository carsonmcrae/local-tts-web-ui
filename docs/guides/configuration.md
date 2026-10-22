# Configuration

Defaults work out of the box. To change a server setting, set an environment variable or copy
[`.env.example`](../../.env.example) to `.env` in the repository root (it is git-ignored). The server reads
`.env`; the Node scripts don't, so the bootstrap variables at the end of this page, and
`LTTS_ACCESS_TOKEN` for `ltts serve --allow-network`, must be real environment variables.
User preferences (voice, speed, pace, export format, follow-along) are edited in **Settings** and stored
in the local database; the theme is stored per browser.

This page is for source installs. The Windows app removes every inherited `LTTS_*` variable before it
starts its bundled server and sets its own: the data folder (`%LOCALAPPDATA%\com.ttsnative.desktop\data`),
`127.0.0.1` on port 8770 (or the next free one up to 8789), and the bundled model, uv and
voice-cloning project. A global setting can't change it or open it to the network; only LAN mode,
turned on in Settings, adds a home-network listener
([desktop-and-releases.md](../architecture/desktop-and-releases.md)).

| Variable                                                                                       | Default           | Purpose                                                                                                           |
| ---------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `LTTS_DATA_DIR`                                                                                | `./data`          | Library database, audio cache, recordings, exports                                                                |
| `LTTS_MODELS_DIR`                                                                              | `<data>/models`   | Verified model files                                                                                              |
| `LTTS_ENGINES_DIR`                                                                             | `<data>/engines`  | Optional engine environments (Chatterbox)                                                                         |
| `LTTS_HOST`                                                                                    | `127.0.0.1`       | Bind address (non-loopback requires `--allow-network`)                                                            |
| `LTTS_ALLOW_NETWORK` / `LTTS_ACCESS_TOKEN`                                                     | off / unset       | Network mode; see [LAN access](lan-access.md)                                                                     |
| `LTTS_EXTRA_ALLOWED_HOSTS`                                                                     | `[]`              | Extra host names accepted in network mode (a JSON list, e.g. `["mybox.local"]`; token still required)             |
| `LTTS_MAX_UPLOAD_MB`                                                                           | 25                | Largest accepted document (the web UI also stops files over 25 MB, so a higher value only applies to API uploads) |
| `LTTS_MAX_TEXT_CHARS`                                                                          | 2,000,000         | Largest extracted text (≈ 330k words)                                                                             |
| `LTTS_MAX_PDF_PAGES`                                                                           | 2,000             | PDF page limit                                                                                                    |
| `LTTS_MAX_ARCHIVE_ENTRIES` / `LTTS_MAX_ARCHIVE_UNCOMPRESSED_MB` / `LTTS_MAX_COMPRESSION_RATIO` | 5,000 / 300 / 200 | DOCX/EPUB container limits                                                                                        |
| `LTTS_EXTRACTION_TIMEOUT_S` / `LTTS_EXTRACTION_MEMORY_MB`                                      | 90 / 1,536        | Sandbox limits (memory: Linux only)                                                                               |
| `LTTS_MAX_CONCURRENT_EXTRACTIONS`                                                              | 2                 | Parallel document processing                                                                                      |
| `LTTS_MAX_DOCUMENTS`                                                                           | 500               | Library size                                                                                                      |
| `LTTS_AUDIO_CACHE_MAX_MB`                                                                      | 2,048             | Least-recently-used audio is evicted above this                                                                   |
| `LTTS_MIN_FREE_DISK_MB`                                                                        | 500               | Uploads, recordings, exports and model or engine installs refuse to fill the disk                                 |
| `LTTS_MAX_VOICE_REFERENCE_S` / `LTTS_MAX_VOICE_PROFILES`                                       | 60 / 50           | Voice Studio limits                                                                                               |
| `LTTS_MIN_STUDIO_SPEECH_S` / `LTTS_MAX_SESSION_TAKES` / `LTTS_MAX_VOICE_IMPORT_S`              | 300 / 200 / 1,800 | Studio voices: usable speech needed to build, takes per session, and one imported recording's length              |
| `LTTS_WARM_UP_ENGINES`                                                                         | true              | Load Kokoro at startup for a fast first sentence                                                                  |
| `LTTS_CLONE_WORKER_IDLE_UNLOAD_S`                                                              | 600               | Free GPU/CPU memory after this much idle time                                                                     |
| `LTTS_SPEECH_API_MAX_CHARS`                                                                    | 4,000             | [Local speech API](local-speech-api.md): characters per request (up to 20,000)                                    |
| `LTTS_SPEECH_API_REQUESTS_PER_MINUTE`                                                          | 60                | Local speech API: requests a minute per token                                                                     |
| `LTTS_SPEECH_API_TIMEOUT_S`                                                                    | 120               | Local speech API: seconds one request may take                                                                    |
| `LTTS_FFMPEG`                                                                                  | unset             | Path to the ffmpeg for M4B exports, else the first `ffmpeg` on the `PATH` (environment only, not `.env`)          |

Bootstrap variables: `LTTS_SKIP_MODEL_DOWNLOAD`, `LTTS_NO_OPEN`, `LTTS_API_PORT`, `LTTS_WEB_PORT`,
`LTTS_UV_PATH`, `LTTS_UV_PINNED_ONLY` (see `.env.example`).

## Why 25 MB?

Text-based books and reports are small: a 400-page novel PDF is typically 1–5 MB and EPUBs are usually
under 10 MB. Large files are almost always scanned images (which need OCR, not supported yet) or image-heavy
layouts, whose text still fits comfortably. Raise the limit if you regularly read large illustrated PDFs.
