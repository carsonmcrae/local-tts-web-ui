# Phones and tablets: what works, what doesn't, and why

TTSNative runs on a computer. A phone or tablet on the same Wi-Fi can use it through **LAN mode**
(Settings → Phones and tablets): the computer does the reading, the phone is the screen and speaker.
This note covers:

- how LAN mode is built, and hardened against other devices on the network;
- what was investigated for recording on a phone;
- whether a phone could run TTSNative by itself.

HTTPS options are compared separately in [lan-https.md](lan-https.md).

## How LAN mode is built

### Off by default, off after a restart

Turning it on starts a second listener on one of the computer's private addresses (for example
`192.168.1.20`). It uses the same port and the same event loop as the main server, which stays on
`127.0.0.1`. Nothing is ever bound to `0.0.0.0`, and nothing is opened on the router (no UPnP, no port
forwarding).

Turning it off closes that listener and drops open connections at once. It also turns itself off
when:

- its address leaves the computer, or moves to another adapter;
- the computer has slept: a laptop may wake on another network that hands out the same address.

### Addresses

Only private IPv4 addresses on adapters that are up are offered (`lan/network.py`).

- Adapters that only reach virtual machines or containers are hidden: WSL, Hyper-V's Default
  Switch, Docker, VirtualBox and VMware host-only.
- Hyper-V switches and the mobile hotspot can be the real network, so they are kept with a label.
- VPNs are labelled and never chosen automatically.

### Pairing

The computer shows a code (eight characters, five minutes, single use) and a QR code for
`http://<address>:<port>/pair#<code>`. The code travels after `#`, so it never reaches the server's
logs or the network as part of a URL. It crosses the network only once, in the pairing request
itself, which uses it up.

A device that pairs gets an HttpOnly, SameSite=Strict cookie, and the server keeps only a SHA-256 of
it. The cookie:

- works only from the address the device paired from;
- works for 30 days at most, or until 14 days unused.

A refused use from another address is shown on the computer. Pairing again from the same device
replaces its old entry. Removing a device (or all of them) takes effect on its next request.

### Checks on every request that arrives on the LAN address

- The Host must be that address (DNS rebinding).
- API calls from another port on the same address are refused (`Sec-Fetch-Site: same-site`).
- State-changing requests must carry the page's own `Origin` and the app header (CSRF).
- The API needs a paired device.
- A device that isn't paired can only load the app and pair, with bodies of at most 4 KB.
- At most 32 requests run at once.
- Starting costly work (exports, uploads) is limited per device.

### What stays on the computer

`lan/policy.py` is an allow-list. Paired devices can read, listen, change reading settings, add and
edit documents, style sentences and run exports. Anything not listed stays on the computer:

- LAN, speech API and integration settings;
- recording, managing, exporting or playing back voices and their recordings;
- engine installs, cache clearing and job cancelling;
- importing web pages (that would make the server fetch URLs);
- deleting documents.

### Plain HTTP

Pairing controls who can use the library, but the traffic isn't encrypted. Use LAN mode only on
networks you trust.

## Recording on a phone

Browsers only give a page the microphone in a **secure context**: `localhost`, or HTTPS with a
certificate the browser trusts. A LAN address over HTTP isn't one, so Voice Studio can't record on a
phone. LAN mode also keeps voice recordings off the network: a phone can't import, play or export
them. The options investigated:

| Option                                                          | What it needs                                                                                                                     | Status                                                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPS with a locally made certificate authority                 | Creating a root certificate on the computer and trusting it on every phone (on iOS: installing a profile and enabling full trust) | **Not done.** Recommended as an opt-in in [lan-https.md](lan-https.md); needs the owner's approval                                              |
| An HTTPS tunnel (for example Tailscale Serve)                   | A third-party account and service, and the tunnel's own software                                                                  | Not done. TTSNative would first have to treat proxied requests as remote devices ([lan-https.md](lan-https.md#3-tailscale-serve-and-headscale)) |
| Record in another app, copy it to the computer, import it there | Nothing: Voice Studio's **Import a recording** on the computer splits a long recording into takes                                 | Works today, on the computer                                                                                                                    |

## Could a phone run TTSNative by itself?

Not this codebase. The server is Python with ONNX Runtime and, for cloned voices, PyTorch, and phones
don't run it. A phone-only reader would be a different program:

- **Built-in voices.** The Kokoro model TTSNative uses is 326 MB (smaller quantised exports exist).
  Its phonemizer, eSpeak NG, is GPL-licensed. On a computer it is installed from PyPI into the user's
  environment, and no TTSNative artifact contains it. A phone app would have to bundle it, which
  needs its own licence review (ADR-1). A browser-only build is conceivable (WebAssembly ONNX
  Runtime), but slow on most phones and a separate project.
- **Cloned voices.** Chatterbox Turbo is a 350-million-parameter PyTorch model with gigabytes of
  files. It is slow even on a computer without a capable GPU, and not feasible on a phone.

So the supported way is LAN mode: the computer reads, the phone listens and controls.

## Installing as an app (PWA)

The web app has a manifest and a careful service worker (`apps/web/public/sw.js`). It keeps only the
app shell:

- `index.html`, network first (the cached copy only when the server doesn't answer);
- the hashed `/assets/*` files, as they are fetched;
- the icons.

It never handles `/api/*` or `/v1/*` (documents, audio, exports, settings), methods other than GET,
range requests or other origins. A new version deletes the old caches. With no cached shell, a
failed navigation shows a small page saying TTSNative isn't reachable.

**This is not offline use.** The cached shell lets the app's screens open while the server is
unreachable, so they can say so instead of showing a browser error page. Nothing can be read,
listened to or exported until the server answers again, because speech is always made by the
server.

Browsers only allow service workers and "install as app" in a secure context. So the worker is
registered only in production builds on a secure page: on the computer (`localhost`). On a phone it
would only work over HTTPS, which TTSNative doesn't set up ([lan-https.md](lan-https.md)). Phones
still get:

- the in-app **Reconnecting…** bar when the computer stops answering;
- pairing again when a device is removed, its pairing ends or its address changes.
