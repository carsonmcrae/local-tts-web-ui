# Using TTSNative from other devices

TTSNative normally only answers on this computer (`127.0.0.1`), so other devices on your network,
including your phone, can't reach it. That's deliberate.

**LAN mode** lets a phone or tablet on the **same Wi-Fi** read and listen too. You turn it on in
**Settings → Phones and tablets** and pair each device once with a short code. You can remove a
device or turn LAN mode off at any time. The computer still does all the reading: the phone is a
screen and a speaker, and nothing works on it while the computer is off or asleep.

## Before you start

LAN mode needs the built app: start TTSNative with `npm run start`, or use the packaged app. Under
`npm run dev` the phone gets an error page. The address it opens reaches TTSNative's server, and in
development the server only serves the app's pages when started with `--static`, as `npm run start`
does. The settings section says so when you're on the development server.

Use LAN mode only on a network you trust, such as your home Wi-Fi. Never use it on public Wi-Fi in a
café, hotel or airport: see [What to know](#what-to-know).

### Only on a network you trust

Before LAN mode turns on, TTSNative checks the network. It only looks; it never changes your
network, firewall or system settings.

- **On Windows**, the network must be one Windows lists as **private** (or a work domain network).
  If Windows lists it as **public**, LAN mode stays off and says how to change it: if it really is
  your home network, open **Settings → Network & internet → Wi-Fi** (or **Ethernet**), open the
  network's properties, and under **Network profile type** choose **Private network**. Leave
  networks in cafés, hotels, airports and offices public. If TTSNative can't tell what Windows calls
  the network, it stays off too.
- **On a Mac or Linux**, which have no such setting, tick **This is a home network I trust** each
  time you turn LAN mode on.

## Turning it on and pairing a device

1. On the computer, open **Settings → Phones and tablets** and expand **LAN mode**.
2. Read what it shares (below), then switch on **Turn on LAN mode** (on a Mac or Linux, tick **This
   is a home network I trust** first). If the computer is on more than one network, first choose the
   **Network address** your phone uses: usually your Wi-Fi, with an address starting with `192.168`.
   See [Which networks are offered](#which-networks-are-offered).
3. The section shows:
   - the address to open, such as `http://192.168.1.20:8765`;
   - a **QR code**;
   - a pairing code like `K7MP-3XQ9`.

   The code works once and expires after five minutes. **New code** shows another one, and **Show
   a new code** appears once it has expired or been used.

4. On the phone, scan the QR code with the camera. Or open the address, go to `/pair`, and enter the
   code (with or without the dash, in any case).
5. Check the **Name for this device** and press **Pair this device**. The name is guessed from the
   browser, such as "iPhone" or "Android phone". The phone then opens your library.

The QR code puts the code after a `#` in the link, so it is never sent to the server as part of the
address. The pairing page removes it from the address bar as soon as it has read it.

Pairing stores a cookie on the phone that the browser's scripts can't read. The computer keeps only
a fingerprint of it.

If a phone that isn't paired (or was removed) opens TTSNative, it's taken to the pairing page, and
back to where it was afterwards. Ten wrong codes cancel the current code. A phone can try at most
five codes a minute.

### When a phone has to pair again

LAN traffic isn't encrypted, so someone else on the Wi-Fi could copy a phone's cookie. To limit what
a copy is worth:

- **The cookie only works from the address the phone paired from.** If the phone's address changes,
  it has to pair again. That can happen after a router restart, or on a phone set to rotate its
  private Wi-Fi address (iPhones do this on open networks).
- **Pairings end after 30 days**, or sooner if the device isn't used for 14 days.

Either way, the phone's pairing page says why and asks for a new code. Pairing again from the same
phone replaces its old entry in the list.

## What a paired device can and can't do

A paired phone or tablet can:

- open your library, read and listen, and use bookmarks;
- change reading and playback settings and pronunciations (these are shared with the computer);
- add and edit documents and style sentences;
- start, pause, resume and download exports.

Sensitive things stay on the computer. A paired device can't:

- change LAN mode, speech API or Audiobookshelf settings;
- record, play back, import, export or manage voices and their recordings;
- install engines, clear caches, or cancel the computer's own jobs;
- import web pages (the computer would fetch them);
- delete documents or exports;
- cancel an export, which throws away what it has made so far (pausing it is fine);
- send an export to Audiobookshelf, which uses the computer's Audiobookshelf account.

The phone shows **Do this on the computer running TTSNative.** if you try. Starting a lot of exports
or uploads in a few minutes from one device is also refused for a while.

## What works over LAN mode

LAN mode uses plain HTTP, not HTTPS. Browsers keep some features for secure (HTTPS) pages, so on a
phone or tablet:

| Feature                                                           | On a phone in LAN mode                      |
| ----------------------------------------------------------------- | ------------------------------------------- |
| Reading, listening, bookmarks, pronunciations, documents, exports | Works, while the computer is on             |
| Recording with the microphone                                     | No: needs HTTPS. Record on the computer     |
| Installing TTSNative as an app                                    | No: needs HTTPS                             |
| Screens that open while the computer can't be reached             | No: needs HTTPS                             |
| Privacy from other devices on the same Wi-Fi                      | No: plain HTTP can be read by other devices |

On the computer itself all of these work, because `localhost` counts as a secure page.

The theme and other appearance settings are saved per device.

## While LAN mode is on

The computer's sidebar shows **LAN mode on** with the network it's open on, and the settings say
that any device on that network can open the address and ask to pair.

**Paired devices** lists each device with:

- the address it paired from;
- when it was last seen;
- when its pairing ends.

If its cookie was used from another address, that is shown too. Either the phone's address changed,
in which case pair it again, or someone copied the cookie, in which case remove the device.

**Remove** (one device) and **Remove all** ask first. A removed device can't connect from its next
request on, and needs a new code to pair again.

## Turning it off

**Turn off LAN mode** (or the switch) stops listening on the network at once, including any
download still in progress.

LAN mode also turns itself off:

- whenever TTSNative restarts;
- when the computer has been asleep;
- when its network address goes away or moves to another adapter;
- on Windows, when the network becomes public, or TTSNative can't tell what Windows calls it.

That way a laptop that wakes up on another network doesn't appear there by itself. The settings say
when this happened. Paired devices stay paired until you remove them or their pairing ends.

## Which networks are offered

Only private addresses on adapters that are connected are offered.

**Hidden:** adapters that only reach virtual machines or containers on this computer, such as:

- WSL;
- Hyper-V's Default Switch;
- Docker;
- VirtualBox and VMware host-only networks.

**Shown, with a label:**

- **Virtual adapter.** A Hyper-V switch can be your real network, and so can this computer's mobile
  hotspot.
- **VPN.** Devices on a VPN may be outside your home. TTSNative never picks a VPN by itself.

Detection goes by the adapter's name, so an unusual VPN may still look like an ordinary network.
Check the name in the list.

## What to know

- **Plain HTTP isn't secure against other devices on your network.** Pairing stops other people on
  the network from simply opening your library, but the traffic isn't encrypted. Someone on the same
  Wi-Fi could read the documents and audio a phone opens, and copy its cookie, though a copy only
  works from that phone's address and only until its pairing ends. Use LAN mode only on networks you
  trust, such as your home Wi-Fi.
- **Nothing is opened on your router.** There's no port forwarding or UPnP, so only devices on your
  own network can reach it. Never expose TTSNative to the internet.
- **No proxies or tunnels.** TTSNative refuses requests that come through a reverse proxy, tunnel
  or port forward on the computer (Tailscale Serve, Caddy, nginx, Cloudflare Tunnel, ngrok), and
  requests that only claim to, so they can't pass for you at the computer. Use LAN mode instead.
- **Firewall prompt.** The first time, your computer's firewall may ask whether to allow TTSNative
  (Python) to accept connections. Allow it for **private** networks only.
- **Voices stay on the computer.** Browsers only allow recording on a secure page, so voices are
  recorded on the computer. LAN mode also keeps voice recordings themselves off the network: a phone
  can use your voices to listen, but not play, import or export their recordings.
- **No installing on the phone.** Browsers only let a site be installed as an app on a secure
  (HTTPS) page, so a phone can't install TTSNative over LAN mode.

  On the computer, TTSNative can be installed from the browser. Its screens then open even while the
  app isn't running, to say that it can't reach it. Reading and listening always need the app
  running, on the computer and on the phone alike.

  HTTPS on a phone would need a certificate the phone trusts, which TTSNative doesn't set up. The
  options are compared in
  [docs/research/lan-https.md](https://github.com/carsonmcrae/ttsnative/blob/main/docs/research/lan-https.md).

- **The speech API isn't included.** The [local speech API](Settings-and-Models#local-speech-api)
  still refuses other devices unless you also allow them in its own settings.

## What you'll see on the phone

The phone uses the same library, voices and playback preferences as your computer, because they're
stored by the server. The layout adapts to small screens:

- a bar at the bottom switches between Library, Voices, Studio, Exports and Settings, though making
  voices and the computer's own settings (LAN mode, the speech API, engines) say to use the
  computer;
- the reader's **Contents** button opens the list of sections.

If the computer goes to sleep or the app stops, a **Reconnecting…** bar appears at the top. It goes
away by itself once TTSNative answers again. After the computer slept, LAN mode has turned itself
off, so turn it on again on the computer first.

Phone layouts and playback were tested with Pixel 7 and iPhone 13 emulation. Real iPhones, and Safari
on Apple hardware, haven't been verified. To try it on your own phone, follow the
[phone checklist](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/lan-phone-checklist.md).

## Advanced: network mode from the command line

The older network mode serves everything on all of the computer's addresses and uses a token instead
of pairing. It has no Settings switch and stays on until you stop the server:

```bash
npm run build
node scripts/uv-run.mjs run --frozen --project apps/server ltts serve --host 0.0.0.0 --allow-network --static apps/web/dist
```

The server prints a link like `http://<this-computer-ip>:8765/?token=…`. Each device opens it once,
and the token is then kept in a cookie.

- A new token is made at every start unless you set `LTTS_ACCESS_TOKEN` (at least 24 characters).
- While it's on, **Settings → Privacy** shows **Network access is on**.
- Stop it with **Ctrl+C**.

Unlike LAN mode, a device with the token can do everything, including changing settings and deleting
documents. Its token doesn't expire and isn't tied to an address, so prefer LAN mode.

The full guide is
[docs/guides/lan-access.md](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/lan-access.md).
See also [Privacy and Security](Privacy-and-Security#network-mode).
