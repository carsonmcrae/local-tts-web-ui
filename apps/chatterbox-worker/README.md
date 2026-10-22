# Chatterbox worker (optional)

A small stdio worker that runs [Resemble AI Chatterbox Turbo](https://github.com/resemble-ai/chatterbox)
(MIT code and weights) for zero-shot voice cloning from a short reference recording.

It lives in its own uv project because chatterbox pins `numpy<2` and an old PyTorch stack, which
conflict with the main server's dependencies. Where those pins carry security advisories, the
`pyproject.toml` lifts them to patched releases; see
[supply-chain.md](../../docs/security/supply-chain.md#known-advisories-in-the-optional-chatterbox-environment). Users install it from **Settings → Engines & models** in the app; the
server runs `uv sync --frozen --extra cpu|cuda` against this project's `uv.lock` into
`data/engines/chatterbox/venv`, then downloads the checksum-pinned weights listed in
`apps/server/src/ltts/modelstore/manifest.json`.

After a verified model load the server writes `data/engines/chatterbox/installed.json` with the
SHA-256 of this `uv.lock` and the extra it synced. Changing the lock (a security override, a
Dependabot bump) makes existing installs show **Update available**; the update re-runs the same
`uv sync --frozen` in place and only records the new hash once the model loads again
([ADR-8](../../docs/architecture/decisions.md)).

Protocol: one JSON object per line on stdin, one JSON reply per line on stdout. Library output is
redirected to stderr so it can never corrupt the protocol. Hugging Face offline mode is forced, so
the worker can only load the verified local weights.

Fine-tuning ([ADR-16](../../docs/architecture/decisions.md)) uses only the packages above: no
`peft`, `accelerate` or extra downloads. `tune_start` tokenises a studio voice's takes and their
passage text and wraps T3's GPT-2 projections in trainable low-rank adapters; each `tune_epoch`
trains one pass and scores the held-out takes; `tune_save` writes the best epoch as bf16 safetensors
(`ltts-chatterbox-adapter` v1); `tune_stop` puts the original projections back. `synthesize` and
`audition` take an optional `adapter`, which the worker merges into T3's weights and later restores
exactly from a copy of the originals. Training needs CUDA.
