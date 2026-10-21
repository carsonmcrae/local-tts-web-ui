# Using the app from a phone on your network (optional)

By default the server only listens on `127.0.0.1`, so other devices, including your phone, cannot
reach it. That is deliberate.

## LAN mode (recommended)

Start the built app (`npm run start`, or the packaged app), then open **Settings → Phones and
tablets** and switch on **LAN mode**. The server then also listens on one private address of this
computer, on the same port. It shows that address, a QR code and a one-time pairing code (eight
characters, five minutes). Scan the QR code on the phone, or open the address and enter the code at
`/pair`. Each device pairs once; remove one or all devices from the same section.

Use it only on a network you trust. The traffic is plain HTTP, which isn't secure against other
devices on the same network (see [What to know](#what-to-know)). To try it on real phones, follow
the [phone checklist](lan-phone-checklist.md).

### Which networks it opens on

Before LAN mode turns on, TTSNative checks that the chosen network is one you trust
(`lan/trust.py`). It only ever reads; it never changes network, firewall or system settings.

- **Windows.** It reads the category Windows gives the chosen adapter's network, with one read-only
  command run under an 8-second limit and matched to the adapter by name:
  `Get-NetConnectionProfile | Select-Object InterfaceAlias,InterfaceIndex,NetworkCategory,IPv4Connectivity | ConvertTo-Json`.
  - **Private** or **DomainAuthenticated**: LAN mode turns on, and the settings say what Windows
    calls the network.
  - **Public**: refused (`409 lan_public_network`). If it really is your home network, make it
    private in Windows: **Settings → Network & internet → Wi-Fi** (or **Ethernet**), open the
    network's properties, and under **Network profile type** choose **Private network**. Leave
    networks in cafés, hotels, airports and offices public.
  - **Can't tell**: refused too (`409 lan_network_unknown`). That covers PowerShell missing or
    failing, a timeout, output that doesn't parse, and an adapter Windows lists no network for (such
    as this computer's own mobile hotspot, and some VPNs).

  While LAN mode is on, the category is read again every minute. LAN mode turns itself off if the
  network becomes public, or if the category can't be read twice in a row.

- **macOS and Linux** have no such category. The settings show **This is a home network I trust**,
  which must be ticked every time LAN mode is turned on (`trustedNetwork: true` in `PUT /api/lan`;
  without it, `409 lan_confirm_network`).

### What a paired device may do

A paired device may:

- read and listen, and use bookmarks;
- change reading preferences and pronunciations;
- add and edit documents (details, covers, section titles and starts, cleanup, which can be undone)
  and style sentences;
- start, pause, resume and download exports.

`lan/policy.py` is an allow-list: a new API route stays on the computer until it is listed there
(and in `REACHABLE` in `test_lan_security.py`).

Sensitive operations stay on the computer. A paired device may not (`403 not_allowed_remotely`):

- change LAN, speech API or integration settings;
- record, build, import, export, rename, play back or delete voices and their recordings, or change
  their delivery, expression or fine-tune (the Voice Studio page on a phone only lists voices to
  choose for reading);
- install engines, cancel the computer's jobs or clear caches;
- import web pages (the server would fetch them);
- delete documents;
- delete exports (their files took minutes or hours to make);
- cancel an export (that throws away the sentences it saved; pausing it is allowed);
- send an export to Audiobookshelf (that uses this computer's Audiobookshelf account and sends the
  files to another server).

Starting or resuming more than 20 exports or uploads in 10 minutes from one device is refused
(`429 lan_busy`). `GET /api/system` doesn't tell a device where the data folder is.

An unpaired device gets only:

- the app's pages;
- the pairing endpoints, with request bodies of at most 4 KB.

Anything else answers `401 device_not_paired`, and the app sends the device to `/pair`.

### What works over plain HTTP

| On a phone or tablet in LAN mode                                         | Over plain HTTP | Why                                                                                          |
| ------------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------- |
| Reading, listening, bookmarks, pronunciations, adding documents, exports | Works           | The computer does the work; the phone is a screen and a speaker                              |
| Recording with the microphone                                            | Needs HTTPS     | Browsers only give the microphone to secure pages (`localhost` is one; a LAN address isn't)  |
| Installing TTSNative as an app                                           | Needs HTTPS     | Installing needs a secure page and a service worker                                          |
| Screens that open while the computer can't be reached (offline screens)  | Needs HTTPS     | The service worker only registers on a secure page                                           |
| Privacy from other devices on the same network                           | No              | Plain HTTP isn't encrypted: anyone on the Wi-Fi can read what a device opens, and its cookie |

On the computer itself, `localhost` is a secure page, so recording, installing and the offline
screens work there. HTTPS for phones would need a certificate they trust; the design is in
[docs/research/lan-https.md](../research/lan-https.md#7-design-secure-lan-mode-with-a-local-ca).

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
- Requests that say a proxy passed them on are refused (see [Proxies](#proxies-tunnels-and-port-forwards-are-not-supported)).
- At most 32 requests run at once, so other devices can't take every worker thread from the
  computer's own window.

### Turning off

LAN mode is off after every restart. Turning it off stops listening and drops open connections at
once. It also turns itself off, and says so, when:

- its address leaves the computer, or moves to another adapter;
- the computer has slept, since a laptop may wake on another network that hands out the same
  address;
- on Windows, the network becomes public, or its category can't be read twice in a row.

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

The server side is in `apps/server/src/ltts/lan/` (what a device may do: `policy.py`; the network
check: `trust.py`) and `security.py`. The tests are `apps/server/tests/test_lan_mode.py`,
`test_lan_security.py`, `test_lan_network_trust.py` and `test_proxy_requests.py`.

## Proxies, tunnels and port forwards are not supported

A reverse proxy or tunnel on this computer (Tailscale Serve, Caddy, nginx, Cloudflare Tunnel, ngrok)
passes other devices' requests on to `127.0.0.1`. To the server they come from this computer, so
they could pass for the person at it, skipping pairing and `lan/policy.py`. The server fails closed
instead (`security.py`):

- **Forwarding headers are refused**, on the main address and the LAN listener, for the app, the
  API and the speech API (`403 proxy_not_supported`). That covers `Forwarded`, `X-Forwarded-*`,
  `Via`, `X-Real-IP`, `X-Client-IP`, `True-Client-IP` and the like, plus Tailscale's and
  Cloudflare's own headers, in any letter case. They are never read for an address or an identity.
- **This computer's own user** is a request from a loopback address (`127.0.0.0/8`, `::1`, or IPv4
  mapped into IPv6) whose `Host` is exactly `localhost`, `127.0.0.1` or `[::1]`, with any port, in
  any letter case. From a loopback address any other name is refused (`403 proxy_not_supported`):
  a proxy's name, `localhost.` with a trailing dot, `127.0.0.2`, `[0:0:0:0:0:0:0:1]` and so on.
  That holds even for names in `extra_allowed_hosts`.
- **Changes from a browser** on the main address also need an `Origin` on one of those names (any
  port, so `npm run dev`'s page works). A page reached through a proxy carries the proxy's name.
- A malformed, missing or repeated `Host` is refused (`421 invalid_host`).

`extra_allowed_hosts` now only matters in [network mode](#network-mode-advanced): the names other
devices use to reach this computer, such as `mybox.local`. Requests with those names always need
the access token.

There is no "trusted proxy" setting. Behind a proxy every device has the proxy's address, so a
device cookie couldn't be tied to its device; the proxy ends HTTPS under another origin; and LAN
mode's lifecycle (off after a restart, on a network you chose, off when it changes) doesn't apply
to a tunnel. Supporting one, such as Tailscale Serve, would need its own design and the owner's
approval ([lan-https.md](../research/lan-https.md#3-tailscale-serve-and-headscale)).

**What can't be detected:** a proxy set up to hide itself (adding no forwarding headers and
rewriting `Host` to `127.0.0.1`), and TCP port forwards (`netsh interface portproxy`, `ssh -L` or
`-R`, `socat`), look exactly like a program on this computer. Changes from a browser through them
are still refused by the `Origin` rule, but reads aren't. Don't run them in front of TTSNative.

## Network mode (advanced)

The older CLI mode serves the whole app on every address and uses a token instead of pairing. Devices
that have the token have no restrictions:

```bash
npm run build
node scripts/uv-run.mjs run --frozen --project apps/server ltts serve --host 0.0.0.0 --allow-network --static apps/web/dist
```

The server prints a one-time link like `http://<this-computer-ip>:8765/?token=…`. Open it on the
phone. The token is stored in an HttpOnly cookie, and every other device needs its own link. The
token doesn't expire and isn't tied to an address. Network mode doesn't check the network's
category either. Stop the server (Ctrl+C) when you're done.

## What to know

- **Plain HTTP isn't secure against other devices on your network.** Pairing (or the token) stops
  other people on the network from simply opening your library, but traffic is not encrypted.
  Anyone on the same Wi-Fi can read documents, audio and cookies as they pass, and someone who can
  also take over a phone's address can use its pairing. Use it only on networks you trust, never on
  public Wi-Fi.
- **Nothing is opened on the router.** There is no UPnP or port forwarding; never expose the server
  to the internet.
- **No proxies or tunnels.** They are refused; see [above](#proxies-tunnels-and-port-forwards-are-not-supported).
- **Firewall prompts.** Your OS may ask whether to allow incoming connections for Python. Allow them
  for private networks only.
- **No microphone over HTTP.** Browsers only allow recording on `localhost` or HTTPS, so record
  voices on the computer. LAN mode doesn't let phones import, play or export voice recordings either.
- **No installing on phones, and no offline screens there.** The service worker
  (`apps/web/public/sw.js`) and "install as an app" need a secure page. So they work on the computer
  (`localhost` is one), and not over plain HTTP on a LAN address. The Windows app never registers
  one: it loads the page from its bundled server, and updates replace the files.

  The service worker keeps only the app shell: `index.html`, the hashed `/assets/*` files and the
  icons. It never keeps `/api/*` or `/v1/*`. So it lets the screens open, and say the server isn't
  reachable, while the server is stopped. It never makes reading or speech work without the server.

  Phones would need HTTPS with a certificate they trust. The options, and a design for the
  recommended one, are in [docs/research/lan-https.md](../research/lan-https.md).
