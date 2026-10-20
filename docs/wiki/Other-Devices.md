# Using TTSNative from other devices

By default, the server only listens on `127.0.0.1`, so other devices on your network, including your
phone, can't reach it. That's deliberate.

You can opt in to network mode to try the app on a phone or tablet on the **same trusted Wi-Fi
network**. Read the warnings below first.

## Turning on network mode

From the project folder, build the web app and start the server with network access allowed:

```bash
npm run build
node scripts/uv-run.mjs run --frozen --project apps/server ltts serve --host 0.0.0.0 --allow-network --static apps/web/dist
```

The server prints a one-time link like this:

```text
http://<this-computer-ip>:8765/?token=…
```

Replace `<this-computer-ip>` with your computer's address on the local network and open the link on
your phone. The token is then stored in an HttpOnly cookie, so you don't need the link again on that
device. Every other device needs to open the link once too.

A new token is generated each time you start the server this way (unless you set the
`LTTS_ACCESS_TOKEN` environment variable to a token of at least 24 characters), so devices need the
new link after a restart.

While network mode is on, **Settings → Privacy** shows **Network access is on**. To turn it off, stop
the server with **Ctrl+C** and start the app normally with `npm run dev`. Stop the server when you've
finished.

## What to know before you start

- **Plain HTTP.** The token stops other people on the network from using your library, but the
  traffic isn't encrypted. Use network mode only on networks you trust.
- **No microphone over HTTP.** Browsers only allow recording on `localhost` or HTTPS. On the phone,
  import an existing recording in Voice Studio instead, or use an HTTPS tunnel you control (for
  example Tailscale Serve) that terminates TLS for this computer.
- **Firewall prompts.** Your operating system may ask whether to allow incoming connections for
  Python. Allow it for private networks only.
- **Never expose the server to the internet.**

## What you'll see on the phone

The phone uses the same library, voices and playback preferences as your computer, because they're
stored by the server. The theme is saved per device. The layout adapts to small screens: a bar at the
bottom switches between Library, Voices, Studio and Settings, and the reader's **Contents** button
opens the list of sections.

Phone layouts and playback were tested with Pixel 7 and iPhone 13 emulation. Real iPhones, and Safari
on Apple hardware, haven't been verified.

The full guide is
[docs/guides/lan-access.md](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/lan-access.md).
See also [Privacy and Security](Privacy-and-Security#network-mode).
