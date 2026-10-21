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

## ADR-8: Worker lock changes are offered as a one-click, in-place update

- **Context:** The cloning environment is built once from `apps/chatterbox-worker/uv.lock`. When that
  lock changes (a security override, a Dependabot bump), existing installs kept the old packages until
  someone removed and reinstalled voice cloning.
- **Decision:** `installed.json` records the SHA-256 of the lock and the extra (`cpu`/`cuda`) the
  environment was built from. When the current lock differs, or the marker predates this field, the
  engine reports `updateAvailable` and Settings → Engines & models (and the Voice Studio) offers **Update**. The
  update is an install job (same progress, cancel and status as an install) that runs the same
  `uv sync --frozen` for the recorded extra in place, then verifies a model load before writing the new
  hash. Synthesis waits while uv rewrites packages.
- **Alternatives:** Re-syncing automatically before the worker first loads. Rejected because it would
  download packages the user didn't ask for (the privacy promise is that the only network requests are
  downloads you start), would break cloning offline, and would turn a voice preview into a
  multi-minute wait.
- **Consequences:** Nothing is deleted when an update fails: the previous marker stays, the engine stays
  usable, and the update stays on offer with the error shown. Only changed packages download. A
  cancel during uv's short install phase can leave a mix of old and new packages; because the old
  hash is kept, the update stays on offer and running it again brings the environment back in line.

## ADR-9: Studio voices average the speaker over a session; no training

- **Context:** A quick voice copies one 10–20 second clip. Chatterbox Turbo takes the voice's sound from
  the first 10 seconds of that clip and its speaking style from the first 15, so a thin microphone, a
  flat reading or an unlucky first sentence carries into every generated sentence. People who want a
  faithful voice are willing to record for longer.
- **Decision:** A studio voice is built from a recorded session (lossless browser capture with voice
  processing off, or an imported recording split at pauses). The worker measures every usable take
  (voice-encoder and S3Gen speaker embeddings, pitch movement); the server averages the speaker's
  identity over the takes that agree with each other, ranks takes as prompts (speech length, noise,
  brightness, pauses, pitch movement, typicality) and builds five candidates: each uses one take's first
  10 and 15 seconds for sound and style, plus the session identity. Each is auditioned on the same
  sentences with the same seed and scored by speaker similarity; the person picks by ear from the top
  three. The result is saved as safetensors and loaded instead of preparing a reference at synthesis
  time. A per-voice delivery (sampling temperature and top-p) adds control over inflection.
- **Alternatives:** Fine-tuning Chatterbox on the session. Rejected for now: hours of GPU time, a
  training stack in the worker and a large per-voice download, for a gain that a better reference
  largely captures. The session's takes are kept so fine-tuning could be added later. Shipping voices
  in the repository was ruled out: a published voice can be used by anyone to impersonate its speaker.
- **Consequences:** Building needs the cloning engine and takes a minute or two on a GPU; the worker
  is busy meanwhile, so other custom voices wait. Sessions and studio voices take more disk (24-bit
  FLAC takes). A built voice's file name and delivery are part of its audio cache revision, so a
  rebuild or delivery change never serves old audio; quick voices keep their original revision.

## ADR-10: The website's demo uses the browser's own voices, not TTSNative's model

- **Context:** The website should let visitors hear something before they install. The TTSNative
  voices come from Kokoro running on the visitor's own computer; the website is static (GitHub
  Pages) and promises no cookies, analytics or third-party requests.
- **Decision:** The "Try speech in your browser" demo uses the Web Speech API (`speechSynthesis`). It
  lists voices on the device first, flags online voices (some browsers send the text to a cloud
  service for those), says plainly that these are the browser's voices and not TTSNative's, and
  explains when a browser can't speak. To hear the real voices, the page offers short clips generated
  by the app itself (`npm run media:voices`), shown only when the clips exist.
