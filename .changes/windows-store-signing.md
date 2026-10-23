---
bump: none
desktop: unchanged
browser: unchanged
phone: unchanged
website: changed
docs: changed
---

## Technical

- ADR-26 and `docs/guides/windows-distribution.md`: Windows ships through the Microsoft Store as the main channel (MSIX, re-signed by Microsoft, so no SmartScreen warning) with the direct download kept and signed for free by SignPath Foundation. The guide lists the owner's account steps, the design of both packages and what is still open.
- ttsnative.com/code-signing/ is the code signing policy SignPath Foundation requires: what is signed and by whom, who approves a signature, what the app sends over the network and how to check a signature. It says plainly that 2.1.0 and earlier are unsigned. The home page footer and the download page link to it as "Code signing policy", and it is in the sitemap and the website's end-to-end tests (desktop and phone, axe).
