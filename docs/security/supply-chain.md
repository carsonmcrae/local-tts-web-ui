# Supply chain

> **In short:** every dependency is locked, versions must have been public for two weeks, nothing runs
> install scripts, downloads are checksum-verified, and CI audits dependencies, secrets and code.

## Controls

| Control                                                                                                                              | Where                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Exact npm versions, `save-exact`, committed `package-lock.json`                                                                      | `package.json`, `.npmrc`                                |
| `ignore-scripts=true` — no package runs install hooks (audited: none of the 519 packages needs one)                                  | `.npmrc`                                                |
| Locked Python environments, `uv sync --frozen`                                                                                       | `apps/server/uv.lock`, `apps/chatterbox-worker/uv.lock` |
| Existing cloning installs record the worker lock's SHA-256 and are offered an update when it changes                                 | `apps/server/src/ltts/engines/chatterbox_env.py`        |
| 14-day release cool-down: `exclude-newer = "14 days"` in both Python projects and `min-release-age=14` for npm                       | `apps/*/pyproject.toml`, `.npmrc`                       |
| Pinned uv binary with SHA-256 for six platforms                                                                                      | `scripts/toolchain.json`                                |
| Pinned model artifacts with SHA-256 and host allow-list                                                                              | `apps/server/src/ltts/modelstore/manifest.json`         |
| `npm audit --audit-level=high`, `pip-audit` of the server environment and of both Chatterbox extras (OSV, no install)                | `npm run security` (`scripts/audit-worker.mjs`), CI     |
| Secret scanning (gitleaks), CodeQL (JS/TS + Python), dependency review on PRs (fails on high severity, covers both Python lockfiles) | `.github/workflows`                                     |
| Dependabot with a 7-day cool-down and grouped updates                                                                                | `.github/dependabot.yml`                                |
| License inventory that fails on unreviewed copyleft or unknown licences                                                              | `npm run licenses`                                      |
| GitHub Actions pinned to commit SHAs                                                                                                 | `.github/workflows`                                     |

## Known advisories in the optional Chatterbox environment

`chatterbox-tts` 0.1.7 pins exact, older versions of its machine-learning stack. Where a patched
release is compatible, the worker lifts the pin (`override-dependencies` in
`apps/chatterbox-worker/pyproject.toml`; for torch a `dependency-metadata` entry, because an override
would detach torch from the per-extra PyTorch index). `npm run security` audits both extras through
`scripts/audit-worker.mjs`, against OSV because PyTorch's `+cpu` and `+cu126` builds are not on PyPI.

