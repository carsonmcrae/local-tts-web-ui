# ltts — local API server

FastAPI service behind the Local TTS web UI. It extracts text from documents, segments it for
speech, synthesizes audio with local engines (Kokoro by default), caches results, manages
checksum-verified model downloads and stores custom voice profiles. Everything binds to
`127.0.0.1` by default.

You normally never run this directly — `npm run dev` from the repository root bootstraps the
environment and starts it. For server-only work:

```bash
node ../../scripts/uv-run.mjs run --frozen ltts serve --reload
```

See [docs/architecture/overview.md](../../docs/architecture/overview.md) for the design.
