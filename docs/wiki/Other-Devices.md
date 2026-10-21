# Using TTSNative from other devices

TTSNative normally only answers on this computer (`127.0.0.1`), so other devices on your network,
including your phone, can't reach it. That's deliberate.

**LAN mode** lets a phone or tablet on the **same Wi-Fi** read and listen too. You turn it on in
**Settings → Phones and tablets**, pair each device once with a short code, and can remove a device
or turn LAN mode off at any time.

## Before you start

LAN mode needs the built app: start TTSNative with `npm run start` (or use the packaged app). Under
`npm run dev`, the address a phone opens reaches TTSNative's server, which doesn't serve the app's
pages in development (it only does when started with `--static`, as `npm run start` does), so the
phone gets an error page. The settings section says so when you're on the development server.

## Turning it on and pairing a device

1. On the computer, open **Settings → Phones and tablets** and expand **LAN mode**.
2. Read what it shares (below), then switch on **Turn on LAN mode**. If the computer is on more than
   one network, first choose the **Network address** your phone uses (often the one starting with
   `192.168`).
3. The section shows the address to open, such as `http://192.168.1.20:8765`, a **QR code**, and a
   pairing code like `K7MP-3XQ9`. The code works once and expires after five minutes; **New code**
   shows another one, and **Show a new code** appears when it has expired or was used.
4. On the phone, scan the QR code with the camera, or open the address and go to `/pair`, then
   enter the code (with or without the dash, in any case).
5. Check the **Name for this device** (it's guessed from the browser, such as "iPhone" or "Android
   phone") and press **Pair this device**. The phone opens your library.

The QR code puts the code after a `#` in the link, so it is never sent to the server as part of the
address; the pairing page removes it from the address bar as soon as it has read it. Pairing stores
a cookie on the phone that the browser's scripts can't read; the computer keeps only a fingerprint
of it.

If a phone that isn't paired (or was removed) opens TTSNative, it's taken to the pairing page, and
back to where it was afterwards. Ten wrong codes cancel the current code, and a phone can try at most
five codes a minute.

## What a paired device can and can't do

A paired phone or tablet can:

- open your library, read and listen, and use bookmarks;
- change reading and playback settings (these are shared with the computer);
- add documents and run exports.

It can't change LAN mode, speech API or Audiobookshelf settings, record or manage voices, install
engines, import web pages (the computer would fetch them) or delete documents. Those stay on the
computer, and the phone shows **Do this on the computer running TTSNative.** if you try.

The theme and other appearance settings are saved per device.

## Removing devices and turning it off

**Paired devices** lists each device with when it was paired and last seen. **Remove** (one device)
and **Remove all** ask first; a removed device can't connect from its next request on, and needs a
new code to pair again.

**Turn off LAN mode** (or the switch) stops listening on the network at once. LAN mode also turns
itself off whenever TTSNative restarts; paired devices stay paired until you remove them.

## What to know

- **Plain HTTP.** Pairing stops other people on the network from using your library, but the
  traffic isn't encrypted. Use LAN mode only on networks you trust, such as your home Wi-Fi.
- **Nothing is opened on your router.** There's no port forwarding or UPnP, so only devices on your
  own network can reach it. Never expose TTSNative to the internet.
- **Firewall prompt.** The first time, your computer's firewall may ask whether to allow TTSNative
  (Python) to accept connections. Allow it for **private** networks only.
- **No microphone over HTTP.** Browsers only allow recording on a secure page, so record voices on
  the computer. On a phone you can import an existing recording in Voice Studio instead.
- **No installing on the phone.** Browsers only let a site work offline or be installed as an app on
  a secure (HTTPS) page. On the computer TTSNative can be installed from the browser, and if the app
  isn't running it shows that it can't reach it instead of a browser error page. On a phone over
  LAN mode it can't: that would need HTTPS with a certificate the phone trusts, which TTSNative
  doesn't set up.
- **The speech API isn't included.** The [local speech API](Settings-and-Models#local-speech-api)
  still refuses other devices unless you also allow them in its own settings.

## What you'll see on the phone

The phone uses the same library, voices and playback preferences as your computer, because they're
stored by the server. The layout adapts to small screens: a bar at the bottom switches between
Library, Voices, Studio, Exports and Settings, and the reader's **Contents** button opens the list of
sections. If the computer goes to sleep or the app stops, a **Reconnecting…** bar appears at the top
and goes away by itself once TTSNative answers again.

Phone layouts and playback were tested with Pixel 7 and iPhone 13 emulation. Real iPhones, and Safari
on Apple hardware, haven't been verified.

## Advanced: network mode from the command line

The older network mode serves everything on all of the computer's addresses and uses a token instead
of pairing. It has no Settings switch and stays on until you stop the server:

```bash
npm run build
node scripts/uv-run.mjs run --frozen --project apps/server ltts serve --host 0.0.0.0 --allow-network --static apps/web/dist
```

The server prints a link like `http://<this-computer-ip>:8765/?token=…`; each device opens it once
(the token is then kept in a cookie). A new token is made at every start unless you set
`LTTS_ACCESS_TOKEN` (at least 24 characters). While it's on, **Settings → Privacy** shows **Network
access is on**. Stop it with **Ctrl+C**. Unlike LAN mode, a device with the token can do everything,
including changing settings and deleting documents, so prefer LAN mode.

The full guide is
[docs/guides/lan-access.md](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/lan-access.md).
See also [Privacy and Security](Privacy-and-Security#network-mode).
