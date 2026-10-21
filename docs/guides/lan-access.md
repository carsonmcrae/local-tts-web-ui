# Using the app from a phone on your network (optional)

By default the server only listens on `127.0.0.1`, so other devices, including your phone, cannot
reach it. That is deliberate.

## LAN mode (recommended)

Start the built app (`npm run start`, or the packaged app), then open **Settings → Phones and
tablets** and switch on **LAN mode**. The server then also listens on one private address of this
computer (on the same port), and shows that address, a QR code and a one-time pairing code (eight
characters, five minutes). Scan the QR code on the phone, or open the address and enter the code at
`/pair`. Each device pairs once; remove one or all devices from the same section.

- **What a paired device may do:** read and listen, change reading preferences, add documents, style
  sentences and run exports. It may not change LAN, speech API or integration settings, record,
  build, import or delete voices, install engines, import web pages, change the system or delete
  documents (`403 not_allowed_remotely`). An unpaired device gets only the app's pages and the
  pairing endpoints (`401 device_not_paired`, and the app sends it to `/pair`).
- **Off after every restart.** Turning it off stops listening at once; paired devices stay paired
  until removed. Removing a device takes effect on its next request.
- **Development:** under `npm run dev` the LAN address reaches the API server, which serves the UI
  only when started with `--static`; use `npm run start` to try LAN mode.

The server side is in `apps/server/src/ltts/lan/` (what a device may do: `policy.py`) and
`security.py`; the tests are `apps/server/tests/test_lan_mode.py`.

## Network mode (advanced)

The older CLI mode serves the whole app on every address and uses a token instead of pairing, with no
restrictions for devices that have it:

```bash
npm run build
node scripts/uv-run.mjs run --frozen --project apps/server ltts serve --host 0.0.0.0 --allow-network --static apps/web/dist
```

The server prints a one-time link like `http://<this-computer-ip>:8765/?token=…`. Open it on the
phone; the token is stored in an HttpOnly cookie and every other device needs its own link. Stop the
server (Ctrl+C) when you're done.

## What to know

- **Plain HTTP.** Pairing (or the token) stops other people on the network from using your library,
  but traffic is not encrypted. Use only on networks you trust. Nothing is opened on the router (no
  UPnP or port forwarding); never expose the server to the internet.
- **Firewall prompts.** Your OS may ask whether to allow incoming connections for Python; allow it
  for private networks only.
- **No microphone over HTTP.** Browsers only allow recording on `localhost` or HTTPS. On the phone,
  import an existing recording in Voice Studio instead, or use an HTTPS tunnel you control (for
  example Tailscale Serve) that terminates TLS for this computer.
- **No offline copy or installing on phones.** The app's service worker (`apps/web/public/sw.js`) and
  "install as an app" need a secure page, so they work on the computer (`localhost` is one) and not
  over plain HTTP on a LAN address. The service worker caches only the app shell (`index.html`, the
  hashed `/assets/*` files and the icons), never `/api/*` or `/v1/*`. Phones would need HTTPS with a
  certificate they trust, which TTSNative doesn't set up.
