# HTTPS for LAN mode: what is realistic for ordinary users

> **In short:** No option gets a phone a trusted certificate for a bare private address like
> `192.168.1.20` unless each phone trusts a CA or a third party is involved. The best path for
> TTSNative is an **opt-in "secure LAN mode" with a local CA that TTSNative makes itself**. Its root
> key is destroyed once it has signed a name-constrained intermediate, and it is trusted only on the
> phones, never on the computer. [Section 7](#7-design-secure-lan-mode-with-a-local-ca) is a
> concrete design, with what setting it up on an iPhone and on an Android phone would take: about
> five minutes, two or three system warnings that are real trust decisions, and no browser warning
> to click through. **Tailscale Serve** and other proxies are refused by the server for now (they
> would pass for the person at the computer); supporting one needs its own design. Reject
> self-signed click-through certificates, public tunnels and shared-key DNS services. Defer a
> Plex-style DNS service run by the project. Nothing on this page was installed, signed up for or
> switched on, and no certificate was made.

Researched on 2026-10-21 from the linked sources. Statements marked _(inference)_ are reasoning
rather than something a source says. Untested on real phones: no phone was available.

## Why plain HTTP holds phones back

- **Secure contexts.** Browsers only give the microphone, service workers and "install as app" to
  `https` pages and loopback addresses. A private-network address such as `192.168.x.x` doesn't
  count
  ([Chromium](https://www.chromium.org/Home/chromium-security/prefer-secure-origins-for-powerful-new-features/)).
- **No public certificate for a private address.** Publicly trusted CAs may not issue for reserved
  IP addresses or internal names. They had to stop in 2015 and revoke what remained by 2016
  ([CA/Browser Forum](https://cabforum.org/working-groups/server/internal-names)). Let's Encrypt has
  issued IP-address certificates since January 2026, but only six-day ones, for public addresses it
  can reach
  ([Let's Encrypt](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)).
- **HSTS never applies to an IP-address host**
  ([RFC 6797 §8.1.1](https://www.rfc-editor.org/rfc/rfc6797#section-8.1)), so nothing would keep a
  phone on HTTPS after a downgrade.

What HTTPS would change:

- Documents, audio and the device cookie would no longer be readable on the Wi-Fi.
- Phones could use the microphone.
- The app's screens could be installed and opened while the computer is unreachable. Reading and
  listening still need the computer.

Pairing and what a device may do (`lan/policy.py`) stay the same either way.

## The options at a glance

| Option                                            | Who has to trust what                                        | Third-party account                        | Exposure                                                                          | TTSNative could automate it                                          |
| ------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Local CA made by TTSNative                        | Each phone installs and trusts one root (manual steps)       | None                                       | Stays on the LAN. A stolen key matters only to phones that trust the root         | Yes, except the phone's trust steps                                  |
| Self-signed certificate, user clicks through      | Each user clicks through a warning, every time trust is lost | None                                       | Stays on the LAN. Teaches users to ignore warnings, no protection on first use    | Yes, but the result is poor (no service worker or install)           |
| Tailscale Serve (MagicDNS HTTPS)                  | Let's Encrypt (public), via Tailscale                        | Tailscale (free personal plan)             | Tailnet only. The machine's name is published in Certificate Transparency logs    | Should not: it changes the user's tailnet. Document it instead       |
| Headscale + Serve                                 | Let's Encrypt (public), via your own coordination server     | None, but your own domain and DNS provider | As above, on infrastructure you run                                               | No: too much infrastructure for ordinary users                       |
| ZeroTier                                          | Nothing: it gives no HTTPS certificates                      | ZeroTier, or a self-hosted controller      | Overlay network                                                                   | Doesn't solve secure contexts                                        |
| Cloudflare Tunnel (+ Access)                      | Cloudflare (public)                                          | Cloudflare, with a domain                  | **Public hostname**, and Cloudflare sees the plaintext                            | Excluded                                                             |
| ngrok, Tailscale Funnel                           | Public CAs                                                   | Yes                                        | **Public on the internet**                                                        | Excluded                                                             |
| Own domain, DNS-01, a name pointing at the LAN IP | Let's Encrypt (public)                                       | A domain, and a DNS provider with an API   | DNS and Certificate Transparency publish the names. Some routers block such names | Only with a service run by the project (plex.direct model). Deferred |

## 1. A local CA made by TTSNative (the mkcert approach)

**What it is.** The computer makes a private certificate authority, and each phone trusts it. A
certificate for `192.168.1.20` (and the computer's `.local` name) is then trusted on those phones.

**Setup on a phone:**

- **iPhone or iPad:**
  1. Open the CA certificate in Safari.
  2. Install the profile in Settings (Profile Downloaded).
  3. Turn on full trust under Settings → General → About → Certificate Trust Settings. A manually
     installed profile doesn't get trust for websites on its own
     ([Apple](https://support.apple.com/en-us/102390)).

  iOS 18 had a bug that hid such roots from that list, fixed in 18.2
  ([Apple developer forums](https://developer.apple.com/forums/thread/764673?page=5)).

  Server certificates need:
  - a SAN;
  - SHA-2;
  - RSA of at least 2048 bits;
  - the serverAuth usage;
  - a validity of at most 825 days ([Apple](https://support.apple.com/en-us/103769)).

  The shorter public limit of 398 days doesn't apply to roots that users add
  ([Apple](https://support.apple.com/en-us/102028)).

- **Android:**
  1. Go to Settings → Security → Encryption & credentials → Install a certificate → CA certificate.
  2. Set a screen lock, if there isn't one.
  3. Tap "Install anyway".

  Since Android 11, apps can't start this for the user
  ([HTTP Toolkit](https://httptoolkit.com/blog/android-11-trust-ca-certificates/)). Android then
  keeps showing a lasting "Network may be monitored" notice.

  Since Android 7, apps ignore user-installed CAs unless they opt in
  ([Android](https://android-developers.googleblog.com/2016/07/changes-to-trusted-certificate.html)).
  Chrome does opt in. It has used the Chrome Root Store on Android since Chrome 115, and still
  loads user-added roots as trust anchors
  ([Chrome Root Store FAQ](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md),
  [trust_store_android.cc](https://chromium.googlesource.com/chromium/src.git/+/main/net/cert/internal/trust_store_android.cc)).
  Android 14's updatable CA store changes only the system CAs; user CAs work as before
  ([Android](https://source.android.com/docs/core/ota/modular-system/conscrypt)).

  Firefox for Android needs a hidden setting, "Use third party CA certificates". Samsung
  Internet wasn't checked.

- **The computer needs nothing.** It uses `localhost`, which is already a secure context, so
  its trust store is never touched and no administrator rights are needed _(inference)_.

**Security trade-offs:**

- Whoever holds a CA's private key can mint a certificate for any site those phones visit. mkcert's
  own README warns about this, and says mkcert is meant for development rather than end users'
  machines ([mkcert](https://github.com/FiloSottile/mkcert), BSD-3-Clause). So TTSNative shouldn't
  bundle mkcert.
- **Name constraints:**
  - Desktop Chromium enforces name constraints in locally trusted roots, since version 112
    ([Edge policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/enforcelocalanchorconstraintsenabled)).
  - On Android, Chrome adds user roots as plain trust anchors. For these, BoringSSL uses only the
    name and key
    ([trust_store.h](https://boringssl.googlesource.com/boringssl/+/HEAD/pki/trust_store.h)), so a
    constraint written into the root itself is probably ignored there _(inference from the source)_.
  - Every verifier enforces constraints on an **intermediate**. So the safe design puts them on an
    intermediate _(inference)_:
    1. Make a root.
    2. Sign one intermediate limited to `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fd00::/8`
       and the computer's `.local` name.
    3. Destroy the root's private key at once.
    4. Keep the intermediate's key protected: DPAPI on Windows, the Keychain on macOS, a `0600` file on
       Linux.

    A stolen intermediate key could then only mint certificates for private addresses and `.local`
    names, and only for phones that trust this root.
- **Fingerprints.** The CA certificate is first downloaded over plain HTTP. The computer should show
  its SHA-256 fingerprint so the person can compare it with what the phone shows.
- **Certificate Transparency.** Chrome's CT rules don't apply to locally trusted CAs, so nothing is
  published
  ([Chromium](https://chromium.googlesource.com/chromium/src/+/main/net/docs/certificate-transparency.md)).

**Automation.** TTSNative could do all of this itself:

- make the CA;
- re-issue the server certificate silently when the address changes;
- serve HTTPS on a second listener on the same private address.

It needs one new dependency, pyca/cryptography (Apache-2.0 or BSD). The phone's trust steps can't
be automated, and shouldn't be. `.local` names resolve on Android since the late-2021 DNS resolver
update, but not on every device
([Android](https://source.android.com/docs/core/ota/modular-system/dns-resolver)). So the
certificate should also carry the IP address.

## 2. A self-signed certificate the user clicks through

- **Chrome:** a page reached by clicking through a certificate warning counts as a secure context
  ([W3C list, 2017](https://lists.w3.org/Archives/Public/public-webpayments-specs/2017Dec/0125.html)).
  But:
  - service workers still fail to register with an SSL error
    ([Mozilla bug 1162772](https://bugzil.la/1162772));
  - installing requires a valid certificate.

  So the microphone might work, but nothing can be installed _(inference)_.

- **Safari:** not established; no source was found.
- **UX:** a frightening warning and a permanent "Not secure" label. It teaches people to click
  through warnings, and doesn't protect the first connection against a machine in the middle.

**Not recommended.**

## 3. Tailscale Serve (and Headscale)

**Setup:**

1. Install Tailscale on the computer and the phone, and sign in to the same tailnet.
2. In the admin console, enable MagicDNS and HTTPS.
3. Run `tailscale serve --bg 8765`.

Serve ends TLS with a Let's Encrypt certificate for `<machine>.<tailnet>.ts.net` and forwards to
`http://127.0.0.1:8765`. It is reachable only inside the tailnet
([Tailscale Serve](https://tailscale.com/kb/1312/serve)). **Funnel** is its public variant, and is
excluded.

**Trust and privacy:**

- Certificates go into public Certificate Transparency logs, including the machine and tailnet
  names. Tailscale advises against enabling HTTPS if those names are sensitive
  ([Tailscale](https://tailscale.com/kb/1153/enabling-https)).
- Traffic is end-to-end encrypted between devices. The relays can't read it, but Tailscale sees
  device metadata ([how Tailscale works](https://tailscale.com/blog/how-tailscale-works)).

**Account and licensing:**

- It needs a Tailscale account. The free Personal plan is for non-commercial use
  ([pricing](https://tailscale.com/pricing)).
- The client core is BSD-3-Clause
  ([LICENSE](https://github.com/tailscale/tailscale/blob/main/LICENSE)). The Windows and macOS apps
  and the coordination server are proprietary ([Tailscale](https://tailscale.com/opensource)).
- **Headscale** (BSD-3-Clause) is a self-hosted coordination server. Support for HTTPS
  certificates and Serve was merged in October 2026 and needs your own domain with a DNS-01
  provider ([PR #3554](https://github.com/juanfont/headscale/pull/3554)). That is too much for
  ordinary users.

**How TTSNative treats it now (`security.py`):**

- Serve's requests reach the main server from `127.0.0.1`, with a `*.ts.net` Host and Serve's own
  `X-Forwarded-*` and `Tailscale-User-*` headers.
- The server refuses every request that carries forwarding headers, and every request from a
  loopback address whose Host isn't exactly `localhost`, `127.0.0.1` or `[::1]`, even if the name
  is in `extra_allowed_hosts` (`403 proxy_not_supported`). So a tailnet device can't pass for the
  person at the computer, and can't use TTSNative through Serve at all
  ([LAN access](../guides/lan-access.md#proxies-tunnels-and-port-forwards-are-not-supported)).
- Supporting Serve properly would mean treating its requests as LAN devices (pairing, the same
  allow-list and limits). That needs: trusting Serve's `X-Forwarded-For` only from Serve, so a
  device cookie can be tied to the device's tailnet address; a `Secure` cookie and the `https`
  origin; a setting naming the `*.ts.net` host, off by default; and an answer to what LAN mode's
  lifecycle (off after a restart, off when the network changes) means for a tailnet. That is a
  separate decision for the owner, not part of this design.

TTSNative shouldn't run `tailscale serve` itself. It changes the user's tailnet, and it publishes
the machine's name.

## 4. ZeroTier, Cloudflare Tunnel, ngrok

- **ZeroTier** is an overlay network with no built-in HTTPS certificates, so it doesn't make a
  secure context. Its licence has changed over the years: GPLv3, then BSL, now MPL plus
  source-available parts
  ([licence](https://github.com/zerotier/ZeroTierOne/blob/dev/LICENSE.txt)).
- **Cloudflare Tunnel:**
  - `cloudflared` is Apache-2.0 and needs a Cloudflare account and a domain.
  - The hostname is **public**, and Cloudflare ends TLS, so it sees the traffic
    ([Cloudflare](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)).
  - Access can add a login in front.
  - Quick tunnels need no account, but anyone with the address can reach the service
    ([Cloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)).

  Phone audio would also travel over the internet.

- **ngrok** gives public endpoints and needs an account ([pricing](https://ngrok.com/pricing)).

All three put the app on the internet or route it through a third party. **Excluded.**

## 5. An owned domain with DNS-01 certificates, and the plex.direct model

**The idea.**

1. Get a wildcard certificate from Let's Encrypt with a DNS-01 challenge. That works for names
   whose server isn't public
   ([Let's Encrypt](https://letsencrypt.org/docs/challenge-types/)).
2. Point a public name at the LAN address (or use split DNS).

Plex did this from 2015:

- Names look like `1-2-3-4.<hash>.plex.direct` and resolve to the address in the name.
- Each server gets its own wildcard certificate, so the key on a user's machine only authenticates
  that one server ([Filippo Valsorda](https://words.filippo.io/how-plex-is-doing-https-for-all-its-users/)).

**Caveat: DNS rebinding protection.**

- Many routers and resolvers refuse public names that resolve to private addresses:
  - dnsmasq's `--stop-dns-rebind`
    ([manual](https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html));
  - OpenWrt's default setting;
  - pfSense;
  - Pi-hole.
- Plex documents per-router workarounds and keeps an insecure fallback
  ([Plex](https://support.plex.tv/articles/206225077-how-to-use-secure-server-connections/)).

So a fallback to plain HTTP is needed anyway _(inference)_.

**Shared-key services are unacceptable.** sslip.io, nip.io, traefik.me and local-ip.co map names to
addresses:

- Some have published a wildcard certificate's **private key** so that anyone could serve HTTPS
  under it. sslip.io's key was revoked, and Chromium blocklists it
  ([Chromium](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/blocklist/README.md)).
- Let's Encrypt treats a key shipped with software as compromised
  ([Let's Encrypt](https://letsencrypt.org/docs/certificates-for-localhost/)).
- Anyone holding the shared key can impersonate every user's server.

**A per-install service run by the project would need:**

- a domain and authoritative DNS, running all the time;
- an API that lets each install set only its own `_acme-challenge` record;
- abuse handling;
- a privacy policy, because the project's DNS would see LAN addresses and install IDs, and Certificate
  Transparency would publish every install's name;
- an exception from Let's Encrypt's limit of 50 certificates per domain a week
  ([rate limits](https://letsencrypt.org/docs/rate-limits/)).

It goes against TTSNative's local-first design. **Deferred.**

## 6. Other things checked

- **Chrome's Local Network Access prompt** (Chrome 142) covers requests from public pages to
  local addresses
  ([Chrome](https://developer.chrome.com/blog/local-network-access)). TTSNative's own page on the
  LAN address is the same origin as its API, so it isn't affected _(inference)_. The UI must never
  be served from a public origin that calls the LAN server.
- **Apple's Local Network privacy prompt** exempts Safari and web views
  ([TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)).
- **Android's local network permission** becomes mandatory for apps targeting Android 17
  ([Android](https://developer.android.com/privacy-and-security/local-network-permission)).
  Browsers may start asking too _(inference)_.
- **Browser flags** such as "insecure origins treated as secure", and enterprise policies, are
  developer and administrator tools, not something to ask users to change.
- **WebTransport certificate hashes** need a page that is already secure, so they don't help here.
- **Standards:** the W3C community group on HTTPS in local networks closed in 2023
  ([W3C](https://www.w3.org/groups/cg/httpslocal/)). Nothing has shipped since.

## 7. Design: secure LAN mode with a local CA

This is a design only. Nothing here exists yet: no code makes certificates, and none was made.

### 7.1 What it gives, and what it doesn't

- **Goal:** a phone that has done the setup once opens `https://192.168.1.20:8766` with a padlock
  and no warning. The microphone, installing as an app and the offline screens then work there,
  and the Wi-Fi can't read the traffic.
- **Never:** asking anyone to click through or turn off a browser warning. If a phone shows "This
  Connection Is Not Private" or "Your connection is not private", the setup isn't finished, and
  the setup page says to go back rather than continue.
- **Never:** touching the computer's own trust store. The computer keeps using `http://localhost`,
  which is already a secure page.
- **Opt-in.** Plain-HTTP LAN mode stays the default. Pairing, `lan/policy.py`, the per-device
  limits, the network check and the proxy refusal stay exactly as they are.

### 7.2 The parts

1. **Certificates** (made on the computer, with pyca/cryptography):
   - **Root:** ECDSA P-256 with SHA-256, `CA:TRUE, pathlen:1`, key usage `keyCertSign, cRLSign`,
     10 years, named "TTSNative local CA (computer name, date)". Its private key exists only in
     memory while it signs the intermediate, and is never written to disk.
   - **Intermediate:** `CA:TRUE, pathlen:0`, 10 years (it can't be renewed without a new root on
     every phone), with name constraints permitting only `10.0.0.0/8`, `172.16.0.0/12`,
     `192.168.0.0/16` and DNS names under `local`. A stolen intermediate key could then only mint
     certificates for private addresses and `.local` names, and only for phones that trust this
     root.
   - **Server certificate:** subject alternative names for the LAN address (an IP SAN) and
     `computer-name.local`, extended key usage `serverAuth`, 397 days (well under Apple's 825-day
     limit). It is made again by itself when the LAN address changes and 30 days before it ends;
     phones don't notice, because they trust the root.
2. **Where the keys live:** the intermediate's key under Windows DPAPI (current user; `CryptProtectData`
   through `ctypes`, no new package), the macOS Keychain, or a `0600` file on Linux. The server key
   is written encrypted (PKCS#8 with a random password kept the same way), because Python's
   `ssl.SSLContext.load_cert_chain` needs a file but accepts a password.
3. **An HTTPS listener** on the same private address, on the main port plus one (`8766`), with
   TLS 1.2 or later, the same app and the same checks. Windows' firewall rule for Python covers
   the second port; no new prompt is expected _(inference)_.
4. **Two modes.** In **secure** mode the plain-HTTP listener serves only a setup page
   (`/lan/setup`), the CA file and a link to the HTTPS address: never the app or the API. Pairing
   happens over HTTPS only. The device cookie becomes
   `__Host-ltts_device; Secure; HttpOnly; SameSite=Strict; Path=/`, which an HTTP page can't set or
   overwrite. HSTS doesn't apply to an IP address, which is why the HTTP listener serves nothing
   else.
5. **Getting the CA onto the phone.** The computer shows a QR code for
   `http://192.168.1.20:8765/lan/setup` and the CA's SHA-256 fingerprint in groups of four. The
   phone's setup page offers `ttsnative-ca.mobileconfig` (an unsigned configuration profile holding
   only the root, for iPhone and iPad) or `ttsnative-ca.crt` (DER, for Android), and the steps for
   that phone. The file first arrives over plain HTTP, so the page asks the person to compare at
   least the first and last groups of the fingerprint with the one on the computer (iOS shows it
   under the profile's **More Details**, Android under the certificate's details).
6. **Undo on the computer.** **Turn off secure LAN mode** goes back to plain HTTP. **Remove the
   certificate authority** deletes the intermediate and server keys. Phones are then left trusting
   a root that nothing can sign with any more (its key was never kept), and the computer shows how
   to remove it from each phone.

### 7.3 Windows and iPhone, step by step

On the computer: **Settings → Phones and tablets → Secure LAN mode → Set up**. Nothing is installed
on Windows. Then, on the iPhone (iOS 17 or 18, in **Safari**):

1. Scan the QR code. The setup page opens and shows the fingerprint. Tap **Download for iPhone**.
   - Safari asks "This website is trying to download a configuration profile. Do you want to allow
     this?" Tap **Allow**, then **Close** on "Profile Downloaded".
2. Open **Settings**. Tap **Profile Downloaded** near the top (or **General → VPN & Device
   Management**), then **TTSNative local CA**.
   - The profile is marked **Not Verified** in red, because it isn't signed. **More Details** shows
     the fingerprint to compare.
   - Tap **Install**, enter the passcode, read the warning that the root certificate will be added
     to the trusted certificates but not trusted for websites until it is enabled in Certificate
     Trust Settings, and tap **Install**, **Install** again, then **Done**.
3. Go to **Settings → General → About → Certificate Trust Settings**. Under **Enable full trust
   for root certificates**, switch on **TTSNative local CA**.
   - iOS warns that enabling it for websites will allow third parties to view private data sent to
     websites. Tap **Continue**.
4. Back in Safari, tap **Open TTSNative securely** on the setup page (`https://192.168.1.20:8766`).
   There is no warning, and the padlock shows. Pair as usual.

**Time:** about four minutes the first time, if the person follows the page; then nothing, even
when the computer's address changes _(estimate; untested on a real iPhone)_.

**What can go wrong:**

- Step 3 is missed (it's in a different part of Settings). Safari then shows "This Connection Is
  Not Private". The setup page must say: don't continue; go back to step 3.
- The profile isn't installed within about eight minutes, and iOS discards it. Download it again.
- Chrome or Firefox on the iPhone saves the file instead of handing it to Settings. Use Safari for
  the download; afterwards any browser works, since they all use the system's trust.
- A work or school iPhone may not allow profiles at all.
- iOS 18.0 and 18.1 had a bug that hid such roots from Certificate Trust Settings; it was fixed in
  18.2 (see section 1).
- The fingerprint isn't compared, and someone on the Wi-Fi swapped the file. Comparing it is the
  only protection for that first download.

**Undo:** **Settings → General → VPN & Device Management → TTSNative local CA → Remove Profile**,
and the passcode. That removes the trust as well.

### 7.4 Windows and Android, step by step

On the computer: the same **Set up**. Then, on the phone (Android 11 or later, in **Chrome**):

1. Scan the QR code and tap **Download for Android**. Chrome saves `ttsnative-ca.crt`. Tapping the
   file doesn't install it: since Android 11 a CA certificate can only be installed from Settings,
   and Android says so.
2. Open **Settings** and search for **CA certificate**, or go to:
   - Pixel: **Security & privacy → More security & privacy → Encryption & credentials → Install a
     certificate → CA certificate**;
   - Samsung: **Security and privacy → More security settings → Install from device storage → CA
     certificate**.
3. Android warns that your data won't be private, and that the certificate's owner could see data
   from websites and apps you use. Tap **Install anyway**.
4. Confirm with the screen lock. A phone without one must set a PIN, pattern or password first.
5. Pick `ttsnative-ca.crt` from **Downloads**. Android says **CA certificate installed**.
6. Back in Chrome, tap **Open TTSNative securely**. There is no warning. Pair as usual.

**Time:** about five minutes, longer when the setting is hard to find on that brand of phone
_(estimate; untested on a real phone)_.

**What can go wrong:**

- Android then shows that the network **may be monitored**, in notifications and the certificate
  settings, and can show it again later. That notice is honest: it is exactly what a trusted CA
  makes possible. The setup page has to say so in advance.
- The file is installed as a **VPN and app** or **Wi-Fi** certificate instead of a **CA
  certificate**, and nothing changes. Install it again as a CA certificate.
- Removing the phone's screen lock later removes user certificates too, and the HTTPS address then
  shows a warning again.
- Firefox for Android needs its hidden "Use third party CA certificates" setting; Samsung Internet
  wasn't checked. Chrome works.
- Work profiles and managed phones may block user CAs.
- The fingerprint isn't compared (as on iPhone).

**Undo:** **Settings → Security & privacy → More security & privacy → Encryption & credentials →
Trusted credentials → User → TTSNative local CA → Remove** (on Samsung: **Security and privacy →
More security settings → View security certificates → User**). Don't use **Clear credentials**,
which removes every user certificate.

### 7.5 Verdict

- **Windows + iPhone: workable, as an opt-in.** About four minutes, three places in Settings, two
  warnings that are real trust decisions, and no browser warning when it's done. The usual failure
  is the third step, which the setup page can catch and explain. Not suitable as the default.
- **Windows + Android: workable, as an opt-in, with a lasting cost.** About five minutes; menus
  differ by brand; it needs a screen lock; and the "network may be monitored" notice stays. People
  should choose it knowingly. Not suitable as the default.
- **Both:** nothing changes on the computer, and the risk is limited to phones that installed the
  root, for private addresses and `.local` names only. Plain-HTTP LAN mode stays the default for
  reading and listening; secure mode is for people who want the microphone, installing, the
  offline screens or privacy on their Wi-Fi.

## Recommendation

1. **Keep plain-HTTP LAN mode** for reading and listening at home, as hardened in
   [Other devices](../wiki/Other-Devices.md):
   - a device cookie works only from the address it paired from, and for 30 days at most;
   - a paired device can reach only what `lan/policy.py` lists;
   - LAN mode turns itself off when the network changes.
2. **Add an opt-in "secure LAN mode"** using the local CA in section 1:
   - a name-constrained intermediate, with the root's key destroyed;
   - the computer's trust store never touched;
   - step-by-step trust instructions for iPhone and Android on the phone itself, with a fingerprint
     to compare;
   - plain words about Android's "Network may be monitored" notice, and how to remove the
     certificate again;
   - a second, HTTPS listener on the same private address.

   Plain HTTP would then be refused for paired devices that have switched.

3. **Keep proxies and tunnels refused**, Tailscale Serve included, until the owner decides on a
   design that treats their requests as LAN devices (section 3). If it is documented then, say that
   it publishes the machine's name, and that its free plan is for personal use.
4. **Recording stays on the computer** until (2) exists.

## What needs the owner's approval

- Creating CA material at all: the root, the name-constrained intermediate and the server
  certificate, their algorithms (ECDSA P-256) and lifetimes (10 years, 10 years, 397 days).
- The key handling in section 7.2: the root's key never kept, the intermediate's under DPAPI, the
  Keychain or a `0600` file (macOS may need a Keychain package or the `security` tool), and what
  "Remove the certificate authority" deletes.
- Adding `cryptography` (Apache-2.0 or BSD-3-Clause) as a server dependency, under the usual
  14-day cool-down and `pip-audit`.
- A second listener port (`8766`) on the LAN address while secure mode is on.
- The wording that asks people to install a root certificate on their phone, including the iOS
  warnings, Android's "network may be monitored" notice, and an unsigned ("Not Verified")
  configuration profile.
- Testing the design on real iPhones and Android phones before it ships (nothing here was tried on
  one).
- Any support for a proxy or tunnel such as Tailscale Serve (section 3). Today they are refused.
- Any project-run DNS service: a domain, servers, ACME accounts and a privacy policy. Not
  recommended now.
