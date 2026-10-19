# Troubleshooting

Start with `npm run doctor`. It checks Node, uv, the Python environment, installed models, GPUs, ports and
disk space without changing anything.

| Symptom                                                         | Cause and fix                                                                                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Node.js 22.12 or newer is required`                            | Install the current Node LTS (see `.nvmrc`).                                                                                                                                |
| `Installing the locked Python dependencies failed` on first run | uv needs internet access to download Python 3.12 and packages. Check proxies/firewalls for `github.com`, `pypi.org` and `files.pythonhosted.org`, then rerun `npm run dev`. |
| `Refusing download from unapproved host` / `Checksum mismatch`  | A proxy or mirror changed a download. Nothing was installed; don't bypass the check. Retry on a normal connection.                                                          |
| "Install the voice model to start listening"                    | The Kokoro model isn't installed (offline first run or `LTTS_SKIP_MODEL_DOWNLOAD=1`). Click **Install** in the banner or Settings → Engines, or run `npm run setup`.        |
| A PDF says "no text layer … scanned images"                     | The PDF contains pictures of text. OCR isn't supported yet; export the text from the original or run OCR first.                                                             |
| "contents don't match its extension"                            | The file was renamed (e.g. a `.txt` named `.pdf`). Use the real format.                                                                                                     |
| Playback never starts in the browser                            | Check Settings → Engines. If audio is generated but silent, check the system output device; the app plays standard WAV.                                                     |
| Recording says it needs a secure page                           | Browsers only allow microphones on `localhost`/HTTPS. Record on the computer running the app, or import a recording.                                                        |
| Chatterbox install fails                                        | It downloads ~3–5 GB (PyTorch + weights). Check free disk space and connection, then retry; partial downloads resume. The terminal shows uv's error.                        |
| Chatterbox is very slow                                         | Without an NVIDIA GPU (or Apple Silicon) cloning runs on CPU, which is slower than real time.                                                                               |
| `Port … is in use`                                              | The app picks the next free port automatically; or set `LTTS_API_PORT` / `LTTS_WEB_PORT`.                                                                                   |
| Windows: `failed to remove file … ltts.exe` while syncing       | The dev server is still running and holds the file; stop it (Ctrl+C) and rerun.                                                                                             |
| Start over                                                      | Stop the app and delete `data/` (your library, recordings and models) and `.tools/` (uv and Python).                                                                        |
