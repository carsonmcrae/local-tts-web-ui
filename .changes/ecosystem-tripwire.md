---
bump: none
desktop: unchanged
browser: unchanged
phone: unchanged
website: unchanged
docs: changed
---

## Technical

- `npm run lint:repo` now fails when a file brings in a language, runtime or package manager the project has no security tooling for (PHP, Ruby, Go, the JVM, .NET, a second JavaScript or Python package manager, a container image and others). Adding one needs an architecture decision and, in the same pull request, its Dependabot entry, an audit in `npm run security` and scanner coverage (CONTRIBUTING.md, "Adding a language or package manager"). TTSNative uses no PHP today; this keeps it that way until its tooling arrives with it.
