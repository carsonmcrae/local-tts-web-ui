# Using the app from a phone on your network (optional)

By default the server only listens on `127.0.0.1`, so other devices, including your phone, cannot
reach it. That is deliberate.

## LAN mode (recommended)

Start the built app (`npm run start`, or the packaged app), then open **Settings → Phones and
tablets** and switch on **LAN mode**. The server then also listens on one private address of this
computer, on the same port. It shows that address, a QR code and a one-time pairing code (eight
characters, five minutes). Scan the QR code on the phone, or open the address and enter the code at
`/pair`. Each device pairs once; remove one or all devices from the same section.

Use it only on a network you trust. The traffic is plain HTTP (see [What to know](#what-to-know)).

### What a paired device may do

A paired device may:

- read and listen;
- change reading preferences and pronunciations;
- add and edit documents and style sentences;
- run, download and send exports.

`lan/policy.py` is an allow-list: a new API route stays on the computer until it is listed there
(and in `REACHABLE` in `test_lan_security.py`).

A paired device may not (`403 not_allowed_remotely`):

- change LAN, speech API or integration settings;
- record, build, import, export, play back or delete voices and their recordings;
- install engines;
- cancel the computer's jobs;
- clear caches;
- import web pages;
- delete documents.

Starting more than 20 exports or uploads in 10 minutes from one device is refused (`429 lan_busy`).
`GET /api/system` doesn't tell a device where the data folder is.

An unpaired device gets only:

- the app's pages;
- the pairing endpoints, with request bodies of at most 4 KB.

Anything else answers `401 device_not_paired`, and the app sends the device to `/pair`.

### Device cookies

Pairing sets an HttpOnly, SameSite=Strict cookie. The server keeps only its SHA-256. Because
anyone on the network can read plain HTTP, a copied cookie must be worth little:

- It works only from the address the device paired from.
- It works for 30 days at most, and stops sooner after 14 days unused (`device_not_paired`, with the
  reason on `GET /api/lan/device`).
- A refused use from another address is shown on the computer.
- Pairing again from the same device replaces its old entry.

### Checks on the LAN listener

- The `Host` must be the LAN address.
- API calls marked `Sec-Fetch-Site: same-site` (another port on the same address) are refused.
- Changes need the page's own `Origin` and the app header.
- At most 32 requests run at once, so other devices can't take every worker thread from the
  computer's own window.

### Turning off

LAN mode is off after every restart. Turning it off stops listening and drops open connections at
once. It also turns itself off, and says so, when:

- its address leaves the computer, or moves to another adapter;
- the computer has slept, since a laptop may wake on another network that hands out the same
  address.

Removing a device takes effect on its next request.

### Addresses

Only private IPv4 addresses on adapters that are up are offered.

- Adapters that only reach virtual machines or containers are hidden: WSL, Hyper-V's Default
  Switch, Docker, VirtualBox and VMware host-only, and libvirt.
- Other virtual adapters, such as a Hyper-V external switch or the mobile hotspot, are labelled.
- VPNs are labelled and never chosen automatically.

Detection is by adapter name (`lan/network.py`), so it is a best effort.

### Development

Under `npm run dev` the LAN address reaches the API server, which serves the UI only when started
with `--static`. Use `npm run start` to try LAN mode.

The server side is in `apps/server/src/ltts/lan/` (what a device may do: `policy.py`) and
`security.py`. The tests are `apps/server/tests/test_lan_mode.py` and `test_lan_security.py`.

## Network mode (advanced)

The older CLI mode serves the whole app on every address and uses a token instead of pairing. Devices
that have the token have no restrictions:

```bash
npm run build
node scripts/uv-run.mjs run --frozen --project apps/server ltts serve --host 0.0.0.0 --allow-network --static apps/web/dist
```

The server prints a one-time link like `http://<this-computer-ip>:8765/?token=…`. Open it on the
phone. The token is stored in an HttpOnly cookie, and every other device needs its own link. The
token doesn't expire and isn't tied to an address. Stop the server (Ctrl+C) when you're done.

## What to know

- **Plain HTTP.** Pairing (or the token) stops other people on the network from using your library,
  but traffic is not encrypted. Anyone on the same Wi-Fi can read documents, audio and cookies as
  they pass. Use it only on networks you trust, never on public Wi-Fi.
- **Nothing is opened on the router.** There is no UPnP or port forwarding; never expose the server
  to the internet.
- **Don't put a proxy or tunnel in front of it.** Don't add a reverse proxy's or a tunnel's name
  (for example a Tailscale Serve `*.ts.net` name) to `extra_allowed_hosts`. Requests through it
  arrive from `127.0.0.1` and would be treated as the person at the computer, skipping pairing. See
  [the HTTPS research](../research/lan-https.md#3-tailscale-serve-and-headscale).
- **Firewall prompts.** Your OS may ask whether to allow incoming connections for Python. Allow them
  for private networks only.
- **No microphone over HTTP.** Browsers only allow recording on `localhost` or HTTPS, so record
  voices on the computer. LAN mode doesn't let phones import, play or export voice recordings either.
- **No installing on phones.** The service worker (`apps/web/public/sw.js`) and "install as an app"
  need a secure page. So they work on the computer (`localhost` is one), and not over plain HTTP on a
  LAN address.

  The service worker keeps only the app shell: `index.html`, the hashed `/assets/*` files and the
  icons. It never keeps `/api/*` or `/v1/*`. So it lets the screens open, and say the server isn't
  reachable, while the server is stopped. It never makes reading or speech work without the server.

  Phones would need HTTPS with a certificate they trust. The options are compared in
  [docs/research/lan-https.md](../research/lan-https.md).
