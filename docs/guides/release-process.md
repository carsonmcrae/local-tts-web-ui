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

## Demo and showcase videos

When the UI changes noticeably, regenerate the videos in `docs/media` (FFmpeg and the installed models
are required; see [docs/media/README.md](../media/README.md)):

```bash
npm run media:demo
npm run media:promo
```

The v1 Gradio prototype is tagged `v1.0.0` (commit `1452251`).
