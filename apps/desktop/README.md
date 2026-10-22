# TTSNative for Windows (desktop shell)

The Windows app: a [Tauri 2](https://v2.tauri.app) window that starts the bundled TTSNative server on
`127.0.0.1` and shows the existing web UI from it (LAN mode, when turned on in Settings, adds a second
listener on one home-network address until the app restarts; the speech API for other programs
answers on `127.0.0.1` only). Design and trade-offs:
[docs/architecture/desktop-and-releases.md](../../docs/architecture/desktop-and-releases.md).

| Path                        | What                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `src-tauri/src/main.rs`     | Window, single instance, navigation rules, commands for the web UI, clean exit            |
| `src-tauri/src/backend.rs`  | Starts, watches and stops the bundled server (no console, Job Object, logs, health check) |
| `src-tauri/src/updates.rs`  | Update checks, remind later, automatic checks, verified install                           |
| `src-tauri/src/prefs.rs`    | `desktop.json` (update settings)                                                          |
| `src-tauri/src/paths.rs`    | Install folder versus user-data folder                                                    |
| `src-tauri/capabilities/`   | What the start-up screen and the web UI may call                                          |
| `src-tauri/tauri.conf.json` | Product name, identifier, installer, updater endpoint and public key                      |
| `splash/`                   | The start-up screen (progress, and Try again / Open log folder / Quit on failure)         |
| `windows/hooks.nsh`         | Installer additions: replace the runtime whole on upgrade; confirm before deleting data   |
| `runtime.json`              | Python version, bundled models and standard-library parts left out                        |
| `runtime/` (generated)      | Built by `scripts/desktop/build-runtime.mjs`; not in Git                                  |

## Building

Needs Windows 11 x64, Node.js 22.22+, Rust (pinned in `src-tauri/rust-toolchain.toml`) and the Visual
Studio C++ build tools.

```bash
npm ci
npm run desktop:build
```

The installer is written to `dist/desktop/TTSNative-Setup-<version>.exe`. Without
`TAURI_SIGNING_PRIVATE_KEY` it has no update signature: fine for testing, never offered as an update.
CI builds and smoke-tests it on every pull request that touches the app (the **Desktop** workflow).

Started with `--remote-debugging-port=N`, the app opens WebView2's debugging port on 127.0.0.1 so a
test (or a browser's DevTools) can drive its window; `scripts/desktop/webview-debugging.mjs` uses it.

To run the shell against a runtime you built, use a debug build:
`TTSNATIVE_RUNTIME_DIR=<repo>/apps/desktop/runtime cargo run` in `src-tauri` (release builds always use
the runtime next to the executable).
