---
bump: none
---

## Technical

- `npm run perf:listening` (`tests/perf/long-listening.mjs`) measures a long listening session in
  Chromium: private memory per browser process every minute after a forced garbage collection, the
  JavaScript heap against the rest, and the page's DOM nodes and event listeners, then after a pause
  and under simulated memory pressure. It can run with background music, or play the same sentence
  audio on a bare page without the app.
- `docs/guides/performance.md` documents narration memory in long sessions (issue #44): it grows in the
  browser's media handling outside JavaScript, the same way without the app, about 5 MB a minute for
  the first 600 sentences and about 0.5 MB a minute after that. The app's own share is about 15 MB an
  hour, with the JavaScript heap and the DOM flat.
