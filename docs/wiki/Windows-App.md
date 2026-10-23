# The Windows app

From TTSNative 2.1.0 there is an installer for **Windows 11 (64-bit)**: no Git, Node.js, Python or
terminal needed. **2.1.0 isn't published yet**, so for now run TTSNative [from source](Installation).
Once it is out, download it from **[ttsnative.com/download](https://ttsnative.com/download/)**, which
always points at the newest installer. The file is also attached to the
[release on GitHub](https://github.com/carsonmcrae/ttsnative/releases/latest) as
`TTSNative-Setup-<version>.exe`.

The app is the same TTSNative as in a browser: a window around the same reader and the same local
server, which it starts and stops for you. [What Works Where](What-Works-Where) lists the few
differences.

## What you need

| Requirement    | Details                                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows        | Windows 11, 64-bit (x64). The app is built and tested for it only.                                                                                                                                                                                                                                                 |
| WebView2       | Part of Windows 11. If it is missing, the installer downloads Microsoft's WebView2 installer, which needs an internet connection.                                                                                                                                                                                  |
| Disk           | About 1.5 GB free to install. The installed app takes about 600 MB (measured on an early 2.1.0 build), plus your documents, the audio cache (up to 2 GB by default), exports and, if you add it, voice cloning (see below). The installer checks the drive first and stops, changing nothing, if there isn't room. |
| Memory and GPU | About 1 GB of RAM while speaking; no GPU needed for the built-in voices.                                                                                                                                                                                                                                           |
| Rights         | None: it installs for your Windows account only, without administrator rights.                                                                                                                                                                                                                                     |

## What's included, and what is an optional download

| Part                                                                           | How you get it                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The app window, the local server, its own Python, the web interface            | In the installer                                                                                                                                                                                                           |
| The Kokoro voice model (the 54 built-in voices)                                | In the installer, checked against its published SHA-256 when the installer is built and again before the app first loads it. You can read offline straight away.                                                           |
| The 25 included books, the background music and (from 2.2.0) the sound effects | In the installer                                                                                                                                                                                                           |
| Voice cloning (Chatterbox Turbo), for [Voice Studio](Voice-Studio)             | Optional, from **Settings → Engines & models**. About 4.5 GB on disk for **CPU only**, or about 8 GB for **NVIDIA GPU (CUDA)**, offered when an NVIDIA card is found; Settings shows each option's download and disk size. |
| ffmpeg, for M4B audiobooks                                                     | Optional; you install it yourself (see [Exporting Audio](Exporting-Audio#m4b-and-ffmpeg)). TTSNative never downloads it.                                                                                                   |

## Install

1. Run `TTSNative-Setup-<version>.exe`. It installs for your Windows account only; no administrator
   rights are needed. Tick **Create desktop shortcut** on the last page if you want one.
2. The installer isn't code-signed yet, so Windows SmartScreen may say it **protected your PC** from
   an unrecognised app. Choose **More info**, then **Run anyway**. You can first compare the file with
   `SHA256SUMS.txt` from the same release, or verify its build provenance with
   `gh attestation verify <file> --repo carsonmcrae/ttsnative`.
3. Open **TTSNative** from the Start menu. The first start can take a minute while Windows checks the new
   files; later starts take a few seconds.

The default Kokoro voices come with the app, so you can start reading straight away, offline.
Voice cloning is optional and installed from **Settings → Engines & models**, as in the source version.

## Updates

TTSNative checks GitHub for a newer **official** release (never a test or development build, and never
an older version) when it starts and while it is open, contacting GitHub at most once every 12 hours.
When one is available, a notice at the top of the window shows what's new:

- **View release notes** or **Update now** opens the notes; **Install and restart** downloads the
  update, checks its signature, closes TTSNative, installs it and opens it again.
- **Remind me later** hides that version for three days.

The signature check is separate from Windows' own code signing: every update must be signed with the
project's release key, which the app checks against the public key built into it, so a changed or
damaged download is never installed. Your documents, voices, recordings, models and settings are kept.
If an update can't be downloaded or its signature doesn't match, nothing changes and you can try again
or download the installer from the website. If the drive is too full for the new version, the
installer says so before it changes anything, and an update started from the app reopens the version
you have. You can
check now, or turn automatic checks off, in **Settings → About**; it says **No update is available
right now** when GitHub has no update to offer. Installing an older version over a newer one isn't
allowed.

## What's new and release history

After an update, **What's new** opens once. **Settings → About → Release history** shows every
version's notes one version at a time, also offline: pick a version from the list or use **Older** and
**Newer**, and see when it came out and what changed. The version you're running is marked
**Installed**, and **What's new in …** opens it directly. The version is also shown at the bottom of
the sidebar, where it leads to About. On the website, every version has its own page with the same
notes: [ttsnative.com/releases.html](https://ttsnative.com/releases.html).

## Where your data is

The app and your data are kept in separate folders, so updates and uninstalling replace the app
without touching your files.

| What                                                            | Where                                               |
| --------------------------------------------------------------- | --------------------------------------------------- |
| The app (replaced by every update)                              | `%LOCALAPPDATA%\TTSNative`                          |
| Documents, voices, recordings, models, cache, exports, database | `%LOCALAPPDATA%\com.ttsnative.desktop\data`         |
| Logs (`server.log`, `server.previous.log`, `desktop.log`)       | `%LOCALAPPDATA%\com.ttsnative.desktop\logs`         |
| Update settings                                                 | `%LOCALAPPDATA%\com.ttsnative.desktop\desktop.json` |
| Python for voice cloning, if you install it                     | `%LOCALAPPDATA%\com.ttsnative.desktop\tools`        |
| Window size and position                                        | `%APPDATA%\com.ttsnative.desktop`                   |

**Settings → About** has buttons to open the data and log folders, and **Settings → Storage** shows
how much space each part uses.

## Backing up or moving your data

Everything you made is in the `data` folder above. To back it up:

1. Close TTSNative (closing the window stops it).
2. Copy the whole `%LOCALAPPDATA%\com.ttsnative.desktop\data` folder somewhere safe.

To restore it, or to move to another computer: install TTSNative there, open it once and close it,
then delete its new `data` folder and put your backup in its place, **leaving out the `engines`
folder**. Install voice cloning again from Settings if you use it: its environment is tied to the
folder it was made in. On another computer or Windows account, enter your Audiobookshelf API key
again: it is encrypted for your Windows account and can't be read anywhere else. Appearance and
reading-text settings are kept per device, not in `data`, so set them again.

## Moving from a source install

The Windows app keeps its own data folder and doesn't touch a copy you run from source. To bring your
library across: quit both, copy everything inside `<your ttsnative folder>\data` into
`%LOCALAPPDATA%\com.ttsnative.desktop\data` **except the `engines` folder**, and start the app. Install
voice cloning again from Settings if you use it. Nothing is moved or deleted; your source copy keeps
working.

## Licences

TTSNative is MIT-licensed. The installer also contains open-source components under their own
licences, including espeak-ng and phonemizer (GPL-3.0) and libsndfile, LAME, mpg123 and GNU libiconv
(LGPL-2.1). Every licence is listed in `THIRD-PARTY-NOTICES.txt` in `%LOCALAPPDATA%\TTSNative\runtime`
(**Settings → About → Third-party notices** opens it), and the source code of the GPL and LGPL parts
is attached to each release on GitHub as `ttsnative-<version>-third-party-sources.tar.gz`.

## Uninstall

Use **Settings → Apps → Installed apps → TTSNative → Uninstall**. By default your data is kept for a
later reinstall: only the app is removed.

Deleting your data too takes two explicit steps. Tick **Delete the application data**, and TTSNative
asks once more, naming everything it would delete for your Windows account:

- `%LOCALAPPDATA%\com.ttsnative.desktop`: the documents in your library, your custom voices and
  recordings, exported audio kept by TTSNative, downloaded models, settings and logs;
- `%APPDATA%\com.ttsnative.desktop`: the remembered window size and position;
- the registry entry where the installer notes its folder.

Choose **No** to uninstall the app and keep all of it for a later reinstall. Updates never delete data.

You can also delete your data from inside the app: **Settings → About → Delete my data…** names the
same two folders' contents, needs a tick before its button works, then closes TTSNative and deletes
them. Files you saved elsewhere, such as downloaded MP3s, stay where they are. A copy from the
Microsoft Store, once it's listed there, keeps your data when Windows uninstalls it, so this is the way
to remove it.

## Troubleshooting

- **"TTSNative couldn't start"**: choose **Try again**. If it keeps happening, **Open log folder** and
  attach `server.log` and `desktop.log` to a [GitHub issue](https://github.com/carsonmcrae/ttsnative/issues);
  they contain no document text. Reinstalling from the website keeps your data.
- **Another program uses port 8770**: TTSNative picks the next free port (up to 8789); your reading
  settings then start from their defaults for that session.
- **Antivirus or Smart App Control blocks a file**: the app isn't code-signed yet. Allow TTSNative, or run
  it from source instead.

More in [Troubleshooting](Troubleshooting#the-windows-app).
