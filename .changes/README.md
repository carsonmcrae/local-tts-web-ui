# Change files

Every pull request adds (or edits) one small Markdown file here that says **how it affects the next
version** and **what to tell people**. CI fails without one. Nobody edits version numbers or
`CHANGELOG.md` in a normal pull request: when a release is prepared, these files are combined into the
next version, the user-facing release notes and the developer changelog, and then deleted.

Start one with `npm run change -- <bump>` (it names the file after your branch), or copy this:

```md
---
bump: minor
---

## New

- Read a document aloud in its own window on Windows, installed like any other app.

## Fixed

- Stopping a recording right after starting it no longer shows a confusing error.

## Technical

- Tauri 2 desktop shell with a bundled Python runtime; `ltts serve --exit-with-stdin`.
```

## Choosing the bump

| Bump    | When                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------- |
| `major` | Something stops working the way it did: data that needs migrating by hand, a removed feature.        |
| `minor` | Anything new people can use. Required when the file has a **New** section.                           |
| `patch` | Fixes, security fixes, performance, and maintenance that ships to users (dependency updates).        |
| `none`  | Nothing users get changes: documentation, tests, CI, repository tooling. Only **Technical** allowed. |

The next version is the current one bumped by the **strongest** bump among all pending files, so two
pull requests can never claim the same number: `2.0.0` + a patch and a minor → `2.1.0`.

## Sections

- **New**, **Improved**, **Fixed**, **Security & reliability**: what people who use TTSNative notice,
  written for someone who has never written software. One sentence per entry, starting with what they
  can now do or what no longer goes wrong. No code, file names, version numbers of libraries, issue
  numbers, commit hashes or test counts; CI rejects common technical terms here.
- **Technical**: everything developers need (APIs, dependencies, migrations, tooling). It goes into
  `CHANGELOG.md` only.

Write only what the pull request really changes, and only claim a fix you verified.

See [docs/guides/release-process.md](../docs/guides/release-process.md) for the whole release flow.
