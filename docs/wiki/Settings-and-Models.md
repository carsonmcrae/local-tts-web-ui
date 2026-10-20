# Settings and models

**Settings** has seven sections: **Appearance**, **Playback**, **Pronunciation**, **Engines &
models**, **Storage**, **Privacy** and **About**. On wide screens, an index on the left jumps between them.

## Appearance

Choose the **System**, **Light** or **Dark** theme, and the reading text's **Text size**, **Line
spacing** and **Typeface** (with a preview). These are saved on this device only, so each browser can
have its own.

## Playback

These preferences are saved by the local server and shared by every browser that opens the app.

| Setting                          | What it does                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Default voice**                | The reading voice. Voices whose engine isn't installed are listed as "(not installed)".                      |
| **Playback speed**               | How fast audio plays, from 0.75× to 2×; pitch is preserved.                                                  |
| **Speaking pace**                | How quickly the voice itself speaks (Kokoro voices), 0.70× to 1.40×. New audio is generated when it changes. |
| **Export format**                | **MP3 (smaller)** or **WAV (lossless)**, the starting choice in the export dialog.                           |
| **Follow along while listening** | Keeps the sentence being spoken in view.                                                                     |

[Reading Documents](Reading-Documents#playback-speed-and-speaking-pace) explains speed and pace in
more detail.

## Pronunciation

Teach every voice how to say a word: enter the **Word or name** as it is written and how to **Say it
as**, spelled the way it sounds (for example "Kael" → "Kale", "Dr." → "Doctor"). **Hear it** plays it
in the current reading voice. Words match whole words in any letter case; tick **Only when the letter
case matches** for words such as "US". Rules apply to reading, previews and exports, and only the
sentences that contain a changed word are generated again. Up to 500 words; rules are plain text,
never patterns.

## Engines & models

Each speech engine has a panel with its status (**Installed**, **Installing**, **Not installed**,
**Optional** or **Needs attention**), hardware advice, the disk space it uses or needs, and its
licence. Model files are downloaded from pinned sources and verified with SHA-256 before use.

| Engine           | Role                                                                                    | Licence                                   |
| ---------------- | --------------------------------------------------------------------------------------- | ----------------------------------------- |
| Kokoro           | The default engine: the 54 built-in voices. CPU only; about 1 GB of RAM while speaking. | Apache-2.0 model weights; ONNX export MIT |
| Chatterbox Turbo | Optional voice cloning for [Voice Studio](Voice-Studio). Several GB to download.        | MIT (code and weights)                    |

- **Install.** The install button names the engine and its download size, for example
  **Install Kokoro**. For Chatterbox Turbo, first choose how to run it (see
  [Voice Studio](Voice-Studio#what-you-need)). A progress bar shows the download, with **Cancel**.
  If a model download is interrupted, retrying resumes it instead of starting again.
- **Remove.** **Remove** deletes the engine's model files and clears the audio cache. Your documents
  and voice recordings are kept, and you can reinstall at any time. Removing Chatterbox Turbo also
  removes its separate environment.

You can also install the Kokoro model from a terminal with `npm run setup`, and check the installed
Kokoro files against their checksums with:

```bash
node scripts/uv-run.mjs run --frozen --project apps/server ltts models verify kokoro
```

## Storage

Storage shows the path of your data folder and how much space is used by **Voice models**,
**Audio cache**, **Voice recordings**, **Exports** and the **Library database**, plus the free space on
that disk.

The audio cache holds generated speech so that sentences you've heard play instantly next time. It has
a limit (2 GB by default, `LTTS_AUDIO_CACHE_MAX_MB`); older audio is removed automatically when it's
full. **Clear audio cache** deletes all generated audio after you confirm. Documents, voices and models
are kept, and audio is generated again as you listen.

## Privacy

A summary of how the app treats your data: no accounts, analytics or telemetry; documents, recordings
and generated audio stay on this computer; the only network requests are model downloads you start
yourself; everything works offline once models are installed. If the server was started in network
mode, a **Network access is on** warning appears here (see [Other Devices](Other-Devices)).

## About

**About & diagnostics** lists the app and server versions, the Python runtime, your system (platform,
CPU count and RAM), the GPU (or "None detected (CPU mode)"), who made the app and its licence, with a
link to the source code and how to credit the project.

**Copy diagnostics** copies a short report to the clipboard: versions, platform, memory, GPUs, ONNX
Runtime providers, disk use and whether network access is on. It contains no documents or personal
data. Paste it into bug reports.

## Configuration

The defaults work out of the box. Server settings can be changed with environment variables, or by
copying
[`.env.example`](https://github.com/carsonmcrae/ttsnative/blob/main/.env.example) to `.env`
in the project folder. Some commonly changed ones:

| Variable                          | Default         | Purpose                                               |
| --------------------------------- | --------------- | ----------------------------------------------------- |
| `LTTS_DATA_DIR`                   | `./data`        | Library database, audio cache, recordings and exports |
| `LTTS_MODELS_DIR`                 | `<data>/models` | Verified model files                                  |
| `LTTS_AUDIO_CACHE_MAX_MB`         | 2048            | Audio cache size                                      |
| `LTTS_MAX_UPLOAD_MB`              | 25              | Largest accepted document                             |
| `LTTS_MAX_DOCUMENTS`              | 500             | Library size                                          |
| `LTTS_WARM_UP_ENGINES`            | true            | Load Kokoro at startup for a fast first sentence      |
| `LTTS_CLONE_WORKER_IDLE_UNLOAD_S` | 600             | Free GPU/CPU memory after this many idle seconds      |

The startup scripts read a few more variables: `LTTS_API_PORT` and `LTTS_WEB_PORT` (ports for
`npm run dev`), `LTTS_NO_OPEN=1` (don't open a browser) and `LTTS_SKIP_MODEL_DOWNLOAD=1`. These are
read from the environment of the terminal you start the app from, not from `.env`.

The full list is in the
[configuration guide](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/configuration.md).
