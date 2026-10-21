# Threat model

> **In short:** the app is single-user and local, but it parses untrusted files, downloads third-party
> artifacts and runs a web server. The main threats are malicious documents, a malicious website in
> the same browser talking to `127.0.0.1`, tampered downloads, and accidental network exposure.

## Assets

Documents and their text, bookmarks and notes, voice recordings (biometric data), generated audio, the
local filesystem, and the integrity of installed model files and Python/npm dependencies.

## Trust boundaries

1. **Browser ↔ local server.** Any website the user visits can make requests to `127.0.0.1`.
2. **Uploaded files → parsers.** Documents and audio come from anywhere.
3. **Internet → model store / package managers.** Downloads during setup and engine installation.
4. **Server ↔ cloning worker.** A separate process with large third-party dependencies.
5. **LAN (opt-in only).** Other devices when network mode is enabled.
6. **Windows app: page ↔ desktop shell.** The UI page may call a few app commands.
7. **Internet → installed app (updates).** Update information and installers from GitHub Releases.

## Threats and mitigations

| Threat                                                    | Mitigation                                                                                                                                                                                                                                                                                                           | Tested in                                              |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Website uses the user's browser to call the API (CSRF)    | State-changing requests require `X-LTTS-Client` (forces a CORS pre-flight that is never granted); `Sec-Fetch-Site: cross-site` is rejected; no CORS headers                                                                                                                                                          | `test_security.py`                                     |
| DNS rebinding to reach `127.0.0.1`                        | Host header allow-list (loopback names, plus this machine's addresses in network mode)                                                                                                                                                                                                                               | `test_security.py`                                     |
| Clickjacking / injected scripts                           | CSP `default-src 'self'`, `frame-ancestors 'none'`, no inline scripts, `nosniff`, `no-referrer`                                                                                                                                                                                                                      | `test_security.py`                                     |
| Path traversal / arbitrary file read                      | Server-generated IDs for every stored file; filenames are display-only; static files are resolved and confined to the build directory                                                                                                                                                                                | `test_engines_cli.py`, `test_api.py`                   |
| Zip slip                                                  | Archives are never extracted to disk; member names with `..`, absolute paths or drive letters are ignored                                                                                                                                                                                                            | `test_document_security.py`                            |
| Archive bombs / oversized decompression                   | Entry count, total declared size and per-entry ratio limits before parsing; zipfile never yields more than declared sizes                                                                                                                                                                                            | `test_document_security.py`                            |
| XML entity expansion / XXE                                | `<!ENTITY` declarations rejected in every XML part; defusedxml for EPUB; python-docx parses with `resolve_entities=False`                                                                                                                                                                                            | `test_document_security.py`                            |
| Malformed documents, parser crashes or hangs              | Extraction runs in a spawned process with a timeout (and an address-space limit on Linux); failures become clean errors                                                                                                                                                                                              | `test_document_security.py`                            |
| Resource exhaustion                                       | Upload size (streamed, enforced server-side), text length, PDF pages, concurrent extractions, document count, audio cache size, free-disk checks, request body cap                                                                                                                                                   | `test_api.py`                                          |
| Type confusion (e.g. `.pdf` that isn't a PDF)             | Magic-byte sniffing must agree with the extension                                                                                                                                                                                                                                                                    | `test_extractors.py`                                   |
| Macros / active content                                   | DOCX macros and embedded objects are never read; EPUB scripts/styles are dropped; Markdown raw HTML is disabled                                                                                                                                                                                                      | `test_extractors.py`                                   |
| Prompt injection via document text                        | No LLM in the pipeline; text is only read aloud. Instruction-like text is kept verbatim as data                                                                                                                                                                                                                      | `test_document_security.py`                            |
| Tampered or substituted model files                       | Pinned URLs, approved hosts checked on every redirect, exact size + SHA-256 before an atomic rename, install marker written only after verification; installed files re-checked against the manifest before every engine load (and after any change), damaged files refused and repaired by re-downloading only them | `test_modelstore.py`, `test_model_integrity.py`        |
| Dependencies reporting usage to their vendors (telemetry) | ONNX Runtime's default usage telemetry is switched off before Kokoro loads (`ORT_DISABLE_TELEMETRY` and `disable_telemetry_events()`); the Chatterbox worker runs Hugging Face and Transformers offline with telemetry disabled                                                                                      | `test_engine_runtime.py`                               |
| Document text in logs that users paste into bug reports   | Logs carry identifiers and counts; Kokoro failures log the error type only (kokoro-onnx messages quote the passage); unexpected errors log stack frames without the message; kokoro-onnx's phoneme logging is pinned to WARNING                                                                                      | `test_engine_runtime.py`, `test_cli_and_startup.py`    |
| Malicious model loading (pickles)                         | ONNX and safetensors formats; Chatterbox's `conds.pt` loads with `torch.load(weights_only=True)`; Hugging Face offline mode in the worker                                                                                                                                                                            | `test_inference.py`                                    |
| Dependency compromise                                     | Lockfiles, exact pins, 14-day release cool-down, no npm install scripts, `npm audit`, `pip-audit`, CodeQL, Dependabot                                                                                                                                                                                                | CI                                                     |
| Command injection                                         | Subprocesses use fixed argument lists (never a shell); tool paths are absolute (`taskkill`) or resolved once                                                                                                                                                                                                         | code review + lint rule                                |
| Unwanted network exposure                                 | Loopback by default; the CLI refuses non-loopback binds without `--allow-network`, which requires a token (cookie set via a one-time link)                                                                                                                                                                           | `test_security.py`                                     |
| Voice misuse / impersonation                              | Explicit consent statement required and recorded; output watermarked by Chatterbox (Perth); complete deletion, including a studio voice's session takes                                                                                                                                                              | `test_voices_exports_jobs.py`, `test_studio_voices.py` |
| Slow or hostile patterns in user text (ReDoS)             | Pronunciation rules and searches are plain text: the server escapes every rule, matches whole words with one compiled pattern and caps rules (500) and lengths; search, and marking matches in the browser, are plain substring tests                                                                                | `test_reader_features.py`, `search.test.tsx`           |
| Malicious studio voice files                              | Built voices are safetensors (tensors only, no pickle), checked for this app's format marker before loading, written and read only under `data/voices/`                                                                                                                                                              | `test_inference.py`                                    |

| A page in the Windows app calls the shell beyond its needs | Capabilities grant the loopback origin only version, folders and update commands (no file system, shell or HTTP); only the start-up screen and the server's own origin load in the window; other links open in the browser and no second web view can open | code review, `desktop.yml` smoke test |
| A forged or tampered update | Updates only from the latest GitHub Release over HTTPS; minisign signature checked against the public key built into the app (cannot be disabled); only a newer SemVer; installed only after the user confirms; the release workflow proves the signature against that key before publishing | `verify-update-signature.test.mjs`, `update-test.mjs` |
| A global setting or environment variable redirects the installed app | The shell removes inherited `LTTS_*` variables, runs Python isolated (`-I`) and uses its own runtime in release builds (`TTSNATIVE_RUNTIME_DIR` works in debug builds only) | code review |

## Residual risks

- **Only Linux has a per-process memory limit** in the sandbox (`RLIMIT_AS`). Windows has no
  equivalent, and macOS reserves more virtual address space at start-up than any useful cap allows.
  The timeout, archive and text limits still apply everywhere.
- **The optional Chatterbox environment carries one reviewed, unreachable advisory**: `torch`
  2.11's `torch.jit.script` issue (the fix needs a torchaudio that does not exist yet, and nothing
  calls `torch.jit`). `npm run security` audits both extras and fails on anything else
  ([supply-chain.md](supply-chain.md#known-advisories-in-the-optional-chatterbox-environment)). The
  default Kokoro reader does not install them.
- **PDFium and libxml2 are native code.** They are mature and fuzzed, and run in a separate, killable
  process, but a memory-safety bug could still compromise that process.
- **Network mode uses plain HTTP.** The token protects access but not confidentiality on the LAN, and
  browsers block microphone access on non-HTTPS origins. See [LAN access](../guides/lan-access.md).
- **GPL components** (espeak-ng, phonemizer) are runtime dependencies. The Windows installer redistributes
  them with their licences, and each release attaches their source; see the license inventory.
- **The Windows app is not Authenticode-signed yet.** Users must click through SmartScreen and can't
  tell a genuine installer from a renamed one by its publisher; the published checksums and build
  provenance are the check until a certificate is in place. The updater's own signature is enforced.
- **The updater key is a single point of trust.** Whoever holds it can sign updates that installed
  copies accept; it lives only in the `release` environment's secrets behind a required reviewer.
- **The Windows app opens WebView2's debugging port when started with `--remote-debugging-port=N`**
  (Chromium's own switch, used by the installer tests to drive the window; it listens on 127.0.0.1
  only). Anyone able to start the app with arguments already runs as that user, so this adds nothing a
  local attacker lacks, and the server's own protections (`x-ltts-client`, origin checks) still apply.
- **The Chatterbox environment** contains a large third-party dependency tree (PyTorch, transformers).
  It is isolated, locked and only installed on request, but it is not audited line by line.
