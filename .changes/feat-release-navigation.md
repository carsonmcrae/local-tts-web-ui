---
bump: patch
---

## Improved

- Release history shows one version at a time: pick a version from the list or step to the older or
  newer one, see when it came out and what changed, and find the version you're running marked.
- The version you're running is shown at the bottom of the sidebar and leads to About, where What's
  new and Release history are.
- On the website, every version has its own release notes page with links to the older and newer
  versions, and the home page names the latest version.

## Technical

- Website build: one page per release (`releases/<version>/`, plus `releases/` for the latest), a
  title and canonical address per version, `%LATEST_*%` placeholders behind an `if:release` block,
  and a link check that follows the base URL into folders.
