# Supply chain

> **In short:** every dependency is locked, versions must have been public for two weeks, nothing runs
> install scripts, downloads are checksum-verified, and CI audits dependencies, secrets and code.

## Controls

| Control                                                                                                                              | Where                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Exact npm versions, `save-exact`, committed `package-lock.json`                                                                      | `package.json`, `.npmrc`                                |
| `ignore-scripts=true` — no package runs install hooks (audited: none of the 519 packages needs one)                                  | `.npmrc`                                                |
| Locked Python environments, `uv sync --frozen`                                                                                       | `apps/server/uv.lock`, `apps/chatterbox-worker/uv.lock` |
| 14-day release cool-down for Python resolution (`exclude-newer`); worker versions are picked by hand under the same rule             | `apps/server/pyproject.toml`                            |
| Pinned uv binary with SHA-256 for six platforms                                                                                      | `scripts/toolchain.json`                                |
| Pinned model artifacts with SHA-256 and host allow-list                                                                              | `apps/server/src/ltts/modelstore/manifest.json`         |
| `npm audit --audit-level=high` and `pip-audit` of the server environment                                                             | `npm run security`, CI                                  |
| Secret scanning (gitleaks), CodeQL (JS/TS + Python), dependency review on PRs (fails on high severity, covers both Python lockfiles) | `.github/workflows`                                     |
| Dependabot with a 7-day cool-down and grouped updates                                                                                | `.github/dependabot.yml`                                |
| License inventory that fails on unreviewed copyleft or unknown licences                                                              | `npm run licenses`                                      |
| GitHub Actions pinned to commit SHAs                                                                                                 | `.github/workflows`                                     |

## Known advisories in the optional Chatterbox environment

`chatterbox-tts` 0.1.7 pins exact versions of its machine-learning stack. Where a patched version is
compatible, the worker overrides the pin:

| Package        | Pinned by chatterbox | Override | Why                                                                                           |
| -------------- | -------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `diffusers`    | 0.29.0               | 0.38.0   | Two high-severity `trust_remote_code` advisories                                              |
| `safetensors`  | 0.5.3                | 0.8.0    | Required by diffusers 0.38                                                                    |
| `transformers` | 5.2.0                | 5.11.0   | Four high-severity advisories; 5.10.x crashes on torch 2.6 (unguarded torch 2.7 float8 dtype) |

Clone quality was measured with each change: three cloned sentences scored against the same reference
recording had mean speaker similarity 0.915 before, 0.917 with the new diffusers and 0.917 with the new
transformers (unrelated voices score 0.60 to 0.65).

As of 2026-10-19, `pip-audit` still reports lower-severity advisories against `torch` 2.6.0 (7, pinned
exactly by chatterbox) and `setuptools` 80.x (1; held below 81 because the Perth watermarker imports
`pkg_resources`). They only affect people who install voice cloning. The worker is not yet part of
`npm run security`, because these advisories need triage and the PyTorch local builds (`+cpu`,
`+cu124`) are not on PyPI.

## Updating dependencies

1. Let Dependabot propose updates (or bump manually), never adopting a release younger than 14 days.
2. For Python: move `exclude-newer` forward, run `node scripts/uv-run.mjs --cwd apps/server lock`, review
   the lock diff (new packages, changed sources).
3. Run `npm run check`, `npm run test:inference` and `npm run test:e2e`.
4. Run `npm run security` and `npm run licenses`; review any new install scripts with
   `npm query ':attr(scripts, [install])'` before considering them.

## Updating a model

Model changes need a provenance review: confirm the source repository and licence, take the size and
SHA-256 from the publisher (GitHub asset digest or Hugging Face LFS `oid`) **and** from a local
download, pin the exact revision URL, then update `manifest.json` and
[model-provenance.md](model-provenance.md).
