---
bump: patch
desktop: changed
browser: changed
phone: changed
website: unchanged
docs: unchanged
---

## Fixed

- Removing a voice from a blend no longer moves the other voices' choices, or your keyboard focus, onto the wrong row.
- In the library, drop documents on a folder's name to move them there; the whole row still lights up while you drag.

## Technical

- SonarQube review for 2.2.0: the server, web app, build scripts and website were brought back to no open findings (long functions split into named helpers, nested conditionals unpicked, repeated literals named once, statuses in `<output>`, sorts that feed generated files given an explicit code-unit comparator so their order can't move). Security hotspots were reviewed one by one, and each verdict is recorded in SonarQube with its reasoning.
- The update test gives every throwaway signing key its own random password instead of a fixed one in the source.
- A text selection longer than 1,000 characters is never searched for a word to fix, so the edge-trimming pattern only sees short strings.
