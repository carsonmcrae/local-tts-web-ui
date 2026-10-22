---
bump: patch
---

## Fixed

- Importing a long studio recording, or a shared voice file larger than 25 MB, works again; before, the upload
  stopped with a general error.
- A file or request over the size limit is answered with a clear "too large" message instead of a general error.
- An audiobook whose title is a name Windows reserves for devices (such as NUL or CON) is exported under a
  usable file name.
- A paired phone's name is shown with visible characters only.

## Security & reliability

- A request that reaches the computer's own address from another device is refused outright unless network
  mode is on; phones and tablets come in through LAN mode.

## Technical

- `SecurityMiddleware` applies per-route body caps (`ROUTE_BODY_CAPS`: voice-session import 600 MB, voice-profile
  import and preview 40 MB) above the general `max_upload_mb` and records a cut-off body in `scope["state"]`
  (`BODY_TOO_LARGE`), which the HTTP error handler answers with 413 `payload_too_large`; `_check_here` refuses
  non-loopback clients when `allow_network` is off; `safe_filename` suffixes Windows reserved device names;
  `plain_text` moves to `ltts.common` and is applied to paired device names.
