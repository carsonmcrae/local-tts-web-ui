# Troubleshooting

## Start with the doctor

```bash
npm run doctor
```

It checks Node, uv, the Python environment, installed models, GPUs, ports and disk space without
changing anything, and suggests next steps.

The status line at the bottom of the sidebar is a quick check too:

| Status                   | Meaning                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| **Voices ready**         | The Kokoro model is installed.                                                           |
| **Installing voices…**   | The Kokoro model is being installed.                                                     |
| **Voices not installed** | Install the model from **Settings → Engines & models**.                                  |
| **Server offline**       | The page got no engine status from the local server. Check the terminal running the app. |

## Common problems

| Symptom                                                         | Cause and fix                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Node.js 22.22 or newer is required`                            | Install the current Node LTS.                                                                                                                                                                                                                                                   |
| `Installing the locked Python dependencies failed` on first run | uv needs internet access to download Python 3.12 and packages. Check proxies and firewalls for `github.com`, `pypi.org` and `files.pythonhosted.org`, then run `npm run dev` again.                                                                                             |
| `Refusing download from unapproved host` or `Checksum mismatch` | A proxy or mirror changed a download. Nothing was installed. Don't bypass the check; retry on a normal connection.                                                                                                                                                              |
| "Needs repair" or "Repair the voice model to keep listening"    | A model file is missing, incomplete or doesn't match its published checksum (an interrupted copy, a disk error, or a file edited by another program). Press **Repair** in **Settings → Engines & models**, or run `npm run setup`; only the damaged files are downloaded again. |
| "Install the voice model to start listening"                    | The Kokoro model isn't installed (offline first run, or `LTTS_SKIP_MODEL_DOWNLOAD=1`). Install it from the banner or **Settings → Engines & models**, or run `npm run setup`.                                                                                                   |
| A PDF says it has no text layer                                 | It contains pictures of text. OCR isn't supported yet; export the text from the original, or run OCR first. See [scanned PDFs](Reading-Documents#scanned-pdfs).                                                                                                                 |
| "contents don't match its extension"                            | The file was renamed (for example, a `.txt` named `.pdf`). Use the real format.                                                                                                                                                                                                 |
| "This PDF is password-protected"                                | Remove the password and upload it again.                                                                                                                                                                                                                                        |
| A file over 25 MB is refused                                    | See the [limits](Reading-Documents#limits).                                                                                                                                                                                                                                     |
| Playback never starts                                           | Check **Settings → Engines & models**. If audio is generated but silent, check your system's output device.                                                                                                                                                                     |
| Recording says it needs a secure page                           | Browsers only allow microphones on `localhost` or HTTPS. Record on the computer running the app, or import a recording.                                                                                                                                                         |
| "Microphone access was blocked"                                 | Allow the microphone in your browser's site settings, then try again.                                                                                                                                                                                                           |
| Chatterbox install fails                                        | It's a download of several gigabytes (PyTorch and model weights). Check free disk space and your connection, then retry; model downloads resume. The terminal shows uv's error.                                                                                                 |
| Chatterbox is very slow                                         | Without an NVIDIA GPU or Apple Silicon, cloning runs on the CPU, which is slower than real time.                                                                                                                                                                                |
| `Port … is in use`                                              | The app picks the next free port automatically, or set `LTTS_API_PORT` / `LTTS_WEB_PORT`.                                                                                                                                                                                       |
| Windows: `failed to remove file … ltts.exe` while syncing       | The app is still running and holds the file. Stop it (**Ctrl+C**) and run the command again.                                                                                                                                                                                    |

## Starting over

Stop the app and delete `data/` (your library, recordings and models) and `.tools/` (uv and Python),
then run `npm run dev`. See [Installation](Installation#uninstalling).

## Still stuck?

- Read the full
  [troubleshooting guide](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/troubleshooting.md).
- Check the [FAQ](FAQ).
- Ask in [Discussions](https://github.com/carsonmcrae/ttsnative/discussions/categories/q-a), or
  [open an issue](https://github.com/carsonmcrae/ttsnative/issues) with the output of
  `npm run doctor` or **Settings → About → Copy diagnostics**. Please don't paste document text,
  voice recordings or other personal data into public issues.
- Security problems: report them privately (see
  [Privacy and Security](Privacy-and-Security#reporting-a-vulnerability)).

[SUPPORT.md](https://github.com/carsonmcrae/ttsnative/blob/main/SUPPORT.md) lists where to go
for each kind of help. It's a volunteer project, so replies may take a few days.
