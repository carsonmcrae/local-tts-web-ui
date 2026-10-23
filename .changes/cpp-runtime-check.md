---
bump: none
desktop: unchanged
browser: unchanged
phone: unchanged
website: unchanged
docs: changed
---

## Technical

- The Windows runtime ships the Microsoft Visual C++ runtime (`msvcp140.dll`, `msvcp140_1.dll`, `vcruntime140.dll`, `vcruntime140_1.dll`; Microsoft-signed, 14.40 or later) next to `python.exe`, copied from Visual Studio's redistributable folder (or `TTSNATIVE_VC_REDIST_DIR`) and recorded with its SHA-256 in `runtime-manifest.json`. ONNX Runtime and espeak-ng need it and a clean Windows 11 PC doesn't have it, so the default voice failed to load there; GitHub's runners have it installed, so no automated check had noticed. 2.1.0 is released from the commit with this fix, so nothing changes for anyone who installed it.
- `npm run desktop:build` fails if any program or library in the runtime loads a DLL that neither ships with it nor comes with Windows (`scripts/desktop/cpp-runtime.mjs`, import tables read by `scripts/lib/pe-imports.mjs`).
