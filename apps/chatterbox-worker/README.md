# Chatterbox worker (optional)

A small stdio worker that runs [Resemble AI Chatterbox Turbo](https://github.com/resemble-ai/chatterbox)
(MIT code and weights) for zero-shot voice cloning from a short reference recording.

It lives in its own uv project because chatterbox pins `numpy<2` and `torch==2.6.0`, which conflict
with the main server's dependencies. Users install it from **Settings → Engines** in the app; the
server runs `uv sync --frozen --extra cpu|cuda` against this project's `uv.lock` into
`data/engines/chatterbox/venv`, then downloads the checksum-pinned weights listed in
`apps/server/src/ltts/modelstore/manifest.json`.

Protocol: one JSON object per line on stdin, one JSON reply per line on stdout. Library output is
redirected to stderr so it can never corrupt the protocol. Hugging Face offline mode is forced, so
the worker can only load the verified local weights.
