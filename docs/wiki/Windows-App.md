# The Windows app

From TTSNative 2.1.0 there is an installer for **Windows 11 (64-bit)**: no Git, Node.js, Python or
terminal needed. Download it from **[ttsnative.com/download](https://ttsnative.com/download/)**,
which always points at the newest installer once a release includes it. The file is also attached to the
[release on GitHub](https://github.com/carsonmcrae/ttsnative/releases/latest) as
`TTSNative-Setup-<version>.exe`.

## Install

1. Run `TTSNative-Setup-<version>.exe`. It installs for your Windows account only; no administrator
   rights are needed. Tick **Create desktop shortcut** on the last page if you want one.
2. Until the installer is code-signed, Windows may say it **protected your PC** from an unrecognised
   app. Choose **More info**, then **Run anyway**. You can first compare the file with
   `SHA256SUMS.txt` from the same release, or verify its build provenance with
   `gh attestation verify <file> --repo carsonmcrae/ttsnative`.
3. Open **TTSNative** from the Start menu. The first start can take a minute while Windows checks the new
   files; later starts take a few seconds.

The default Kokoro voices come with the app, so you can start reading straight away, offline.
Voice cloning is optional and installed from **Settings → Engines & models**, as in the source version.

## Updates

TTSNative checks GitHub for a newer **official** release at most twice a day (never a test or
development build). When one is available, a notice at the top of the window shows what's new:

- **View release notes** or **Update now** opens the notes; **Install and restart** downloads the
  update, checks its signature, closes TTSNative, installs it and opens it again.
- **Remind me later** hides that version for three days.

Your documents, voices, recordings, models and settings are kept. If an update can't be downloaded or
its signature doesn't match, nothing changes and you can try again or download the installer from the
website. You can check now, or turn automatic checks off, in **Settings → About**.

## What's new and release history

After an update, **What's new** opens once. **Settings → About → Release history** lists every version
with its notes, also offline; **What's new in …** jumps to the version you're running.

## Where your data is

| What                                                            | Where                                       |
| --------------------------------------------------------------- | ------------------------------------------- |
| The app (replaced by every update)                              | `%LOCALAPPDATA%\TTSNative`                  |
| Documents, voices, recordings, models, cache, exports, database | `%LOCALAPPDATA%\com.ttsnative.desktop\data` |
| Logs (`server.log`, `desktop.log`)                              | `%LOCALAPPDATA%\com.ttsnative.desktop\logs` |

**Settings → About** has buttons to open the data and log folders.

## Moving from a source install

The Windows app keeps its own data folder and doesn't touch a copy you run from source. To bring your
library across: quit both, copy everything inside `<your ttsnative folder>\data` into
`%LOCALAPPDATA%\com.ttsnative.desktop\data` **except the `engines` folder**, and start the app. Install
voice cloning again from Settings if you use it (its environment is tied to the folder it was made in).
Nothing is moved or deleted; your source copy keeps working.

## Licences

TTSNative is MIT-licensed. The installer also contains open-source components under their own
licences, including espeak-ng and phonemizer (GPL-3.0) and libsndfile, LAME, mpg123 and GNU libiconv
(LGPL-2.1). Every licence is listed in `THIRD-PARTY-NOTICES.txt` in `%LOCALAPPDATA%\TTSNative\runtime`
(Settings → About opens it), and the source code of the GPL and LGPL parts is attached to each release
on GitHub as `ttsnative-<version>-third-party-sources.tar.gz`.

## Uninstall

Use **Settings → Apps → Installed apps → TTSNative → Uninstall**. Your documents and voices are kept
for a later reinstall. To delete them too, tick **Delete the application data**; TTSNative then asks
once more and lists what will be deleted.

## Troubleshooting

- **"TTSNative couldn't start"**: choose **Try again**. If it keeps happening, **Open log folder** and
  attach `server.log` and `desktop.log` to a [GitHub issue](https://github.com/carsonmcrae/ttsnative/issues);
  they contain no document text. Reinstalling from the website keeps your data.
- **Another program uses port 8770**: TTSNative picks the next free port (up to 8789); your reading
  settings then start from their defaults for that session.
- **Antivirus or Smart App Control blocks a file**: the app isn't code-signed yet. Allow TTSNative, or run
  it from source instead.
