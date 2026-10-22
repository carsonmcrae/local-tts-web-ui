## What and why

<!-- What does this change, and why is it needed? Link the issue. -->

## Release impact

<!-- Every pull request adds a change file: `npm run change -- <major|minor|patch|none>`. -->

- [ ] `.changes/…md` says the bump and, in plain language, what changes for people
- [ ] It declares every surface (`desktop`, `browser`, `phone`, `website`, `docs`); CI checks the
      declaration against this pull request

## Surfaces

<!-- One line each: what changed, or why it didn't, or the limitation and why. -->

| Surface                   | Impact |
| ------------------------- | ------ |
| Windows app               |        |
| Browser on the computer   |        |
| Phone on the home network |        |
| ttsnative.com             |        |
| README, wiki and guides   |        |

## How it was verified

- [ ] `npm run check`
- [ ] `npm run test:inference` (playback/engine changes)
- [ ] `npm run test:e2e` (UI/playback changes)
- [ ] Manually checked in a browser (which one?)

Anything you could **not** test, and why:

## Checklist

- [ ] Tests cover new behaviour and failure paths
- [ ] Loading, empty and error states handled in the UI
- [ ] Docs updated (not `CHANGELOG.md` or version numbers: releases write those)
- [ ] Reviewed all affected user-facing surfaces (app, desktop, website, documentation and release
      information); updated and verified them, or explained why no changes were needed
- [ ] No new dependency, or its licence/maintenance/install scripts were reviewed
- [ ] No document text, recordings or secrets in logs, fixtures or commits
