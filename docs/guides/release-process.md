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
5. On `main`, replace `Unreleased` with the date, then tag and publish:

   ```bash
   git tag -s v2.0.0 -m "Local TTS 2.0.0"
   git push origin v2.0.0
   gh release create v2.0.0 --notes-from-tag
   ```

Historical v1 was never tagged; it remains at commit `1452251`.
