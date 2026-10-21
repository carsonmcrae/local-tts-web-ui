<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Carson McRae
Purpose: A short checklist for trying LAN mode on a real phone or tablet, with the expected result of each step.
Scope: Pairing by QR code and by typed code, reading and playback, what the phone is refused, removing
  a device, LAN mode after a restart, a network change and sleep, the public-network refusal, the
  plain-HTTP limits and the proxy refusal.
Does NOT belong: How LAN mode works (lan-access.md), the user guide (docs/wiki/Other-Devices.md) or the
  automated tests (apps/server/tests/test_lan_*.py, test_proxy_requests.py).
-->

# LAN mode on a real phone: test checklist

Run this on your own home network with the built app (`npm run start`). Write down the phone, its
OS version and browser, and pass or fail for each step. Where the phone shows something different
from **Expected**, note what it showed.

You need: the computer on your home Wi-Fi, one iPhone or Android phone on the same Wi-Fi (Safari on
iPhone, Chrome on Android), and five minutes of waiting for step 3.4.

## Before you start: find the right network adapter

LAN mode only turns on for a network Windows lists as **Private**. Before you change any network's
profile, make sure it is the right one. Don't change a virtual adapter, a VPN, a network your
workplace manages, or any Wi-Fi you don't own.

1. In TTSNative, open **Settings → Phones and tablets**. Note the address it offers (for example
   `192.168.1.20`) and, when there is a choice, the adapter name next to it (for example "Wi-Fi" or
   "Ethernet"). Adapters it marks as virtual or VPN are not the ones to change: pick another
   address in TTSNative instead.
2. In PowerShell, list what Windows thinks of each connected network (read-only):

   ```powershell
   Get-NetConnectionProfile | Format-Table InterfaceAlias, Name, NetworkCategory, IPv4Connectivity
   Get-NetIPAddress -AddressFamily IPv4 | Format-Table InterfaceAlias, IPAddress
   ```

   The adapter whose `IPAddress` matches the address TTSNative showed is the one that matters. Its
   `Name` is the network's name (for Wi-Fi, your network's name). Leave anything else alone.

3. Change it only if all of these are true:
   - the `Name` is your own home network;
   - the `InterfaceAlias` is a real adapter (Wi-Fi, Ethernet), not `vEthernet`, WSL, Hyper-V,
     VirtualBox, VMware, Docker, Tailscale, WireGuard or another VPN;
   - the category is **Public** only because Windows asked when you first joined and you chose
     "no", not because it is a shared, guest, café, hotel or office network (a workplace network
     shows **DomainAuthenticated**; leave it).
4. Then, in Windows **Settings → Network & internet**, open that connection's properties and set
   **Network profile type** to **Private network**. Nothing else on the computer needs changing,
   and TTSNative never changes it for you.

## 1. The network check

1. **Windows, public network.** In **Settings → Network & internet → Wi-Fi → (your network)
   properties**, set **Network profile type** to **Public network**. In TTSNative, open **Settings
   → Phones and tablets → LAN mode** and switch it on.
   - Expected: it stays off, with "Windows lists the network on Wi-Fi as a public network, so LAN
     mode stays off" and how to make it private.
2. **Windows, private network.** Set the profile type back to **Private network** and switch LAN
   mode on.
   - Expected: it turns on, shows an address like `http://192.168.1.20:8765`, a QR code and a code,
     and says "Windows lists it as a private network". The sidebar shows **LAN mode on (Wi-Fi)**.
3. **Windows, made public while on.** Set the profile type to **Public network** and wait about a
   minute.
   - Expected: LAN mode turns itself off, saying Windows now lists the network as public. Set it back
     to **Private network** before going on.
4. **macOS or Linux** (if you have one). Switch LAN mode on without ticking **This is a home network
   I trust**.
   - Expected: it stays off, asking you to confirm. Tick the box and switch it on: it turns on. Turn
     it off and on again: the box has to be ticked again after a reload of the page.

## 2. Pairing

1. **By QR code.** With LAN mode on, scan the QR code with the phone's camera and open the link.
   - Expected: the **Pair this device** page opens with the code filled in, and the code disappears
     from the address bar within a second. The name is guessed ("iPhone", "Android phone").
