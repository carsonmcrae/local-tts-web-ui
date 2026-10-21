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
  largely captures. The session's takes are kept so fine-tuning could be added later (it was
  measured later and is now an optional step: ADR-16). Shipping voices in the repository was ruled
  out: a published voice can be used by anyone to impersonate its speaker.
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

## ADR-11: A studio voice keeps a style prompt per kind of sentence

- **Context:** Chatterbox Turbo switches off its emotion conditioning, so a voice's rhythm and
  inflection come almost entirely from the 15 s of prompt speech tokens (T3). A studio voice built
  from one take read every sentence like that take, so questions and exclamations sounded flat
  after a 30-minute session.
- **Decision:**
  - **Styles.** A studio voice stores small style files (T3 prompt tokens only) for narration,
    questions, lively lines and dialogue. Each is built from up to three takes of matching passages
    (exact passages first, then their group, ranked by length, noise, pitch movement and
    typicality), joined to fill the whole 15 s with long pauses shortened.
  - **Choosing a style.** At synthesis the engine picks the style from the sentence's punctuation
    (or quoted speech). It swaps only T3's prompt, so S3Gen's prompt and the speaker identity (the
    sound) stay the same.
  - **Every sentence.** Each is seeded from its text, retried when its length is implausible for
    its syllables, and polished: edges trimmed, long pauses shortened, loudness levelled to the
    built-in voices.
- **Alternatives:**
  - **Emotion tags.** Reported to have no effect.
  - **A per-sentence reference built from the session at synthesis time.** Slower, and it changes
    the voice's sound.
  - **Fine-tuning (LoRA on T3).** The likely next step (see docs/research/voice-quality.md), still
    deferred for the reasons in ADR-9.
- **Consequences:**
  - New builds take a few seconds longer; saved voices can learn styles from their kept takes.
  - The styles' file sizes and times are part of the voice's cache revision.
  - The engine revision moved to `worker-2`, so cloned audio is generated again once.

## ADR-12: Voices are shared as checked `.ttsvoice` packages, never with their recordings

- **Context:** People want to send a voice they built to someone else's TTSNative. A voice is a set of
  files; a received file is untrusted, and a voice can impersonate its speaker.
- **Decision:**
  - **Contents.** A package is a ZIP of exactly `manifest.json`, `reference.wav`, `voice.safetensors`
    and `styles/<style>.safetensors`. The manifest holds the name, delivery, the creator's consent
    statement and a SHA-256 per file. Session takes are never included.
  - **Export** needs an explicit confirmation (`confirm=true`) after a warning.
  - **Import** needs the importer's own consent. It reads only allow-listed names, each within a
    size limit (never by archive paths), and verifies every checksum and the reference audio. It
    checks each safetensors header (format, version, tensor names, types, shapes and byte ranges)
    without loading a tensor.
  - **Storage.** Imported voices are marked shared and keep their manifest as `origin.json`.
- **Alternatives:**
  - **Including the takes.** Rejected: a full recording session is far more than a voice needs, and
    would enable training.
  - **A signed format.** Deferred: there is no key infrastructure, and the consent check is the real
    safeguard.
- **Consequences:**
  - A shared voice can't relearn its styles (it has no takes).
  - Speech made with it still carries the Perth watermark.

## ADR-13: The server plans each document sentence: voice, effect and sound

- **Context:** Readers want characters in different voices and some lines to sound like an
  announcement or a phone call. Playback and exports must sound the same.
