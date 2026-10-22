---
bump: none
desktop: unchanged
browser: unchanged
phone: unchanged
website: unchanged
docs: changed
---

## Technical

- Development wiki page: contributors add a change file (`npm run change -- <bump>`, with the five
  surface keys) instead of editing `CHANGELOG.md`; coverage gates are 100 % lines and branches for the
  web app and the server; the worker uses PyTorch 2.11; the version lives in 11 places; current code
  layout (`apps/desktop`, `site/`, `.changes/`, the server's `library`, `sfx`, `lan`, `speech_api` and
  `pronunciation` packages); links to the working rules and the release readiness gate.
- Exporting Audio: exports carry the document's own title, album and track tags (and the M4B
  details), never a comment or tag naming the app; where the Windows app keeps exports; the Windows
  app ignores `LTTS_FFMPEG`.
- Privacy and Security: the Windows app's data folder and bundled runtime, web page import and
  Audiobookshelf connections, the one remaining (ignored, unreachable) `torch` advisory in place of the
  fixed `setuptools` and reduced `torch` ones, and the unsigned installer.
- FAQ: every connection to the internet and when it happens (setup, model and engine downloads, web
  page import, Audiobookshelf, the Windows app's update check and update download); platform claims
  limited to what CI tests; phones don't import voice recordings.
- Local speech API guide: the Windows app's ports (8770 to 8789) and where to find the port in use.
- Getting Started: five pages (Library, Voices, Voice Studio, Exports, Settings), the Explore tab,
  current formats and web page import, and the player's bookmark, sleep timer and mixer controls.
- README: what the published 2.0.0 has against `main`, the installer not published yet (SmartScreen
  warning, update signature), platform testing as CI does it, the Windows app's size and data folder.
- Windows App and Installation: requirements, what the installer bundles against optional downloads
  (voice cloning sizes, ffmpeg), where data lives, backing up and moving it, how updates are verified,
  and uninstalling with data kept unless deletion is confirmed twice (naming the data folder, the window
  position and the installer's registry entry).
- Troubleshooting (wiki and guide): a Windows app section (log folder, SmartScreen, start-up failures,
  ports 8770 to 8789, the installer's free-space check, "No update is available right now", failed
  updates).
- New wiki page What Works Where: features against the Windows app, the browser on the computer,
  phones on the home network and the website, with the reason for each limit (including the
  per-device allowances and saved casts staying on the computer), taken from `lan/policy.py` and the
  interface; linked from Home and the sidebar.
- Settings and Models, Other Devices, configuration guide: the Windows app's update check, ports,
  `LTTS_*` handling and phone permissions; `LTTS_EXTRA_ALLOWED_HOSTS` and `LTTS_FFMPEG` listed.
- Bug report form: where it happened, install type, app version (Settings → About) and logs location.
- Architecture overview: the desktop shell, LAN mode, music and sound effects, the included books,
  exports and the speech API, with links to the ADRs.
