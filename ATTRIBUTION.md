# Attribution

Local TTS Web UI was created by **Carson McRae**
([github.com/carsonmcrae/local-tts-web-ui](https://github.com/carsonmcrae/local-tts-web-ui)) and is
released under the [MIT License](LICENSE). You are welcome to use, study, fork, modify and
redistribute it. These are the rules for doing that.

## What the licence requires

These are conditions of the MIT License. If they are not met, the licence does not give you
permission to use, copy or distribute the code.

1. **Keep the copyright notice and the licence.** Every copy, fork, derived work and redistributed
   build that contains the software, or a substantial portion of it, must include the
   [LICENSE](LICENSE) file with the line `Copyright (c) 2026 Carson McRae`.
2. **Keep the per-file notices.** Source files start with an `SPDX-License-Identifier: MIT` line and
   a `Copyright (c) 2026 Carson McRae` line. Leave them in place in any file you copy or modify. You
   may add your own copyright line for your changes underneath.
3. **Keep the [NOTICE](NOTICE) file** when you redistribute the source or a build.

Removing these notices, or republishing the code as your own original work, is a breach of the
licence and of the author's copyright.

## What the author asks

These go beyond the licence's legal minimum. They are how open-source credit normally works, and
following them is expected.

- **Credit the project visibly.** In a fork's or derived project's README, about page or
  documentation, include a line such as:

  > Based on [Local TTS Web UI](https://github.com/carsonmcrae/local-tts-web-ui) by Carson McRae
  > (MIT).

- **Keep the in-app credit.** Settings → About shows the project, its author and its licence. Keep
  it, and add your own credit next to it if you like.
- **Don't imply endorsement.** Don't use the author's name, or the name "Local TTS Web UI", to
  suggest that a fork or product is official or endorsed without written permission. Rename forks
  that are published as separate products.
- **Cite it** in papers, articles and videos using [CITATION.cff](CITATION.cff) (GitHub's
  "Cite this repository" button).
- **Contribute back.** Fixes and improvements are welcome as pull requests; see
  [CONTRIBUTING.md](CONTRIBUTING.md).

## Provenance markers

The project carries markers that identify where it came from, so copies can be traced to the
original:

- the copyright notice in [LICENSE](LICENSE), [NOTICE](NOTICE) and every source file;
- the project fingerprint `ltts-origin-c44dbf7e-6172-4e3a-a46a-636998263e03`, in NOTICE, the server
  (`ltts/provenance.py`), the web app (`src/lib/provenance.ts`) and the build;
- the project's name, author and homepage in the package metadata, the API description, the web
  bundle's licence banner, the server's startup log, Settings → About, and the metadata of exported
  audio files.

`npm run lint:repo` checks that these markers are present, so a change that removes one fails the
project's checks.

## Third-party work

Local TTS Web UI builds on other people's work, credited in the
[README](README.md#licence-and-credits) and the
[licence inventory](docs/security/license-inventory.md). Those components keep their own licences,
and the same courtesy applies to them.

This page is a plain-language summary, not legal advice. The [LICENSE](LICENSE) text is what
applies.
