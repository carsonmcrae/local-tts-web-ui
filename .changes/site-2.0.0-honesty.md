---
bump: none
desktop: unchanged
browser: unchanged
phone: unchanged
website: changed
docs: unchanged
---

## Technical

- Website: every claim and screenshot that only holds for 2.1.0 (chapter fixes, the included books and
  library organisation, study aids, export subtitles, Studio noise cleanup, the ONNX telemetry note, the
  Library, Included books and Voice Studio screenshots) now sits in an `if:released-2.1.0` block, so the
  published site describes 2.0.0 until 2.1.0 is out; the download page carries `noindex` while no
  installer is published; the seven voice samples and both videos have accessible names, the French and
  Spanish quotes are language-tagged; the demo is described as 2½ minutes and the source install as the
  current development version. The download and release pages carry the same social metadata as the home
  page; the download page lists what the app needs (Windows 11 with WebView2, about 1.5 GB of disk, no
  graphics card); the Copy button keeps an accessible name through its states (`demo.js`); the sitemap
  lists `/download/` only while an installer exists; `build-site.mjs --expect-installer X.Y.Z` fails a
  build that would not advertise that installer, and `release.yml` passes the released version to the
  Pages dispatch (`pages.yml` input `expect_installer`).
