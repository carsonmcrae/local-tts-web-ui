# Release process

The project follows [Semantic Versioning](https://semver.org/): MAJOR for breaking changes to data,
APIs or setup, MINOR for features, PATCH for fixes.

One version number appears in six places and `npm run lint:repo` (`scripts/check-version.mjs`) fails if
they disagree: root and web `package.json`, `apps/server/pyproject.toml`, `ltts/__init__.py`,
`apps/chatterbox-worker/pyproject.toml`, and the newest `CHANGELOG.md` heading. The UI shows both the web
and server versions in **Settings → About**.

## Steps

1. On a branch, add changes under a new `## [x.y.z] - Unreleased` heading in `CHANGELOG.md`.
2. Bump the version in the six places above.
3. Run `npm run check`, `npm run test:inference` and `npm run test:e2e`; record anything that could not run.
   Before a major or minor release, also do the [clean-install check](#clean-install-check).
4. Open a pull request; merge after CI is green and review is done.
5. In the same pull request (or a follow-up), replace `Unreleased` with the release date.
6. On an up-to-date `main`, create and push an annotated tag:

   ```bash
   git tag -a v2.0.1 -m "TTSNative 2.0.1"
   git push origin v2.0.1
   ```

The [Release workflow](../../.github/workflows/release.yml) does the rest. It:

- refuses the tag unless it matches `package.json` and a dated `CHANGELOG.md` entry
  (`scripts/release-notes.mjs`)
- runs `npm run check` through the real bootstrap
- packages the source archive, the prebuilt web UI, CycloneDX SBOMs for the web app, the server and the
  Chatterbox worker, the demo and showcase videos and `SHA256SUMS.txt`
- signs build provenance for every file
- publishes the release with the changelog entry as its notes

To publish an existing tag again (for example after fixing the workflow), run the workflow manually with
that tag. Anyone can verify a download:

```bash
sha256sum --check --ignore-missing SHA256SUMS.txt
gh attestation verify ttsnative-2.0.1-source.tar.gz --repo carsonmcrae/ttsnative
```

Tags matching `v*` are protected: they can't be moved or deleted.

## Clean-install check

This proves the documented quick start works on a machine with nothing but Node.js and Git. It uses a new
folder, empty npm and uv caches, the checksum-pinned uv download (not a uv already on `PATH`) and uv's own
Python (not one already installed), on ports that don't clash with a running copy:

```bash
export npm_config_cache="$PWD/npm-cache" UV_CACHE_DIR="$PWD/uv-cache" LTTS_UV_PINNED_ONLY=1 UV_PYTHON_PREFERENCE=only-managed LTTS_NO_OPEN=1 LTTS_API_PORT=8781 LTTS_WEB_PORT=5181
```

```bash
git clone --branch <branch> --depth 1 https://github.com/carsonmcrae/ttsnative.git && cd ttsnative && npm install && npm run dev
```

Then, in the browser at `http://127.0.0.1:5181`, choose a voice, upload a document, play past the first
sentence and export an MP3, and check that the file plays.

**Last run (2026-10-20, Windows 11, Node 24.19):** 81 seconds from clone to a running app. `npm install`
took 38 s; the first `npm run dev` downloaded and verified uv 0.12.21, installed Python 3.12.14 and the
locked dependencies, downloaded and verified the Kokoro model, and started the app. Voice choice, PDF
upload, speech, playback and MP3 export all worked. No other software was needed: MP3 export uses the
bundled libsndfile, not FFmpeg. Not yet repeated on macOS or Linux, where the server's unit tests run in CI.

## Demo and showcase videos

When the UI changes noticeably, regenerate the videos in `docs/media` (FFmpeg and the installed models
are required; see [docs/media/README.md](../media/README.md)):

```bash
npm run media:demo
npm run media:promo
```

The v1 Gradio prototype is tagged `v1.0.0` (commit `1452251`).
