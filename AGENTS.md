# Working on TTSNative

Instructions for anyone changing this repository, people and coding agents alike. They add to
[CONTRIBUTING.md](CONTRIBUTING.md); where an agent's tool has its own instruction file, it points here.

## One product, five surfaces

TTSNative ships as the Windows app, the same app in a browser on that computer, the same app on a
phone over the home network, the website ttsnative.com, and the documentation. The Windows app and the
browser serve the same built web assets from the same server, so a feature built for one reaches the
others unless it is deliberately limited.

Every user-facing change is assessed against all five before it is called done (CONTRIBUTING.md,
"Cross-surface consistency"), and its change file declares the result (`.changes/README.md`,
"Surfaces"). CI rejects a change file that leaves a surface undeclared, changes one app surface but not
the others without a stated limitation, or declares the website or the docs differently from what the
pull request changes. The website only describes what the newest **published** release has; content
for an unreleased version is gated with `<!-- if:released-X.Y.Z -->`.

A phone limitation is enforced by the server (`apps/server/src/ltts/lan/policy.py`) and explained in
the interface. Never weaken LAN authentication to make a phone behave like the computer.

## How changes land

- Work in your own git worktree; never switch branches or stash in a checkout someone else uses.
  Install real dependencies there (`npm ci`, `npm run setup`). Never link `node_modules` between
  worktrees: deleting a worktree through such a link deletes the real folder.
- One pull request per change, from `main`. Pull requests merge in number order: wait until the one
  ahead of yours merges, then rebase onto `main` (never merge `main` in) and push with
  `--force-with-lease`.
- Commits are authored by the maintainer's identity. No co-author trailers, "Generated with" lines or
  bot commits; dependency updates are re-applied in an owner-authored commit and the bot pull request
  is closed, citing it.
- Only the maintainer merges, tags, publishes releases, deploys the website or changes repository
  settings and credentials.
- Every pull request adds a change file (`npm run change -- <bump>`). Never edit version numbers or
  `CHANGELOG.md` by hand; `npm run release:prepare` and `npm run release:amend` write them.

## Gates

`npm run check` must pass: formatting, lint, types, API types, dependency rules, zero duplicated
blocks (jscpd), 100 % line and branch coverage for the web app and the server, the script tests and
the build. Also run `npm run test:e2e` for interface or playback changes and `npm run test:inference`
for engine changes. Don't exclude files, lower thresholds, delete behaviour or add hollow tests to make
a gate pass; report a gap you can't close honestly. A new language, runtime or package manager fails
`npm run lint:repo` until its security tooling comes with it (CONTRIBUTING.md, "Adding a language or
package manager"). Release readiness has its own gate
([docs/guides/release-process.md](docs/guides/release-process.md)).

## Data and secrets

- Never commit or print credentials: SonarQube tokens, the updater signing key and its password,
  GitHub tokens. Pass them through environment variables at run time, never through files in the
  repository.
- Recordings, voices made from them, adapters and their transcripts belong to the people who recorded
  them. Don't upload, commit or delete them without the owner's explicit say-so.
- Never claim something was heard, tested on a device or verified when it wasn't; say what was
  automated, simulated or blocked.
