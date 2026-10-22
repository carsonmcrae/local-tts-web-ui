# Installation

On Windows 11 you'll be able to install the [Windows app](Windows-App) instead, with no developer
tools: it comes with version 2.1.0, which isn't published yet. This page covers running TTSNative from
its source code (Windows, macOS and Linux), which is how you run it today and how you develop it.

| You get                     | Windows app                                 | From source                                     |
| --------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Python, server, voice model | Included in the installer                   | Downloaded by the first `npm run dev`           |
| Updates                     | Offered in the app, signature-checked       | `git pull`                                      |
| Your data                   | `%LOCALAPPDATA%\com.ttsnative.desktop\data` | `data/` in the project folder                   |
| Usual port                  | 8770 (up to 8789 if busy)                   | 8765 for the app, 5173 for `npm run dev`'s page |
| Phones (LAN mode)           | Yes                                         | With `npm run start`, not `npm run dev`         |

## Requirements

You need **Node.js 22.22 or newer** and **Git**. You don't need to install Python yourself: the first
run installs everything else inside the project folder.

|         | Basic reader (Kokoro)     | Voice cloning (Chatterbox, optional)                                          |
| ------- | ------------------------- | ----------------------------------------------------------------------------- |
| Disk    | ~0.7 GB (runtime + model) | +8 GB with NVIDIA CUDA (measured); about +4.5 GB CPU-only (estimated)         |
| Memory  | ~1 GB while speaking      | 4 GB+ RAM; 4 GB+ VRAM with a GPU                                              |
| GPU     | Not needed                | Recommended (NVIDIA or Apple Silicon); CPU works but is slower than real time |
| Network | First run only            | One-time download from Settings                                               |

CI runs the server's tests on Windows, macOS and Linux, and the web and browser tests on Linux. The
full app hasn't been tested by hand on macOS or Linux; see the
[FAQ](FAQ#which-operating-systems-and-browsers-are-supported).

## Install

```bash
git clone https://github.com/carsonmcrae/ttsnative.git
cd ttsnative
npm install
npm run dev
```

When the app is ready, your browser opens at `http://127.0.0.1:5173`. Press **Ctrl+C** in the
terminal to stop it. To start it again, run `npm run dev` in the same folder; later starts take a few
seconds.

If port 5173 (web) or 8765 (API) is busy, the app picks the next free port and prints the address.

## What the first run does

1. Downloads a pinned copy of [uv](https://docs.astral.sh/uv/), the Python manager, and checks its
   size and SHA-256 checksum. If uv 0.9.0 or newer is already on your `PATH`, that copy is used
   instead (set `LTTS_UV_PINNED_ONLY=1` to always use the pinned download).
2. uv installs Python 3.12 into `.tools/` and the locked server dependencies into `apps/server/.venv`.
   No system Python is required or changed.
3. Downloads the Kokoro voice model (about 340 MB) and verifies its size and SHA-256 before installing
   it.

If the model can't be downloaded (for example, you're offline), the app still starts and shows
**Install the voice model to start listening**. Install it from that banner, from
**Settings → Engines & models**, or by running `npm run setup` once you're online. Setting
`LTTS_SKIP_MODEL_DOWNLOAD=1` skips the download on purpose.

## Where things are stored

Everything lives inside the project folder and is ignored by Git.

| Location            | Contents                                                      |
| ------------------- | ------------------------------------------------------------- |
| `.tools/`           | uv and Python 3.12                                            |
| `apps/server/.venv` | The server's Python environment                               |
| `data/ltts.sqlite3` | Your library, reading progress, preferences and voice details |
| `data/models/`      | Verified model files                                          |
| `data/engines/`     | Optional engine environments (Chatterbox)                     |
| `data/cache/audio/` | Generated speech, reused when you listen again                |
| `data/voices/`      | Voice Studio reference recordings                             |
| `data/exports/`     | Exported audio                                                |

**Settings → Storage** shows the data folder and how much space each part uses. To keep your data
somewhere else, set `LTTS_DATA_DIR` (see [Settings and Models](Settings-and-Models#configuration)).
To back it up, stop the app and copy `data/`. The Windows app keeps its data elsewhere; see
[Where your data is](Windows-App#where-your-data-is).

## Production-style run

`npm run start` builds the web app and serves the UI and the API from one process, at
`http://127.0.0.1:8765` (or the next free port). `npm run dev` is the everyday command and adds hot
reload for development.

## Updating

TTSNative is updated with Git:

```bash
git pull
npm install
npm run dev
```

Every start re-syncs the Python environment from the committed lockfile, so new server dependencies
are installed automatically. Your `data/` folder isn't tracked by Git, so your library, voices and
models are kept.

The [changelog](https://github.com/carsonmcrae/ttsnative/blob/main/CHANGELOG.md) and the
[releases page](https://github.com/carsonmcrae/ttsnative/releases) list what changed in each
version, and **Settings → About** shows the version you're running.

## Uninstalling

Nothing is installed system-wide. To remove TTSNative, stop the app (**Ctrl+C**) and delete the
project folder. If you pointed `LTTS_DATA_DIR`, `LTTS_MODELS_DIR` or `LTTS_ENGINES_DIR` at a folder
outside the project, delete that folder too.

To start over without cloning again, stop the app and delete `data/` (your library, recordings and
models) and `.tools/` (uv and Python), then run `npm run dev`.

To free space without uninstalling, remove an engine or clear the audio cache in
[Settings](Settings-and-Models).

## Checking your setup with `npm run doctor`

```bash
npm run doctor
```

The doctor checks Node, uv, the Python environment, installed models, GPUs, ports and disk space. It
only reports: it never installs or changes anything. Run it first when something doesn't work, and
include its output (or **Settings → About → Copy diagnostics**) when you
[report a bug](https://github.com/carsonmcrae/ttsnative/issues). See also
[Troubleshooting](Troubleshooting).
