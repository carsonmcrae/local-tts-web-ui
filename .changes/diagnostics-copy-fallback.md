---
bump: patch
desktop: changed
browser: changed
phone: changed
website: unchanged
docs: unchanged
---

## Fixed

- Copy diagnostics no longer does nothing on a phone: when the browser can't copy, the details appear so you can select and copy them yourself.

## Technical

- `AboutSection` always attempts `navigator.clipboard.writeText` (a missing clipboard on plain HTTP now rejects instead of
  short-circuiting) and on failure shows the report in a read-only, select-on-focus textarea.
