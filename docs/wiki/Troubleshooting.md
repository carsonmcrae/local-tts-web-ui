# Troubleshooting

## Start with the doctor

From source, run:

```bash
npm run doctor
```

It checks Node, uv, the Python environment, installed models, GPUs, ports and disk space without
changing anything, and suggests next steps. In the Windows app, start with
[its own section](#the-windows-app) below.

The status line at the bottom of the sidebar is a quick check too:

| Status                   | Meaning                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Voices ready**         | The Kokoro model is installed.                                                                                                |
| **Installing voices…**   | The Kokoro model is being installed.                                                                                          |
| **Voices not installed** | Install the model from **Settings → Engines & models**.                                                                       |
| **Voices need repair**   | A model file is damaged; see "Needs repair" below.                                                                            |
| **Server offline**       | The page got no engine status from the local server. Check the terminal running the app, or close and reopen the Windows app. |

## The Windows app

The app keeps its logs in `%LOCALAPPDATA%\com.ttsnative.desktop\logs`: `server.log` (this run),
`server.previous.log` (the run before) and `desktop.log` (the app's own notes). **Settings → About →
Open log folder** opens it, and so does the start-up screen when the app can't start. The logs contain
no document text; attach them to a bug report.

| Symptom                                                        | Cause and fix                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Windows protected your PC** when you run the installer       | The installer isn't code-signed yet. Choose **More info**, then **Run anyway**. To be sure it's the real file, first compare it with `SHA256SUMS.txt` from the same release.                                                                                                           |
| Antivirus or Smart App Control blocks a file                   | Also because it isn't code-signed yet. Allow TTSNative, or run it [from source](Installation).                                                                                                                                                                                         |
| "TTSNative needs about … MB free on drive …"                   | The installer found too little room and stopped before changing anything; your documents and voices are kept. Free some space and run it again. An update started from the app reopens the version you have.                                                                           |
| **TTSNative couldn't start**                                   | The start-up screen says why, with **Try again**, **Open log folder** and **Quit**. Choose **Try again** first. Your documents, voices and settings are safe.                                                                                                                          |
| "Some of TTSNative's files are missing"                        | Part of the install was removed, for example by antivirus. Reinstall from [ttsnative.com/download](https://ttsnative.com/download/); your data is kept.                                                                                                                                |
| "…took too long to start"                                      | The first start after installing can be slow while Windows checks the new files (the app waits three minutes). Choose **Try again**.                                                                                                                                                   |
| "…stopped while starting" or "…couldn't be started"            | Open the log folder and look at the end of `server.log`, or attach it and `desktop.log` to a [GitHub issue](https://github.com/carsonmcrae/ttsnative/issues/new/choose).                                                                                                               |
| "No free local port was found"                                 | Ports 8770 to 8789 on `127.0.0.1` are all in use. Close the programs using them, or restart the computer.                                                                                                                                                                              |
| Your theme or reading text settings are back to their defaults | Port 8770 was busy, so the app started on the next free port, and these per-device settings are kept per port. They come back once 8770 is free and you restart TTSNative. Programs using the [local speech API](Settings-and-Models#local-speech-api) need the new address meanwhile. |
| "TTSNative couldn't check for updates"                         | No connection to GitHub. Reading works offline; try again later, or download the newest installer from the website.                                                                                                                                                                    |
| "No update is available right now"                             | GitHub answered but had no update to offer, for example because none has been published yet. Nothing is wrong with your connection or your copy.                                                                                                                                       |
| An update failed                                               | If it couldn't be downloaded or its signature didn't match, nothing was changed. If the installer stopped part-way, install the newest version from the website; your data is in a separate folder and is kept.                                                                        |
| An M4B export says ffmpeg is missing                           | Install ffmpeg so that it is on your `PATH` (the app ignores `LTTS_FFMPEG`), then restart TTSNative. See [Exporting Audio](Exporting-Audio#m4b-and-ffmpeg).                                                                                                                            |

## Common problems

Most of these apply to the Windows app too; the ones about Node, uv and the terminal are for source
installs only.

| Symptom                                                         | Cause and fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Node.js 22.22 or newer is required`                            | Install the current Node LTS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Installing the locked Python dependencies failed` on first run | uv needs internet access to download Python 3.12 and packages. Check proxies and firewalls for `github.com`, `pypi.org` and `files.pythonhosted.org`, then run `npm run dev` again.                                                                                                                                                                                                                                                                                                                   |
| `Refusing download from unapproved host` or `Checksum mismatch` | A proxy or mirror changed a download. Nothing was installed. Don't bypass the check; retry on a normal connection.                                                                                                                                                                                                                                                                                                                                                                                    |
| "Needs repair" or "Repair the voice model to keep listening"    | A model file is missing, incomplete or doesn't match its published checksum (an interrupted copy, a disk error, or a file edited by another program). Press **Repair** in **Settings → Engines & models**, or run `npm run setup`; only the damaged files are downloaded again. If the damage comes back after a repair, the bits are probably changing in memory or on the drive rather than in the app: run Windows Memory Diagnostic or MemTest86, and try without memory overclocking (XMP/EXPO). |
| "Install the voice model to start listening"                    | The Kokoro model isn't installed (offline first run, or `LTTS_SKIP_MODEL_DOWNLOAD=1`). Install it from the banner or **Settings → Engines & models**, or run `npm run setup`.                                                                                                                                                                                                                                                                                                                         |
| A PDF says it has no text layer                                 | It contains pictures of text. OCR isn't supported yet; export the text from the original, or run OCR first. See [scanned PDFs](Reading-Documents#scanned-pdfs).                                                                                                                                                                                                                                                                                                                                       |
| "contents don't match its extension"                            | The file was renamed (for example, a `.txt` named `.pdf`). Use the real format.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| "This PDF is password-protected"                                | Remove the password and upload it again.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| A file over 25 MB is refused                                    | See the [limits](Reading-Documents#limits).                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Playback never starts                                           | Check **Settings → Engines & models**. If audio is generated but silent, check your system's output device.                                                                                                                                                                                                                                                                                                                                                                                           |
| Recording says it needs a secure page                           | Browsers only allow microphones on `localhost` or HTTPS. Record on the computer running the app, or import a recording.                                                                                                                                                                                                                                                                                                                                                                               |
| "Microphone access was blocked"                                 | Allow the microphone in your browser's site settings, then try again.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Chatterbox install fails                                        | It's a download of several gigabytes (PyTorch and model weights). Check free disk space and your connection, then retry; model downloads resume. The terminal shows uv's error.                                                                                                                                                                                                                                                                                                                       |
| Chatterbox is very slow                                         | Without an NVIDIA GPU or Apple Silicon, cloning runs on the CPU, which is slower than real time.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Port … is in use`                                              | The app picks the next free port automatically, or set `LTTS_API_PORT` / `LTTS_WEB_PORT`.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Windows: `failed to remove file … ltts.exe` while syncing       | The app is still running and holds the file. Stop it (**Ctrl+C**) and run the command again.                                                                                                                                                                                                                                                                                                                                                                                                          |

## Starting over

From source, stop the app and delete `data/` (your library, recordings and models) and `.tools/` (uv
and Python), then run `npm run dev`. See [Installation](Installation#uninstalling). In the Windows app,
uninstall with **Delete the application data** ticked and confirm, then install again; see
[Uninstall](Windows-App#uninstall). Both delete your library, voices and recordings for good, so back
them up first if you want to keep them.

## Still stuck?

- Read the full
  [troubleshooting guide](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/troubleshooting.md).
- Check the [FAQ](FAQ).
- Ask in [Discussions](https://github.com/carsonmcrae/ttsnative/discussions/categories/q-a), or
  [open an issue](https://github.com/carsonmcrae/ttsnative/issues) with the output of
  `npm run doctor` or **Settings → About → Copy diagnostics**, and say where it happened (the Windows
  app, a browser on the computer, or a phone). Please don't paste document text, voice recordings or
  other personal data into public issues.
- Security problems: report them privately (see
  [Privacy and Security](Privacy-and-Security#reporting-a-vulnerability)).

[SUPPORT.md](https://github.com/carsonmcrae/ttsnative/blob/main/SUPPORT.md) lists where to go
for each kind of help. It's a volunteer project, so replies may take a few days.
