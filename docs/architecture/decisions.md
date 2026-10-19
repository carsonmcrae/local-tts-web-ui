# Architecture decisions

Each record states the context, the decision, the alternatives and the consequences. Add a new ADR
when a choice changes the stack, a trust boundary, data storage or the setup experience.

## ADR-1: React + TypeScript UI with a Python inference service

- **Context:** The best local TTS models (Kokoro, Chatterbox) and document parsers are Python-first;
  the UI must feel like a polished desktop app on desktop and mobile browsers.
- **Decision:** Vite + React + TypeScript + Tailwind for the UI; FastAPI for a single local service.
- **Alternatives:** All-Node with `kokoro-js` (no mature cloning engine, GPL phonemiser in WASM anyway);
  in-browser inference via WebGPU (slow on many machines, large downloads per browser, no cloning);
  Java (no relevant inference ecosystem); keeping Gradio (developer-tool UX).
- **Consequences:** Two languages to maintain, mitigated by generated API types and a one-command bootstrap.

## ADR-2: uv manages Python; Node is the only prerequisite

- **Context:** `npm run dev` must work without manual Python setup, without silently modifying the system,
  and without `curl | sh` installers.
- **Decision:** The bootstrap downloads a pinned uv release from GitHub, verifies its exact size and SHA-256,
  and lets uv install Python 3.12 into `.tools/python` and dependencies from `uv.lock` (`--frozen`).
  An existing uv ≥ 0.9 is reused.
- **Alternatives:** Require system Python (the v1 pain point); Docker (heavy, poor GPU/mic ergonomics on
  desktops); pip with hash-checked requirements (still needs Python).
- **Consequences:** First run needs internet for uv, Python and models; everything is local and reproducible.

## ADR-3: Synthesise per sentence, on demand, with a content-addressed cache

- **Decision:** Segment text into sentences; synthesise each on request with prefetching; cache by hash.
- **Why:** Playback starts in about a second even for whole books; sentence-level highlighting is exact;
  seeking and voice switching are cheap; exports reuse the same cache and resume after interruption.
- **Trade-offs:** Inter-sentence prosody is not modelled (Kokoro is sentence-oriented anyway); natural
  pauses are added per boundary type. Word-level highlighting is deferred until real timings are available.

## ADR-4: The cloning engine runs in an isolated environment over stdio

- **Context:** chatterbox-tts pins `torch==2.6.0`, `numpy<2`, `transformers==5.2.0` and even `gradio`,
  which conflict with kokoro-onnx (`numpy>=2`). It is multi-gigabyte and optional.
- **Decision:** A separate uv project (`apps/chatterbox-worker`) installed on demand from Settings into
  `data/engines/chatterbox/venv` (CPU or CUDA build), driven by a JSON-lines stdio protocol, with Hugging
  Face offline mode forced and weights downloaded by our verified model store.
- **Consequences:** The basic reader never needs a GPU or the large download. A worker crash cannot take
  down the server; the worker unloads after 10 idle minutes to free VRAM.

## ADR-5: Raw-body uploads and sandboxed parsing

- **Decision:** Uploads are `POST` bodies streamed to disk with a hard byte limit (no multipart parser).
  The real type is sniffed; parsing happens in a spawned process with a timeout (and RLIMIT_AS on Linux);
  ZIP containers are validated (entries, ratio, total size, encryption, names) and XML entity
  declarations are rejected before any parser runs.
- **Consequences:** Parser bugs or malicious documents can at worst fail one upload.

## ADR-6: No LLM in the pipeline

- **Decision:** Extraction and normalisation are deterministic. Document text is data that is read aloud,
  never interpreted. This removes the prompt-injection surface entirely. If an LLM feature is ever added,
  it must not be able to trigger tools, file access, network requests or configuration changes.

## ADR-7: Local-only by default, explicit network mode

- **Decision:** Bind `127.0.0.1`; validate the Host header (DNS rebinding); require a custom header on
  state-changing requests and block `Sec-Fetch-Site: cross-site` (CSRF); never enable CORS. Network
  access needs `--allow-network`, which generates an access token required from non-loopback clients.