- **Decision:**
  - **Storage.** Per-sentence styling (`segment_styles`: voice, effect, sound) and a document's
    dialogue voice (`document_cast`) live in the database.
  - **Planning.** The synthesis service plans each sentence: its own voice, then the dialogue
    voice if it quotes speech, then the reading voice. Players and exports keep requesting audio the
    same way.
  - **Effects** are deterministic NumPy DSP applied before the sentence's pause. They are part of
    the cache key only when set, so plain audio keeps its keys.
  - **Sounds** (Turbo's tags) are sent only to engines that perform them.
- **Alternatives:**
  - **Splitting sentences at quotes for dialogue.** Deferred: it changes segmentation, cache keys
    and highlighting.
  - **Applying effects in the browser.** Rejected: exports wouldn't match.
- **Consequences:**
  - A whole sentence is styled.
  - Deleting a voice hands its sentences back.
  - The player refetches audio when styling changes.

## ADR-14 (proposed, awaiting the owner's decision): A local language model may suggest speakers

- **Status:** Proposed. This would amend ADR-6, so it is not in effect: the module exists and is
  tested (`documents/speaker_suggestions.py`), but nothing in the app calls it until this is accepted.
- **Context:** Dialogue tags (ADR-13, `delivery.py`) name the speaker of many quoted lines, but not of
  untagged ones ("Quite sure."). Readers who cast characters have to assign those by hand. A small
  local model can often tell from context who is speaking. ADR-6 keeps every LLM out of the pipeline
  so document text can never act as instructions.
- **Proposed decision:**
  - **Off by default**, turned on in Settings with the address of a model server the reader already
    runs. Only a loopback `http://` address is accepted (`127.0.0.1`, `localhost`, `[::1]`): no
    cloud provider, no LAN host, no redirects, no proxies. The app never downloads a model.
  - **Suggestions only.** The model is asked only about quoted lines without a speaker, and only to
    choose among the names dialogue tags already found (or none). Its answer is parsed as JSON;
    anything else (other lines, invented names, extra fields) is dropped. Suggestions are shown for the
    reader to accept; nothing changes until they do.
  - **No capabilities.** The request carries no tools or functions; the answer can't name a voice,
    change a setting, read a file or trigger a request. Document text is sent only as a JSON value,
    and the instructions say to treat it as text. Even a fully "injected" answer can do no more than
    suggest a wrong speaker from the known names.
- **Alternatives:** Keep ADR-6 as it is (manual casting only), the default if this isn't accepted; a
  cloud model (rejected: sends book text off the computer); letting the model invent names (rejected:
  an unchecked answer could then put arbitrary text in the cast).
- **Consequences:** ADR-6 would read "no LLM in extraction, normalisation or synthesis; one optional,
  local, suggestion-only use for speakers". The threat model gains a row for a compromised local model
  server (worst case: wrong suggestions the reader can ignore).

## ADR-15 (proposed, awaiting the owner's decision): Cloud voice providers, disabled and isolated

- **Status:** Proposed. Nothing that talks to a cloud provider exists in the app.
- **Context:** Some readers may want a commercial voice for a few documents. Sending text to a provider
  is the opposite of TTSNative's promise (ADR-7), so it needs a deliberate boundary before any code.
- **Proposed decision:**
  - **No provider is built in or enabled.** A provider would be an engine marked `remote`, listed
    under its own "Cloud voices (sends text off this computer)" heading, never a default voice, never
    chosen automatically (exports, the speech API and reading fall back to local voices).
  - **Per-provider, explicit consent** naming what is sent (the sentences being read) and where, given
    before the first request and revocable; the key is stored like the Audiobookshelf key (encrypted
    on Windows) and never shown again.
  - **Per-document opt-in.** A document is read by a cloud voice only after the reader picks one for
    it; studio voices and voice recordings are never uploaded.
  - **Visible while it happens:** a "Sending text to <provider>" indicator, like the speech API's.
  - **No spending surprises:** a per-provider character budget the reader sets, enforced before
    sending.
- **Alternatives:** Never support cloud voices (the default if this isn't accepted); a plugin system
  (rejected: executable plugins are out, see ADR-12).
- **Consequences:** If accepted, a provider is added as a reviewed engine with tests that no text is
  sent without consent and that removing consent stops it immediately.

## ADR-16: A studio voice can be fine-tuned, and the owner keeps it only after comparing

- **Context:**
  - Turbo has no emotion conditioning, so a voice's delivery comes from its T3 prompt (ADR-11).
    Styles helped, but the owner still heard less of themselves than a full session should allow.
  - ADR-9 deferred fine-tuning. Its reasons were hours of GPU time, a training stack in the worker
    and a large per-voice download.
  - A spike on a copy of a real 48-take session (7.6 min) measured all three
    (docs/research/voice-quality.md):
    - **GPU and time:** a LoRA on T3 peaks at 2.9 GiB of VRAM with gradient checkpointing and takes
      about 13 s an epoch on an RTX 3080.
    - **Size:** the adapter is 12.6 MB.
    - **Dependencies:** it needs nothing beyond the worker's locked torch, transformers and
      chatterbox.
- **Decision:**
  - **What is trained.** An optional, experimental **Fine-tune this voice** step (the `voice-tune`
    job) for studio voices that kept their takes. It trains a rank-16 LoRA on the attention and MLP
    projections of every T3 block:
    - **Data:** whole takes of known passages, with their words taken from the recording script.
      The server keeps a copy of `passages.json`, and a test keeps it equal to the web app's.
    - **Framing:** exactly how `T3.inference_turbo` reads a sentence. Each take is prompted by the
      voice's own prompt or a style-like prompt joined from three other takes, never itself.
  - **When it stops.** The last take of each passage group is held out. The job trains one epoch per
    worker call (so progress and cancel work), stops after two epochs without a better held-out
    loss, and keeps the best epoch. If the loss dropped by less than 1 %, nothing is offered.
  - **Comparing.** The owner hears three sentences read as the reader reads them (styles, seeding,
    retries, polish), now and fine-tuned, and chooses **Keep** or **Discard**.
  - **Where it lives.** A kept adapter is stored as `adapter-<id>.safetensors` (bf16, format and
    shapes checked on load). Its name is part of the voice's cache revision. **Remove fine-tune**
    deletes it, and the voice goes back to its earlier revision and audio.
  - **How it is applied.** The worker merges the adapter into T3's weights (full speed) and restores
    the originals exactly from a copy taken before the first merge. Base audio stays bit-identical.
    While a voice trains, the adapter being trained is switched off for other voices, and a
    fine-tuned voice is served through it unmerged.
- **Alternatives:**
  - **The chatterbox-finetuning toolkit (Apache-2.0).** Its ideas were used; its code wasn't:
    - It brings `peft`, `accelerate` and `tensorboard` (plus pins such as `torch==2.6`).
    - It extends the vocabulary and trains the text embeddings for new languages.
    - Its Turbo framing differs from inference: start/stop text tokens, no start-of-speech token and
      the first 3 s of every target masked.
  - **Full fine-tuning.** The toolkit reports hallucinations on Turbo, and the weights would be
    1.9 GB per voice.
  - **An unmerged adapter at synthesis.** Measured 65 % slower per sentence.
  - **Training automatically after a build.** Rejected: it costs minutes of GPU time, and the gain
    needs a listening decision.
- **Consequences:**
  - **Hardware.** Fine-tuning needs an NVIDIA GPU; on other hardware the job explains that.
  - **Memory.** The worker holds a 1.1 GiB host copy of the targeted weights once any adapter has
    been used.
  - **Data.** Imported takes (no text) aren't trained on. Voices need at least 12 known passages.
  - **Sharing.** The adapter isn't part of a `.ttsvoice` package (ADR-12's exact file list): a
    shared voice speaks without it.
  - **Trust.** Profiles that say "No model is trained" now say so only until a fine-tune is kept.
  - **Listening.** In the owner's blind test on the same 24 pairs, 7 went to the fine-tune, 7 to the
    voice without it and 10 sounded the same. It ships as an experimental opt-in on the owner's
    overall impression; more training speech is the follow-up.

## ADR-17 (proposed, for a later version): Voices and effects for part of a sentence

- **Status:** proposed. Not built: it touches storage, planning, rendering, the cache key and the
  reader's selection, too much for the release-hardening pass.
- **Today:**
  - A voice, effect, style, sound or pause chosen with **Voice & effect** applies to whole sentences.
    The dialog says so.
  - Quoted speech inside a narrated sentence already gets its character's voice, while the narration
    keeps the reading voice (ADR-13, the `parts` a sentence plan carries).
  - What is missing is choosing a voice or effect for any stretch of text by hand: for example, only
    the announcement in "The guard cleared his throat. 'The train is delayed,' he said."
- **Design:**
  1. A `ranges` annotation per sentence: a list of `{start, end, voice_id?, effect?}` character
     offsets into the sentence's stored text, which never changes. Validate on write: in bounds, not
     overlapping, at most a few per sentence. Offsets are reset when a document's text is edited.
  2. The planner (`documents/styling.py`) splits a sentence with ranges into parts at their
     boundaries; each part has its own voice and effect. Ranges take priority over the quote split,
     and text outside them uses the sentence's or the reading voice.
  3. `synthesis/render.py` applies a part's effect to that piece before joining (the sentence-wide
     effect, if any, after). Each piece's effect joins its extras, so the cache key changes only for
     sentences that have ranges.
  4. The reader turns a selection into offsets within each touched sentence; a selection over several
     sentences covers the middle ones fully. Exports and the speech API need nothing new: they render
     through the same plan.
- **Risks:**
  - Joins inside a sentence (the existing 0.12 s gap with room tone) can make speech choppy if a
    range is very short; require at least a few words.
  - Engines read short fragments less naturally than whole sentences.
