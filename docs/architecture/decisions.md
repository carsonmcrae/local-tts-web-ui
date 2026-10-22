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
    on Windows, an owner-only file elsewhere) and never shown again.
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

## ADR-18: Background music plays in the browser, beside the narration, never mixed into it

- **Context:** Listeners want quiet music under a long narration. Narration plays one sentence at a
  time through a single audio element (ADR-3); a second sound must not delay, interrupt or change it,
  and must not start by itself.
- **Decision:**
  - **A separate player.** Music is a Web Audio graph of its own (decoded track → fade gain → volume
    gain → speakers) that follows the narration player's state from outside: it plays while the
    narration plays or fetches the next sentence, pauses (keeping its place) when narration pauses,
    stops on errors and at the end. The narration's audio is never routed through it, so a broken or
    missing track can only silence the music. The player itself gains two things: a narration
    volume for the audio mixer, and the rule that a sentence playing to its end (which fires a
    `pause` just before `ended`) is not a pause.
  - **One audio mixer.** A single button in the player holds every level: narration (the audio
    element's `volume`; fixed by iPhones, which the mixer says) and background music, with room for
    further channels such as sound effects (ADR-22).
  - **Opt-in per narration.** A narration session is one document in the player: it begins when a
    different document (or none) is loaded, and ends when the document finishes, is closed or
    deleted, or the page reloads. Music is off at the start of every session. Pausing, seeking,
    changing voice, speed or pace, and a sleep timer keep the session. The chosen track and both
    volumes are remembered on this device (localStorage, like the reading text); "on" never is.
  - **Bundled, checked tracks.** A small library ships with the web build under `/music/` as Opus in
    WebM (decodable by Chromium, Firefox and Safari), loudness-matched below the narration and
    prepared to loop. `library.json` records each track's source, creator and licence; only CC0 or
    public-domain recordings (or licences that allow redistribution, editing and commercial use) are
    included. Tracks are served by the local server, so music needs no internet.
  - **Gentle changes.** Turning music on or off, pausing and switching tracks fade or crossfade;
    loops are sample-accurate (`AudioBufferSourceNode.loop`). One track plays at a time, and an old
    one is stopped and disconnected once its fade ends.
- **Alternatives:**
  - **Mixing on the server into each sentence.** Rejected: it changes every sentence's audio and cache
    key, restarts the music at every sentence and ties music to voices.
  - **Routing the narration through Web Audio** (for a shared mix or speech-driven ducking).
    Rejected for now: a suspended audio context would silence the narration itself.
  - **A looping `<audio>` element.** Rejected: loops leave an audible gap in several browsers.
- **Consequences:** A decoded track lives in memory while it plays (about 23 MB a minute for 48 kHz
  stereo), so tracks are kept short and only the current one (and the last preview) is kept. Automatic
  ducking isn't built: the browser can't see pauses inside a sentence's audio without routing the
  narration. Exported audio has no music yet; an export would mix the same files on the server with
  the same gain and loop rules, and must keep the tracks' licence terms.

## ADR-19: A Tauri window around the existing UI and server, with a bundled Python

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

## ADR-20: Updates only from GitHub Releases, verified and confirmed

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

## ADR-21: Change files decide the version; people approve the notes

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

## ADR-22: Sound effects are suggested as data, reviewed before they play, and played beside the narration

- **Context:** Listeners want a lightly sound-designed narration: a door creak, distant thunder, rain
  under a scene. Narration plays one sentence at a time (ADR-3) and must not change, slow down or
  wait for anything; documents are data, never instructions (ADR-6); the background music (ADR-18)
  already plays beside the narration from a graph of its own.
- **Decision:**
  - **A third layer.** Effects are a Web Audio graph of their own in the browser (source → fade gain
    → bus → limiter → volume → speakers) that follows the narration player from outside: it fires
    an effect when the player is playing its sentence and the clip's time passes the effect's
    position, stops everything on a seek, fades out on a pause and never touches the narration
    element. Music and effects each keep their own context until both are merged.
  - **Sentences are the anchors.** An effect belongs to a sentence and a fraction of its clip, with an
    optional offset and, for ambience, an end sentence. Sentence boundaries are exact; a position
    inside a sentence is an estimate from the trigger word's place in the text, and the interface
    says so. Word timings, when they exist, make it exact without a schema change.
  - **Detection is deterministic and on request.** `ltts/sfx/detect.py` matches an event vocabulary
    with context rules for negation, figurative language, imagined and past events, questions and
    quoted speech; `proposals.py` keeps a restrained selection under an intensity setting and is the
    one validator every detector output passes through: sentence index, event, confidence, position,
    nothing else. A chapter is analysed only when the reader asks. Suggestions are stored and shown;
    none plays until accepted, and a dismissed one is kept so reanalysis cannot restore it.
  - **Off by default, remembered edits.** Effects are off at the start of every narration; the
    arrangement (manual and accepted effects, dismissed suggestions) lives in SQLite with the
    document and is deleted with it. Volume and intensity are kept on the device.
  - **A synthesised, MIT starter library.** The bundled sounds are generated from a script in this
    repository, so licensing is settled and nothing is downloaded; the manifest records the fields
    a verified recorded sound would need for a later pack.
- **Alternatives:**
  - **A local language model for detection.** Rejected for now: ADR-6, size, privacy and unmeasured
    precision; the validation gate is where one would plug in, with no new privileges.
  - **Semantic audio matching (CLAP) or sound generation (AudioCraft, AudioLDM).** Rejected: PyTorch,
    large or non-commercial weights, slow on CPU.
  - **howler.js.** Not needed: the raw API gives the fades, limiter and sample-accurate loops.
  - **Mixing effects into each sentence's audio on the server.** Rejected: it changes cache keys,
    couples effects to voices and makes review and undo impossible.
- **Consequences:** Exports carry no effects yet (as with music). Placement inside long sentences is
  approximate. A false positive is treated as worse than a missed effect, so the default intensity
  suggests few effects and the review list is the normal path, with **Accept all** kept secondary.
- **Addendum (reading experiences, 2026-10-22):** A reading experience from the literary library may place curated effects in a document's
  arrangement: rows with origin `preset` and status `accepted` (choosing the experience is the
  acceptance), no confidence, the sentence's hash as usual, and the experience's identity in the
  detector column (`preset:<preset id>@<version>`). Applying an experience removes the document's
  `preset` rows and places its rows again, so two versions never mix, and skips any sentence that
  already carries an accepted effect; turning it off removes its rows and nothing else. A reader's
  edit of a preset row makes it theirs (`manual`), so later applies and removals leave it; a
  reader's removal deletes it, and applying the experience again brings its version back.
  Reanalysis never touches preset rows and spaces its suggestions around them. Nothing an
  experience does turns the Sound effects switch on. No migration: origin and status are text,
  and the mark lives in an existing column.

## ADR-24: Documents are organised by folders, collections, genres, types and tags, kept apart from the documents

- **Context:** The library was one list sorted by recency, searched by title. A reader with a few
  dozen books, papers and notes, plus the works TTSNative now includes (ADR-25), needs to find and
  group them. Other branches in flight (background music, sound effects, the Windows app, the voice
  library) store nothing about documents, so this is the one place that organisation lives.
  (ADR-18 is background music, ADR-19 to ADR-21 the Windows app, ADR-22 sound effects; ADR-23 is left
  free for the voice library branch.)
- **Decision:**
  - **Separate tables, never columns on `documents`.** Folders (`folders`, a tree by `parent_id`),
    a document's shelf entry (`document_shelf`: its folder, document type and favourite), its genres
    (`document_genres`), its tags (`document_tags`, stored as typed and matched case-insensitively),
    collections (`collections`) and their membership (`collection_documents`). Every row is deleted
    with its document by foreign key; a deleted folder leaves its documents in the folder above it,
    never deletes them. A document has one folder (its place) and any number of collections (ways
    of grouping it) without being copied.
  - **Genre and type are different attributes.** Genres come from a fixed list (fantasy, science
    fiction, mystery, horror, historical fiction, romance, literary fiction, adventure, poetry,
    biography, memoir, history, philosophy, science, technology, children's, other); a document may
    have several. Its type is one of novel, novella, short story, short story collection, poem, poetry
    collection, memoir, biography, essay, research paper, report, personal document or other. Both
    are optional: an imported document has neither until the reader says. Tags are free text.
  - **One summary carries it all.** The library listing (`GET /api/documents`) adds each document's
    author, folder, favourite, type, genres, tags and collections, so the browser sorts, filters and
    searches the list it already has; the server keeps no search index. Changes go through
    `PUT /api/documents/{id}/shelf` for one document and `POST /api/library/organize` for many.
  - **Additive migration.** Migration 14 creates the tables (`IF NOT EXISTS`, so branches that add
    migrations in parallel can be merged in either order) and touches nothing that exists; documents,
    progress, bookmarks, styling, casts and covers keep their rows and identities. Rolling back is
    dropping the new tables.
- **Alternatives:**
  - **Folders only** (the file-system model). Rejected: a book in two groups would need two copies.
  - **Columns on `documents`** for folder and favourite. Rejected: every document query and every
    branch that touches that table would change; separate tables migrate and roll back on their own.
  - **A full-text search table (FTS5).** Not needed: the library is at most 500 documents, and the
    listing already holds everything searched.
- **Consequences:** The listing grows by a few fields per document (still one query plus three small
  ones). Phones and tablets in LAN mode may organise too (`/api/library` is allowed), while deleting
  documents stays on the computer as before.

## ADR-25: Public-domain books ship as a catalog of checked editions, read through the ordinary pipeline, with immersive presets as separate data

- **Context:** A new install shows an empty library and a one-paragraph sample. Readers should be
  able to start a real book offline, and the app should show what it can do (characters, effects,
  music) on books whose rights are settled. Other branches build the voice library, the music bed
  (ADR-18) and sound effects (ADR-22) at the same time, so anything the books say about voices,
  effects and music must be data those features can read, not code that depends on them.
- **Decision:**
  - **A versioned catalog inside the server package** (`ltts/library`: `catalog.json`, one EPUB per
    work, one small cover, `CREDITS.md`). Every work records its canonical `work_id`, its edition
    (source, URL, revision, SHA-256 of the file downloaded and of the file shipped, what was changed),
    rights (status, whether worldwide, basis, evidence, date verified, what is permitted, attribution
    and trademark notes), genres, type, word count, chapters and a content note where the text needs
    one. `scripts/library/build_catalog.py` rebuilds everything from the recorded sources and refuses
    a source whose checksum changed. Only works whose text is public domain in the United States and
    whose edition's own work is dedicated to the public domain (CC0) are included; works whose author
    died less than seventy years ago are left out even when they are public domain in the US, so
    that the catalog is also usable elsewhere, and the record says so where a limit remains.
  - **Smaller files, same text.** The shipped EPUB keeps the edition's text and chapter structure and
    drops its images, list of illustrations, imprint, colophon and uncopyright pages (the publisher's
    branding and logo), so a library of about twenty books is a few megabytes. Standard Ebooks is
    credited in `CREDITS.md`, never implied as the publisher of what ships. A Project Gutenberg text
    is used only with its header, footer and trademark removed, as its licence allows, and its
    provenance is kept in the catalog.
  - **Read like any other document.** A bundled book becomes a document only when the reader opens
    it from **Explore**: the server copies the EPUB to the temporary folder and runs the same sniffing,
    sandboxed extraction, segmentation and cleanup as an upload (ADR-5), then links the document to
    its work (`bundled_documents`: work, edition, content hash, catalog version). Progress, bookmarks,
    styling and casts work unchanged; opening the same work again returns the document that exists. A
    bundled document can be removed (its progress goes, the work stays in Explore) and a work can be
    hidden from Explore (`hidden_works`); an update never adds a book to the library by itself.
  - **Verse keeps its lines.** A line break inside a paragraph (`<br>`) now ends a sentence with a
    `line` boundary: a shorter pause than a paragraph's, and a line break in the reader instead of a
    new paragraph. Existing documents are untouched; new imports of any format with such breaks
    benefit.
  - **Immersive presets are data beside the book.** A preset (`ltts/library/presets/*.json`; the
    schema is in `docs/architecture/literary-library.md`) recommends a narrator, assigns characters
    to voices with fallbacks, annotates who speaks which sentences, places sound effects and recommends
    music, all through durable text anchors (a 16-character hash of the sentence, a short quote and an
    occurrence number) and stable identifiers (voice ids, the music library's track ids, the effects
    library's sound ids). The text is never changed to carry any of this. Applying a preset is the
    reader's explicit choice, component by component; it writes into the same tables the reader's own
    choices use (`document_characters`, `segment_annotations`), is recorded (`document_presets`) so
    "back to the preset" works, and never turns on music or effects, which stay opt-in per narration
    (ADR-18, ADR-22). Components for features not merged yet ship as validated fixtures and are not
    offered in the interface until those features exist.
- **Alternatives:**
  - **Adding every bundled book to the library on first start.** Rejected: twenty extractions on
    first run, a library full of books nobody asked for, and an update that re-adds removed ones.
  - **A text format of our own.** Rejected: the EPUB extractor is already sandboxed and tested
    against hostile files, and Standard Ebooks' semantic markup carries chapters and verse.
  - **Downloading books on demand.** Deferred: a starter set of a few megabytes ships; a larger
    optional catalog would be a checked archive downloaded only when asked, like the model store.
  - **Encoding speakers in the text** (speech marks). Rejected: the text must stay the author's.
- **Consequences:** The repository and installer grow by the catalog's size (measured in the build).
  Anchors are only valid for the edition they were made against: the catalog's `text_version` is
  part of the preset, and a changed text flags unresolved anchors instead of guessing. Character
  names in presets must match what the dialogue analysis finds or be applied through annotations.
