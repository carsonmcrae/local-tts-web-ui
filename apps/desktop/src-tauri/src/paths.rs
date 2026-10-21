// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
//! Purpose: Where the desktop app finds its bundled runtime and keeps the user's data.
//! Scope: The read-only runtime next to the executable (Python, server, web UI, default model) and the
//!   per-user folder `%LOCALAPPDATA%\com.ttsnative.desktop` (documents, voices, models, logs,
//!   preferences). Installed files and user data never share a folder, so updates and uninstalls
//!   replace the app without touching the user's files.
//! Does NOT belong: Starting the server (backend.rs) or what is stored in the files (prefs.rs).

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

#[derive(Clone, Debug)]
pub struct Paths {
    /// The bundled runtime, replaced on every update.
    pub runtime: PathBuf,
    /// The user's folder, kept across updates (removed only when they ask the uninstaller to).
    pub root: PathBuf,
}

impl Paths {
    pub fn resolve(app: &AppHandle) -> tauri::Result<Self> {
        Ok(Self {
            runtime: runtime_dir(app)?,
            root: app.path().app_local_data_dir()?,
        })
    }

    /// The server's data directory (`LTTS_DATA_DIR`): database, documents, voices, models, cache.
    pub fn data(&self) -> PathBuf {
        self.root.join("data")
    }

    pub fn logs(&self) -> PathBuf {
        self.root.join("logs")
    }

    /// Python versions that uv installs for the optional voice-cloning engine.
    pub fn tools(&self) -> PathBuf {
        self.root.join("tools")
    }

    pub fn prefs(&self) -> PathBuf {
        self.root.join("desktop.json")
    }

    pub fn ensure(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(self.data())?;
        std::fs::create_dir_all(self.logs())
    }
}

/// Release builds always use the runtime installed next to the executable; only debug builds may point
/// at another one (`TTSNATIVE_RUNTIME_DIR`), so an environment variable can't redirect an installed app.
fn runtime_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    if cfg!(debug_assertions) {
        if let Some(dir) = std::env::var_os("TTSNATIVE_RUNTIME_DIR") {
            return Ok(PathBuf::from(dir));
        }
    }
    Ok(app.path().resource_dir()?.join("runtime"))
}
