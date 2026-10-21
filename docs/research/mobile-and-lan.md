# Phones and tablets: what works, what doesn't, and why

TTSNative runs on a computer. A phone or tablet on the same Wi-Fi can use it through **LAN mode**
(Settings → Phones and tablets): the computer does the reading, the phone is the screen and speaker.
This note records how that is built, what was investigated for recording on a phone, and whether a
phone could run TTSNative by itself.

## How LAN mode is built

- **Off by default, off after a restart.** Turning it on starts a second listener on one of the
  computer's private addresses (for example `192.168.1.20`), on the same port and the same event loop
  as the main server, which stays on `127.0.0.1`. Turning it off closes that listener at once. Nothing
  is ever bound to `0.0.0.0`, and nothing is opened on the router (no UPnP, no port forwarding).
- **Pairing.** The computer shows a code (eight characters, five minutes, single use) and a QR code for
  `http://<address>:<port>/pair#<code>`. The code travels after `#`, so it never reaches the server's
  logs or the network as part of a URL. A device that pairs gets an HttpOnly, SameSite=Strict cookie;
  the server keeps only a SHA-256 of it. Removing a device (or all of them) takes effect on its next
  request.
- **Checks on every request that arrives on the LAN address:** the Host must be that address (DNS
  rebinding), state-changing requests must carry the page's own `Origin` and the app header (CSRF), and
  the API needs a paired device. A device that isn't paired can only load the app and pair.
- **What stays on the computer.** Paired devices can read, listen, change reading settings, add
  documents, style sentences and run exports. They can't change LAN, speech API or integration
  settings, record or manage voices, install engines, import web pages (that would make the server
  fetch URLs), change the system or delete documents (`lan/policy.py`).
- **Plain HTTP.** Pairing controls who can use the library, but the traffic isn't encrypted. Use LAN
  mode only on networks you trust.

## Recording on a phone

Browsers only give a page the microphone in a **secure context**: `localhost`, or HTTPS with a
certificate the browser trusts. A LAN address over HTTP isn't one, so Voice Studio can't record on a
phone. The options investigated:

| Option                                           | What it needs                                                                                                                     | Status                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| HTTPS with a locally made certificate authority  | Creating a root certificate on the computer and trusting it on every phone (on iOS: installing a profile and enabling full trust) | **Not done.** Installing a root certificate needs the owner's approval    |
| An HTTPS tunnel (for example Tailscale Serve)    | A third-party account and service, and the tunnel's own software                                                                  | Not done: it's the user's choice of service, documented as an alternative |
| Record in another app, then import the recording | Nothing: Voice Studio's **Import a recording** splits a long recording into takes                                                 | Works today                                                               |

## Could a phone run TTSNative by itself?

Not this codebase. The server is Python with ONNX Runtime and, for cloned voices, PyTorch; phones don't
run it. A phone-only reader would be a different program:

- **Built-in voices.** The Kokoro model TTSNative uses is 326 MB (smaller quantised exports exist),
  and its phonemizer, eSpeak NG, is GPL-licensed. On a computer it is installed from PyPI into the
  user's environment and no TTSNative artifact contains it; a phone app would have to bundle it,
  which needs its own licence review (ADR-1). A browser-only build is conceivable (WebAssembly ONNX
  Runtime) but slow on most phones and a separate project.
- **Cloned voices.** Chatterbox Turbo is a 350-million-parameter PyTorch model with gigabytes of
  files, slow even on a computer without a capable GPU; not feasible on a phone.

So the supported way is LAN mode: the computer reads, the phone listens and controls.

## Installing as an app (PWA)

The web app has a manifest and a careful service worker (`apps/web/public/sw.js`). It keeps only the
app shell: `index.html` network first (the cached copy only when the server doesn't answer), the hashed
`/assets/*` files as they are fetched, and the icons. It never handles `/api/*` or `/v1/*` (documents,
audio, exports, settings), other methods than GET, range requests or other origins, and a new version
deletes the old caches. With no cached shell, a failed navigation shows a small offline page.

Browsers only allow service workers and "install as app" in a secure context, so the worker is
registered only in production builds on a secure page: on the computer (`localhost`), and on a phone
only over HTTPS, which TTSNative doesn't set up for the reason above. Phones still get the in-app
**Reconnecting…** bar when the computer stops answering, and pairing again when a device is removed.
