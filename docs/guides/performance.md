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

## Expectations on other hardware

These figures are from one machine; nothing else was measured. Kokoro is light, so typical modern laptop
CPUs should still synthesise faster than real time, but older or low-power CPUs may not keep up with
continuous playback at high playback speeds. Chatterbox on CPU is expected to be slower than real time —
the app recommends a GPU install when an NVIDIA card is detected. Long exports run in the background at
lower priority than live playback.
