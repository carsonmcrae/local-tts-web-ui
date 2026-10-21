# Privacy and security

TTSNative is built to keep your documents and your voice on your own computer.

## What stays on your computer

Everything you put into the app or make with it:

- the text extracted from your documents (the uploaded file itself isn't kept);
- voice recordings for custom voices, which are biometric data;
- generated speech, exports, your reading progress, bookmarks and notes, pronunciations and
  preferences.

All of it lives in the `data/` folder (see [Installation](Installation#where-things-are-stored)).
There are no accounts, analytics or telemetry, and documents and recordings never leave the machine.
By design, the server logs identifiers only, never document text, recordings or original file names.

## What is downloaded, and from where

Downloads only happen when you install or update the app (`npm install` and the first `npm run dev`
afterwards) and when you install an optional engine. After that, the app works fully offline. The
[Windows app](Windows-App) also checks GitHub for new official versions (Settings → About can turn this
off); the check is an ordinary download of a small public file and carries no information about you.

| What                                    | When                                          | From                                                               | Checked by                                                      |
| --------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| uv (Python manager)                     | First run, unless uv 0.9.0+ is on your `PATH` | uv's GitHub releases                                               | Pinned size and SHA-256                                         |
| Python 3.12 and server packages         | First run, and after updates                  | Via uv, from `github.com`, `pypi.org` and `files.pythonhosted.org` | Exact versions from the committed lockfile                      |
| Kokoro model (about 340 MB)             | First run, or from Settings                   | The kokoro-onnx release on GitHub                                  | Pinned URL, exact size and SHA-256                              |
| Chatterbox Turbo weights (about 3 GB)   | Only if you install voice cloning             | Resemble AI's repository on Hugging Face, at a pinned revision     | Pinned URL, exact size and SHA-256                              |
| Chatterbox runtime (PyTorch and others) | Only if you install voice cloning             | PyTorch from `download.pytorch.org`, other packages from PyPI      | Exact versions from the worker's lockfile                       |
| npm packages                            | `npm install`                                 | The npm registry                                                   | Exact versions in `package-lock.json`; install scripts disabled |
| Update check (Windows app only)         | At most twice a day; can be turned off        | `latest.json` of the latest GitHub Release                         | Sends nothing about you or your documents                       |
| Updates (Windows app only)              | When you choose Install and restart           | The installer attached to that GitHub Release                      | Signature checked against the key built into the app            |

Model files are only fetched over HTTPS from approved hosts (GitHub and Hugging Face), checked again on
every redirect, and installed only after their size and SHA-256 match. If a host isn't approved or a
checksum doesn't match, the download is refused and nothing is installed. Nothing downloaded is
executed as a script.

The Chatterbox engine runs with Hugging Face's offline mode switched on, so it can't fetch anything
else. Model formats were chosen so that loading a model can't run code (ONNX and safetensors; the one
PyTorch file is loaded with `weights_only=True`).

Details:
[model provenance](https://github.com/carsonmcrae/ttsnative/blob/main/docs/security/model-provenance.md)
and [supply chain](https://github.com/carsonmcrae/ttsnative/blob/main/docs/security/supply-chain.md).

## How the app protects you

- **Local only.** The server binds to `127.0.0.1`. Phones and tablets can only reach it while LAN
  mode is on, and can only use your library after pairing with a code from this computer; the older
  network mode needs an explicit `--allow-network` flag and an access token.
- **Other websites can't use it.** Requests from other sites, requests with an unexpected `Host`
  header, and state-changing requests without the app's own header are rejected. Responses carry a
  strict Content Security Policy.
- **Untrusted documents are handled carefully.** Files are size-limited and checked against their real
  type, then parsed in a separate process with a time limit. ZIP-based formats (DOCX and EPUB) are
  checked for archive bombs, encryption and unsafe names; XML entity declarations are refused; DOCX
  macros and EPUB scripts are never read.
- **No AI language model in the pipeline.** Document text is only read aloud, never interpreted, so
  instructions hidden in a document can't make the app do anything.
- **Voice consent.** Custom voices need an explicit consent statement, Chatterbox output carries an
  inaudible watermark, and deleting a voice removes its recording and cached audio.

## Network mode

[LAN mode](Other-Devices) is off unless you switch it on in **Settings → Phones and tablets**, and off
again after every restart. On Windows it only opens on a network Windows lists as private; on a Mac
or Linux you confirm each time that it's a home network you trust. Paired devices can read and
listen, but can't change LAN, speech API or Audiobookshelf settings, record or manage voices,
install engines, delete documents or exports, cancel exports or send them to Audiobookshelf.
Requests through a proxy or tunnel are refused. The older network mode is off unless you start the
server with `--allow-network`. When either is on:

- traffic uses plain HTTP, which isn't secure against other devices on your network: pairing (or the
  token) protects access to your library, but not the privacy of the traffic;
- browsers block the microphone on non-HTTPS pages;
- use it only on networks you trust, and never expose the server to the internet.

## Known limitations

- Only Linux puts a memory limit on the document-parsing process. The time and size limits apply
  everywhere.
- The optional Chatterbox environment has known lower-severity advisories in `torch` and `setuptools`.
  The default Kokoro reader doesn't install them.
- Some runtime dependencies are GPL-licensed (espeak-ng and phonemizer).

The [threat model](https://github.com/carsonmcrae/ttsnative/blob/main/docs/security/threat-model.md)
covers these in full.

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/carsonmcrae/ttsnative/security/advisories/new).
Don't open a public issue. Include steps to reproduce and the affected version (**Settings → About**).
You can expect an acknowledgement within a week.

| Version                | Supported |
| ---------------------- | --------- |
| 2.x                    | Yes       |
| 1.x (Gradio prototype) | No        |

See [SECURITY.md](https://github.com/carsonmcrae/ttsnative/blob/main/SECURITY.md).
