# Performance

Measured with [`tests/perf/benchmark.py`](../../tests/perf/benchmark.py) on 2026-10-19:
**Windows 11, AMD Zen 3 desktop CPU (32 logical cores), 64 GB RAM, NVIDIA RTX 3080 (10 GB),
Python 3.12.10.** Kokoro runs on the CPU only; Chatterbox used the GPU.

| Measurement                                       | Result                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Server cold start (process spawn → healthy)       | 4.0 s                                                                                |
| Kokoro model load (background warm-up at startup) | 1.4 s                                                                                |
| First sentence after load (~70 characters)        | 1.06 s                                                                               |
| Median sentence latency (~70 characters)          | 0.88 s                                                                               |
| Long document: 100 sentences                      | 9.2 min of audio in 117.5 s — **real-time factor 0.21** (≈ 5× faster than listening) |
| CPU during long synthesis                         | ≈ 49 % of all cores                                                                  |
| Peak server memory (RSS) during synthesis         | ≈ 700 MB                                                                             |
| Cached sentence over HTTP (median of 20)          | 71 ms                                                                                |
| Extract a 300-page text PDF (sandboxed)           | 2.25 s                                                                               |
| Chatterbox Turbo load + first clip (GPU)          | 20.4 s                                                                               |
| Chatterbox Turbo synthesis (GPU)                  | real-time factor 0.58                                                                |
| Web app bundle (main chunk, gzip)                 | ≈ 125 KB; each page is lazy-loaded                                                   |

In the browser, the first sentence of a new document typically starts playing about a second after
pressing Play (the API smoke test measured 0.4–0.8 s per uncached sentence); prefetching keeps three
sentences ready, so playback continues without gaps on this hardware.

## Memory in long listening sessions

Measured with [`tests/perf/long-listening.mjs`](../../tests/perf/long-listening.mjs)
(`npm run perf:listening`) on 2026-10-22, same machine: Playwright's Chromium 153, the production
build served by `ltts serve`, Kokoro `af_heart` at 1×, and a pasted document of 1,480 sentences (about
12 sentences a minute). Every sample follows a forced garbage collection. The figures are the private
memory of the page's own browser process; the GPU, audio, network and browser processes stayed flat in
every run.

| Session                                                                  | Start  | 20 min | Peak             | End              |
| ------------------------------------------------------------------------ | ------ | ------ | ---------------- | ---------------- |
| Narration, 115 minutes                                                   | 156 MB | 258 MB | 429 MB (min 115) | 429 MB (min 115) |
| Narration, 60 minutes                                                    | 147 MB | 243 MB | 405 MB (min 50)  | 381 MB (min 60)  |
| Narration with background music, 60 minutes                              | 205 MB | 303 MB | 455 MB (min 52)  | 439 MB (min 60)  |
| Bare page: the same sentence audio on one `<audio>`, no app, 115 minutes | 120 MB | 196 MB | 362 MB (min 114) | 349 MB (min 115) |
| Bare page, 20 minutes                                                    | 116 MB | 192 MB | still rising     | 192 MB           |
| Bare page, clearing the element's source between sentences, 20 minutes   | 123 MB | 196 MB | still rising     | 196 MB           |

- **Where it grows.** All of it is in the page's process, outside JavaScript: the JavaScript heap stays
  at 9–17 MB for the whole session.
- **Why.** The browser's media handling keeps memory for each sentence it has played. A bare page that
  plays the same files one after another on a single audio element, without the app, draws the same
  curve: 4.3 MB a minute for the first 50 minutes against the reader's 5.3 MB, bending at the same
  point. Clearing the element's source between sentences (`removeAttribute('src')` and `load()`)
  changes nothing. The player itself keeps only the address and length of a few sentences around the
  current one (`KEEP_BEHIND`, `PREFETCH_AHEAD`) and cancels the rest, and sentence audio is served with
  `Cache-Control: no-store`.
- **It slows down, but does not stop.** For the first 600 sentences or so (50 minutes at 1×) the reader
  grows about 5 MB a minute and ends up about 250 MB above the start. After that it grows about 0.5 MB a
  minute: in the 115-minute session, from 399 MB at minute 50 to 429 MB at minute 115. At that pace each
  further hour adds about 30 MB.
- **The app's own share is small.** After the bend the bare page grows 0.2–0.3 MB a minute, so the app
  adds about 15 MB an hour of its own, also outside JavaScript. The page does not grow with it: the
  reader keeps the same 6,288 DOM nodes from the first sentence to the last, and its event listeners
  (React's click handler on each sentence) are replaced and collected, not added. Where those 15 MB an
  hour go was not traced; a Chromium memory-infra trace would break the page's process down further.
- **Background music** adds a constant 50–60 MB, the two decoded tracks the music engine keeps; it does
  not add growth.
- **Little comes back while the page is open.** A minute's pause releases 18 MB of the page's process
  at most, and a simulated critical memory-pressure signal then releases 4 MB more at most.

For planning: a reader tab in Chromium reaches about 400 MB in its first hour, or about 450 MB with
background music, and then adds about 30 MB an hour. All of Chromium's processes together used
600–660 MB after one hour and about 650 MB after two. Not measured: Firefox, Safari, phones, the
Windows app's WebView2 (the same Chromium engine), and speeds other than 1×. The browser's own
`performance.measureUserAgentSpecificMemory()` needs a cross-origin-isolated page, which TTSNative is
not (it sends `Cross-Origin-Opener-Policy` but no `Cross-Origin-Embedder-Policy`), so the JavaScript
heap figure comes from the DevTools protocol instead.

## Expectations on other hardware

These figures are from one machine; nothing else was measured. Kokoro is light, so typical modern laptop
CPUs should still synthesise faster than real time, but older or low-power CPUs may not keep up with
continuous playback at high playback speeds. Chatterbox on CPU is expected to be slower than real time —
the app recommends a GPU install when an NVIDIA card is detected. Long exports run in the background at
lower priority than live playback.