- **Alternatives:** Kokoro in the browser (ONNX Runtime Web or `kokoro-js` with WebGPU or WebAssembly).
  Deferred: the model is about 90 MB even at 8-bit and 325 MB at full precision, downloaded per
  browser; files that size would be served from a model host such as Hugging Face rather than Pages,
  breaking the no-third-party-requests promise; WebGPU isn't available in every browser, and the
  WebAssembly fallback is slow and can exhaust memory on phones; and the phonemiser it relies on is
  GPL-licensed eSpeak NG compiled to WebAssembly (see ADR-1), which would need its own licence review
  before shipping on the site.
- **Consequences:** The demo works instantly in most browsers, costs nothing to host and sends nothing
  anywhere unless the visitor picks an online voice (which is labelled). It sounds different from
  the app, so the page says so. Revisit when a small (under ~50 MB) model with a licence-clean
  phonemiser can be self-hosted within Pages' limits.

## ADR-15: A Tauri window around the existing UI and server, with a bundled Python

- **Context:** People without developer tools should install TTSNative like any Windows app. The React
  UI and the FastAPI server already work well together on loopback, and the reader must not be
  rewritten. (ADR-11 to ADR-14 are reserved by work in progress on other branches.)
- **Decision:** A Tauri 2 shell opens a window on the bundled server's loopback origin and owns the
  server's lifetime (no console, kill-on-close Job Object, clean stop through stdin, single instance,
  navigation limited to its own origin). The runtime is python-build-standalone installed by the pinned
  uv with the locked, hash-checked packages, byte-compiled, plus the default Kokoro model. A per-user NSIS
  installer keeps the program and the user's data in separate folders. Details and the options weighed:
  [desktop-and-releases.md](desktop-and-releases.md).
- **Alternatives:** Electron (bundles a browser for nothing we need); PyInstaller or Nuitka (packers that
  antivirus tools often flag); the python.org embeddable zip (3.12 binaries stop at 3.12.10); Inno Setup
  (Tauri's updater can't drive it).
- **Consequences:** Every existing server protection still applies, because the page is served by the
  same server as in a browser. The installer is a few hundred megabytes because of the model; voice
  cloning stays an on-demand download. Windows only for now; the modules are separate so other
  platforms can follow.

## ADR-16: Updates only from GitHub Releases, verified and confirmed

- **Context:** Installed copies should learn about new versions without a cloud service, without
  telemetry and without trusting anything but the project's own releases.
- **Decision:** Tauri's updater reads `latest.json` from the latest GitHub Release (never drafts or
  pre-releases), offers only a newer SemVer version, downloads it, verifies its minisign signature
  against the public key built into the app, and installs only after the user confirms twice (notice,
  then _Install and restart_). Checks happen at most every 12 hours and can be turned off; _Remind me
  later_ lasts three days per version. Authenticode signing is added when a certificate exists and is
  never a substitute for the updater signature.
- **Consequences:** One new network connection, documented in the privacy summary. The updater's
  private key must be kept safe and backed up: without it installed copies can't verify updates.

## ADR-17: Change files decide the version; people approve the notes

- **Context:** Several branches are often in flight. Editing one version number or one `Unreleased`
  section on each branch caused conflicts and let a merge silently skip its release impact.
- **Decision:** Every pull request adds a `.changes/*.md` file with its bump (major, minor, patch or
  none) and its notes for users and for developers; CI requires it and refuses hand-edited versions.
  `npm run release:prepare` computes the next version from the files on `main`, writes it everywhere,
  drafts plain-language notes in `docs/releases/` and the dated developer changelog, and consumes the
  files; CI rejects the draft until a person rewrites it. Pushing the tag publishes.
- **Alternatives:** Changesets (npm-only versions, no separate user-facing notes); bumping the version
  on every merge (bot commits on protected `main`, and a release for every merge); per-branch version
  numbers (collisions, as seen in another project).
- **Consequences:** Version advancement and publication are separate: `main` always knows its next
  version, and users only see reviewed releases. The app, the website and GitHub Releases show the same
  notes, and the history works offline.
