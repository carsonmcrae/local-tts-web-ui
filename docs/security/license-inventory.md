# License inventory

> **In short:** the project is MIT. Runtime dependencies are permissive (MIT, BSD, Apache-2.0, PSF,
> ISC) with two reviewed exceptions used for Kokoro's phonemisation: `phonemizer` and the espeak-ng
> library bundled by `espeakng-loader`, both GPL-3.0. Model weights are Apache-2.0 (Kokoro) and MIT
> (Chatterbox).

The full, generated list of runtime packages and licences is in
[license-inventory.generated.md](license-inventory.generated.md). The production web build (and the
`web-ui` archive attached to each release) includes `THIRD-PARTY-LICENSES.md`, written by Vite, with the
licence text of every package and font it bundles. Regenerate it with
`npm run licenses`; the command fails if a dependency has an unknown licence or an unreviewed
GPL/AGPL/LGPL licence.

## Reviewed exceptions

| Component                                              | Licence          | Why it is acceptable here                                                                                   |
| ------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| phonemizer (via kokoro-onnx)                           | GPL-3.0-or-later | Installed from PyPI into the user's environment by uv; not copied into or distributed with this repository. |
| espeak-ng (bundled in espeakng-loader wheels)          | GPL-3.0          | Same as above.                                                                                              |
| libsndfile, mpg123, LAME (bundled in soundfile wheels) | LGPL-2.1         | Dynamically loaded shared libraries; unmodified.                                                            |

**If you redistribute a bundled build** (PyInstaller, Docker image, desktop wrapper) that includes these
components, you must meet the GPL-3.0/LGPL obligations for them (source availability, licence notices).
This is a practical summary, not legal advice.

## Models and data

| Item                              | Licence                                                                |
| --------------------------------- | ---------------------------------------------------------------------- |
| Kokoro-82M weights and voices     | Apache-2.0 (training data includes CC-BY sources — see README credits) |
| kokoro-onnx export                | MIT                                                                    |
| Chatterbox Turbo code and weights | MIT                                                                    |
| Fonts: Inter, Literata            | SIL Open Font License 1.1 (self-hosted via @fontsource)                |
| Icons: Lucide                     | ISC                                                                    |
| Sample text in the app            | "A Scandal in Bohemia", Arthur Conan Doyle (1891), public domain       |

## Approaches adapted from other projects

No code is copied from these projects; the app re-implements their published approach and credits
them in the source and the README.

| Project                                                               | Licence | Used for                                                     |
| --------------------------------------------------------------------- | ------- | ------------------------------------------------------------ |
| [noisereduce](https://github.com/timsainb/noisereduce) (Tim Sainburg) | MIT     | Stationary spectral gating in Voice Studio's noise reduction |

## Rejected for licence reasons

PyMuPDF (AGPL-3.0), EbookLib (AGPL-3.0), F5-TTS weights (CC-BY-NC), XTTS-v2 (CPML, non-commercial),
Fish-Speech/OpenAudio (non-commercial).