2. Tap **Pair this device**.
   - Expected: "Paired" and the library opens. On the computer, **Paired devices** lists the phone
     with the address it paired from and "not used yet" or "last seen just now".
3. **By typed code.** On a second phone (or after removing the first, step 5.1), open the address
   shown on the computer in the browser.
   - Expected: it goes to `/pair` by itself.
4. Type the code in lower case without the dash and pair.
   - Expected: paired, as in step 2.2.
5. **Wrong code.** Show a new code, then type a different one.
   - Expected: "That code isn't right. Check it on the computer and try again."
6. **Expired code.** Show a new code, wait five minutes, then use it.
   - Expected: "That code has expired. Show a new one on the computer." The computer offers **Show a
     new code**.

## 3. Reading and playback on the phone

1. Open a document and press play.
   - Expected: it reads aloud from the phone's speaker; the sentence being read is highlighted.
2. Pause, skip forward and back, change the speed, and add a bookmark.
   - Expected: each works; the bookmark also appears on the computer.
3. Lock the phone's screen for a minute while it reads, then unlock it.
   - Expected: note what happens (playback carrying on with the screen locked isn't promised).
4. Paste some text as a new document, start an export of it, pause it, resume it, and download it
   when it's done.
   - Expected: each works, and the file downloads to the phone.

## 4. What the phone is refused

Each of these should say **Do this on the computer running TTSNative.** (or, in Settings, that phones
and tablets are managed on the computer):

1. Delete a document.
2. Delete an export.
3. Cancel an export that is running (pausing it is allowed).
4. Send an export to Audiobookshelf (if it's set up on the computer).
5. Open **Settings → Phones and tablets**.
   - Expected: "Phones and tablets are managed on the computer running TTSNative.", then **What
     works over LAN mode (plain HTTP)**.
6. Try to record a voice, and change the speech API or Audiobookshelf settings.
7. Import a web page by its address.

## 5. Removing a device

1. On the computer, press **Remove** next to the phone and confirm.
   - Expected: the phone's next tap or page load goes to **Pair this device**.
2. Pair two devices, then press **Remove all** and confirm.
   - Expected: both have to pair again.

## 6. LAN mode after a restart

1. With a phone paired, quit TTSNative on the computer and start it again.
   - Expected: LAN mode is **Off**. The phone can't load the page (the browser says the server isn't
     responding, or the app shows **Reconnecting…**).
2. Turn LAN mode on again (on the same network).
   - Expected: the phone carries on without pairing again, as long as its address is the same and
     its pairing hasn't ended.

## 7. Network change and sleep

1. Put the computer to sleep for at least a minute, then wake it.
   - Expected: LAN mode has turned itself off, saying the network changed or the computer was
     asleep. Turn it on again.
2. Disconnect the computer's Wi-Fi (or move it to another network) while LAN mode is on.
   - Expected: LAN mode turns itself off within a few seconds.
3. Change the phone's address: on iPhone, **Settings → Wi-Fi → (i)** next to the network, then
   change **Private Wi-Fi Address**; on Android, forget and rejoin the network with another MAC
   setting. Then use TTSNative on the phone.
   - Expected: the phone is sent to pair again, saying its network address changed. The computer
     shows "Refused … its cookie was used from" the new address.

## 8. The plain-HTTP limits

1. Look at the address bar.
   - Expected: no padlock; Chrome says **Not secure**.
2. Try to record with the microphone on the phone.
   - Expected: recording isn't offered or says it needs the computer.
3. Try to install the app: Chrome's menu on Android, or **Share → Add to Home Screen** on iPhone.
   - Expected: Chrome doesn't offer **Install app** (at most **Add to home screen**, a shortcut).
     On iPhone an icon may be added, but it opens nothing while the computer is off.
4. Stop TTSNative on the computer, then reload the page on the phone.
   - Expected: the browser's own "can't reach" page. No offline screen.

## 9. Proxies (optional, on the computer)

1. In a terminal, run `curl -i -H "X-Forwarded-For: 192.168.1.50" http://127.0.0.1:8765/api/health`.
   - Expected: `403` with `proxy_not_supported`.
2. Run `curl -i -H "Host: example.ts.net" http://127.0.0.1:8765/api/health`.
   - Expected: `421` with `invalid_host`.
3. Run `curl -i http://127.0.0.1:8765/api/health`.
   - Expected: `200`.
