# Supply chain

> **In short:** every dependency is locked, versions must have been public for two weeks, nothing runs
> install scripts, downloads are checksum-verified, and CI audits dependencies, secrets and code.

## Controls

| Control                                                                                             | Where                                                   |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Exact npm versions, `save-exact`, committed `package-lock.json`                                     | `package.json`, `.npmrc`                                |
| `ignore-scripts=true` — no package runs install hooks (audited: none of the 519 packages needs one) | `.npmrc`                                                |
| Locked Python environments, `uv sync --frozen`                                                      | `apps/server/uv.lock`, `apps/chatterbox-worker/uv.lock` |
| 14-day release cool-down for Python resolution (`exclude-newer`)                                    | `apps/server/pyproject.toml`                            |
| Pinned uv binary with SHA-256 for six platforms                                                     | `scripts/toolchain.json`                                |
| Pinned model artifacts with SHA-256 and host allow-list                                             | `apps/server/src/ltts/modelstore/manifest.json`         |
| `npm audit --audit-level=high` and `pip-audit`                                                      | `npm run security`, CI                                  |
| Secret scanning (gitleaks), CodeQL (JS/TS + Python), dependency review on PRs                       | `.github/workflows`                                     |
| Dependabot with a 7-day cool-down and grouped updates                                               | `.github/dependabot.yml`                                |
| License inventory that fails on unreviewed copyleft or unknown licences                             | `npm run licenses`                                      |
| GitHub Actions pinned to commit SHAs                                                                | `.github/workflows`                                     |

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