| Package           | Pinned by chatterbox    | Locked            | Why                                                                                           |
| ----------------- | ----------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| diffusers         | 0.29.0                  | 0.38.0            | Two high-severity `trust_remote_code` advisories (GHSA-98h9-4798-4q5v, GHSA-7wx4-6vff-v64p)   |
| safetensors       | 0.5.3                   | 0.8.0             | Required by diffusers 0.38                                                                    |
| transformers      | 5.2.0                   | 5.11.0            | Four high-severity advisories below (5.11 rather than 5.10.x, which crashed on torch 2.6)     |
| torch, torchaudio | 2.6.0 (`+cu124`)        | 2.11.0 (`+cu126`) | 18 of the 19 advisories below; torchaudio has no release after 2.11, so torch stops there too |
| Pillow            | No (diffusers needs it) | 13.0.0            | Nine advisories in 12.3.0, fixed only in 13.0.0 ([below](#pillow-13-2026-10-20))              |

The cu126 build supports the same GPUs as cu124 did (sm_50 to sm_90, Maxwell through Hopper). Linux
wheels now need glibc 2.28 or newer.

Overrides reach people who already installed cloning through **Update available** in Settings →
Engines & models: the install marker records the lock's SHA-256, and a changed lock is offered as an
in-place `uv sync --frozen` ([ADR-8](../architecture/decisions.md)).

### Triage (2026-10-19)

The worker loads one folder of checksum-pinned weights with Hugging Face offline mode forced and only
synthesises. An instrumented load plus clone (CUDA and CPU) made exactly these risky calls:
`AutoTokenizer`/`AutoConfig.from_pretrained` on that local folder, and two `torch.load` calls through the
`weights_only` unpickler (`conds.pt` from the pinned weights, and Perth's checkpoint inside its
hash-pinned wheel). It made no TorchScript, `torch.export`, `torch.compile` or Hub calls.

| Advisory                                                               | Package (fixed in)          | Reachable in the worker?                                                                        | Status                                   |
| ---------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| GHSA-63cw-57p8-fm3p / PYSEC-2026-2286 (high): `weights_only` unpickler | torch (2.10.0)              | Yes, but only for the two trusted, hash-pinned files above                                      | Fixed                                    |
| GHSA-qfhq-4f3w-5fph / PYSEC-2025-195: `torch.lstm_cell`                | torch (2.10.0)              | No: the voice encoder's `nn.LSTM` uses the fused LSTM kernel                                    | Fixed                                    |
| GHSA-vgrw-7cvw-pwgx / PYSEC-2025-193: `unpack_sequence`                | torch (2.9.1)               | No: not called                                                                                  | Fixed                                    |
| GHSA-3749-ghw9-m3mg / PYSEC-2025-191: local DoS in `mkldnn_max_pool2d` | torch (2.7.1)               | No: not called                                                                                  | Fixed                                    |
| GHSA-887c-mr87-cxwp / PYSEC-2026-1970: `ctc_loss` resource release     | torch (2.8.0)               | No: training-only loss                                                                          | Fixed                                    |
| PYSEC-2026-139: pt2 archive deserialisation                            | torch (not listed for 2.11) | No: no `torch.export` archives are loaded                                                       | Fixed                                    |
| PYSEC-2025-198 to 202: wrong results or assertions in five operators   | torch (2.7.0)               | No: none is used, and three need `torch.compile`                                                | Fixed                                    |
| PYSEC-2025-203 to 209: DoS or overflow in seven operators or Inductor  | torch (2.7.1 to 2.9.0)      | No: none is used and nothing is compiled                                                        | Fixed                                    |
| GHSA-29pf-2h5f-8g72 / PYSEC-2026-2289 (high): config fetches Hub code  | transformers (5.3.0)        | No: offline mode, and the local folder has no `config.json`                                     | Fixed                                    |
| GHSA-fgcw-684q-jj6r / PYSEC-2026-2290 (high): LightGlue remote code    | transformers (5.5.0)        | No: no LightGlue model                                                                          | Fixed                                    |
| GHSA-x9r9-c232-4q39 / PYSEC-2026-4174 (high): custom generate download | transformers (after 5.8.1)  | No: no `custom_generate`, offline mode                                                          | Fixed                                    |
| GHSA-xrqw-3rrv-vx5w / PYSEC-2026-3929 (high): `save_pretrained` paths  | transformers (5.10.0)       | No: nothing is saved                                                                            | Fixed                                    |
| GHSA-rrmf-rvhw-rf47 / PYSEC-2025-194 (low): `torch.jit.script`         | torch (2.13.0)              | No: never called (instrumented run, and no caller in Chatterbox, s3tokenizer or the model code) | **Ignored**                              |
| GHSA-h35f-9h28-mq5c / PYSEC-2026-3447: sdist `MANIFEST.in` bypass      | setuptools (83.0.0)         | No: the worker never builds an sdist                                                            | Fixed (84.0.0, overriding torch's `<82`) |

The one **ignored** ID is passed to `pip-audit --ignore-vuln` in `scripts/audit-worker.mjs`, and the
matching Dependabot alert is dismissed as "vulnerable code not used":

- `PYSEC-2025-194`: the fix needs torch 2.13, which has no matching torchaudio; revisit when Chatterbox
  drops torchaudio or torchaudio ships again. torchaudio 2.11 ships compiled extensions built against
  torch 2.11, so `.github/dependabot.yml` holds the worker's torch below 2.12 until then.

setuptools moved to 84.0.0 (2026-10-19). torch declares `setuptools<82`, but only
`torch.utils.cpp_extension` uses it, to build C++ extensions at runtime, which nothing here does.
setuptools 82 removed `pkg_resources`, which the Perth watermarker imports for one function;
`ltts_chatterbox_worker/compat.py` provides that function (`resource_filename`) from
`importlib.resources` before any model code loads. With torch 2.11 and setuptools 84 the six
real-model tests pass and clone quality is unchanged (mean speaker similarity 0.912; 0.915 and 0.917
before).

### Pillow 13 (2026-10-20)

On 2026-10-20 `pip-audit` began reporting nine advisories against Pillow 12.3.0, which failed the
security job on `main`. All nine are fixed only in 13.0.0 (there is no 12.x backport), so the worker
overrides `pillow>=13.0.0,<14` rather than ignoring them, and takes 13.0.0 through a cool-down
exception ([below](#release-cool-down)).

Pillow is not a Chatterbox requirement. diffusers imports `PIL.Image` and `PIL.ImageOps` for its image
pipelines, so Pillow loads when Chatterbox imports diffusers' attention and activation layers; the only
Pillow API used then is the `Image.Resampling` enum. Chatterbox, Perth, s3tokenizer and librosa never
import PIL, and the worker reads and writes only audio, so none of the affected code runs. Severities
are the GitHub advisory database's.

| Advisory                              | Severity | Affected code                                           | Reachable in the worker? |
| ------------------------------------- | -------- | ------------------------------------------------------- | ------------------------ |
| GHSA-8g5g-8vmr-9782 / CVE-2026-112403 | Critical | JPEG decoder heap overflow                              | No: no image is decoded  |
| GHSA-58r4-6rv3-gfh8 / CVE-2026-112397 | High     | `ImageMorph` out-of-bounds write on zero-width images   | No: not called           |
| GHSA-65qm-jvmh-6pqg / CVE-2026-112400 | High     | GIF `seek` decompression-bomb check                     | No: no image is decoded  |
| GHSA-c6hw-5grf-ff96 / CVE-2026-112404 | High     | TIFF tile and RGBA out-of-bounds read                   | No: no image is decoded  |
| GHSA-p4wg-p73j-c528 / CVE-2026-112895 | High     | PDF page tree or trailer recursion                      | No: Pillow opens no PDFs |
| GHSA-pchr-8j38-3x4p / CVE-2026-112896 | High     | TIFF encoder `ColorMap` out-of-bounds read              | No: no image is encoded  |
| GHSA-q45j-58j2-45rg / CVE-2026-112897 | High     | TIFF short JPEG strips return uninitialised memory      | No: no image is decoded  |
| GHSA-462x-pgg6-55fp / CVE-2026-112395 | Moderate | Tiled TIFF read past the tile buffer                    | No: no image is decoded  |
| GHSA-vx6w-vv9f-6gvg / CVE-2026-112899 | Moderate | EPS `load(scale)` bypasses the decompression-bomb limit | No: no image is decoded  |

Pillow 13 drops Python 3.10 (the worker runs 3.11, and 13.0.0 has cp311 wheels for every platform in
the lock) and removes `Image._show`, the `ImageCms` product fields, `ExifTags.IFD.Makernote` and
type-changing `Image.fromarray(mode=...)`. A search of the installed worker environment found none of
the removed names; its `fromarray(mode=...)` calls are in diffusers and transformers image pipelines the
worker never loads. gradio declares `pillow<13` but is never installed (`sys_platform == 'never'`), and
diffusers accepts any Pillow. The licence is unchanged (MIT-CMU). Only Pillow moved in the lock, and its
15 files match the SHA-256 digests PyPI publishes.

### Verification

Clone quality is checked with every change on real models (RTX 3080): a reference recording (Kokoro
`bm_george` reading a fixed passage, imported as a consented profile), three cloned sentences per run,
scored by cosine similarity of Chatterbox voice-encoder embeddings to the reference. Unrelated Kokoro
voices score 0.59 to 0.70. The diffusers and transformers overrides were measured this way (0.915 before,
0.917 after each). The torch upgrade, on the same transformers 5.11:

| Environment        | Mean per run        | Mean (9 clips) | Perth watermark |
| ------------------ | ------------------- | -------------- | --------------- |
| torch 2.6.0+cu124  | 0.920, 0.906, 0.913 | 0.913          | Detected        |
| torch 2.11.0+cu126 | 0.907, 0.926, 0.919 | 0.917          | Detected        |

The difference is within the run-to-run spread, and speed is the same under the same GPU load (about 2.6
to 3.5 s per sentence after a 21 to 25 s first clone that includes loading the model). The CPU build
also loads, clones (0.910 on one sentence) and watermarks. `npm run test:inference` passes.

### Release cool-down

The worker lock was first resolved without `exclude-newer`, so 21 of its packages were less than 14
days old on 2026-10-19. It now uses the same cool-down as the server, and 20 of them went back
to their newest releases that are old enough (for example `certifi` 2026.10.18 → 2026.7.22).
`omegaconf` keeps 2.4.0 (2026-10-09) through an `exclude-newer-package` exception, because every older
release needs `antlr4-python3-runtime` 4.9, which ships only as an sdist and would run its `setup.py` on
install. Remove the exception after 2026-10-23, when the 14-day window covers that release.

`certifi` 2026.10.19 (uploaded 2026-10-20) fixes GHSA-6q48-6c7w-9gw2, which `pip-audit` began reporting
against 2026.7.22 on 2026-10-20 and which failed the security job for every pull request. Both Python
projects take it through a security exception (`exclude-newer-package`, cut-off 2026-10-21) rather than
waiting out the cool-down; certifi is Mozilla's CA bundle as data, with no install-time code. Remove the
exception after 2026-11-03.

`Pillow` 13.0.0 (uploaded 2026-10-16) comes into the worker through the same kind of security exception
(cut-off 2026-10-17), for the [nine advisories above](#pillow-13-2026-10-20); it ships wheels, so nothing
is built on install. Remove the exception after 2026-10-30. Dependabot runs uv with these settings, so
its security update fails (`dependency_file_not_resolvable`) while the fixed release is still inside the
window, as it did for Pillow; add the exception by hand.

Both Python projects use a rolling window (`exclude-newer = "14 days"`, uv 0.9.17 or newer), so a
re-lock always considers releases at least 14 days old without a date to bump. npm applies the same
rule to new resolutions through `min-release-age=14` in `.npmrc` (npm 11.10 or newer).

## Updating dependencies

1. Let Dependabot propose updates (or bump manually), never adopting a release younger than 14 days.
2. For Python: run
   `node scripts/uv-run.mjs --cwd apps/server lock` (and `--cwd apps/chatterbox-worker lock`), review the
   lock diff (new packages, changed sources, anything that only ships as an sdist).
3. Run `npm run check`, `npm run test:inference` and `npm run test:e2e`.
4. Run `npm run security` and `npm run licenses`; review any new install scripts with
   `npm query ':attr(scripts, [install])'` before considering them.

## Updating a model

Model changes need a provenance review: confirm the source repository and licence, take the size and
SHA-256 from the publisher (GitHub asset digest or Hugging Face LFS `oid`) **and** from a local
download, pin the exact revision URL, then update `manifest.json` and
[model-provenance.md](model-provenance.md).
