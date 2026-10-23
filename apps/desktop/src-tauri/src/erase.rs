// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
//! Purpose: Delete everything TTSNative keeps for this Windows account when the user asks from the app.
//! Scope: The user folder (`%LOCALAPPDATA%\com.ttsnative.desktop`: documents, voices, recordings,
//!   exports, models, settings and logs) and the remembered window position
//!   (`%APPDATA%\com.ttsnative.desktop`). The server stops, a hidden `cmd.exe` removes both folders once
//!   the app has closed (retrying for up to 30 seconds while WebView2 still holds files), and the app
//!   quits. `rmdir /s` removes links inside the folders without following them. The Microsoft Store's
//!   uninstaller can't ask about personal data the way the direct installer does, so this is how a
//!   Store install removes it; the direct install offers it too.
//! Does NOT belong: The uninstaller's own question (windows/hooks.nsh) or where the folders are
//!   (paths.rs).

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::AppState;

/// The only folder name this module deletes: the app's identifier (tauri.conf.json).
const IDENTIFIER: &str = "com.ttsnative.desktop";
const ATTEMPTS: u32 = 30;

#[tauri::command]
pub fn delete_user_data(app: AppHandle) -> Result<(), String> {
    let config = app.path().app_config_dir().map_err(|error| error.to_string())?;
    let state = app.state::<AppState>();
    let folders = [state.paths.root.clone(), config];
    for folder in &folders {
        ensure_ours(folder)?;
    }
    crate::backend::note(&state.paths, "deleting the user's data at their request");
    state.backend.stop();
    spawn_eraser(&folders).map_err(|error| format!("TTSNative couldn't start deleting your data: {error}"))?;
    app.exit(0);
    Ok(())
}

/// Refuses any folder that isn't one of TTSNative's own, whatever the path resolution returned.
fn ensure_ours(folder: &Path) -> Result<(), String> {
    let named = folder
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case(IDENTIFIER));
    let nested = folder.parent().is_some_and(|parent| parent.parent().is_some());
    if named && nested && folder.is_absolute() {
        Ok(())
    } else {
        Err(format!(
            "TTSNative won't delete {}: it isn't TTSNative's own folder.",
            folder.display()
        ))
    }
}

/// The command line for `cmd.exe /d /s /c`: each folder comes from `TTSNATIVE_ERASE_<n>`, so no path
/// is ever parsed as part of the command.
fn eraser_script(count: usize) -> String {
    let folder = |index: usize| format!("\"%TTSNATIVE_ERASE_{index}%\\\"");
    let remove = (0..count)
        .map(|index| format!("(if exist {} rmdir /s /q \"%TTSNATIVE_ERASE_{index}%\")", folder(index)))
        .collect::<Vec<_>>()
        .join(" & ");
    let gone = (0..count)
        .map(|index| format!("if not exist {} ", folder(index)))
        .collect::<String>();
    format!("/d /s /c \"for /l %i in (1,1,{ATTEMPTS}) do @({remove} & ({gone}exit /b 0) & ping -n 2 127.0.0.1 >nul)\"")
}

#[cfg(windows)]
fn spawn_eraser(folders: &[PathBuf]) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let windows = std::env::var_os("SystemRoot").map_or_else(|| PathBuf::from(r"C:\Windows"), PathBuf::from);
    let mut command = std::process::Command::new(windows.join("System32").join("cmd.exe"));
    command.raw_arg(eraser_script(folders.len()));
    for (index, folder) in folders.iter().enumerate() {
        command.env(format!("TTSNATIVE_ERASE_{index}"), folder);
    }
    command.creation_flags(CREATE_NO_WINDOW).spawn().map(|_| ())
}

#[cfg(not(windows))]
fn spawn_eraser(_folders: &[PathBuf]) -> std::io::Result<()> {
    Err(std::io::Error::other(
        "deleting data from the app is only built for Windows",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn only_the_apps_own_folders_are_deleted() {
        assert!(ensure_ours(Path::new(r"C:\Users\reader\AppData\Local\com.ttsnative.desktop")).is_ok());
        assert!(ensure_ours(Path::new(r"C:\Users\reader\AppData\Roaming\COM.TTSNATIVE.DESKTOP")).is_ok());
        assert!(ensure_ours(Path::new(r"C:\Users\reader\AppData\Local")).is_err());
        assert!(ensure_ours(Path::new(r"C:\com.ttsnative.desktop")).is_err());
        assert!(ensure_ours(Path::new(r"com.ttsnative.desktop")).is_err());
        assert!(ensure_ours(Path::new(r"C:\Users\reader\com.ttsnative.desktop.old")).is_err());
    }

    #[test]
    fn the_script_names_folders_only_through_the_environment() {
        let script = eraser_script(2);
        assert!(script.starts_with("/d /s /c \"for /l %i in (1,1,30) do @("));
        assert!(script.ends_with(" & ping -n 2 127.0.0.1 >nul)\""));
        assert!(script.contains("(if exist \"%TTSNATIVE_ERASE_0%\\\" rmdir /s /q \"%TTSNATIVE_ERASE_0%\")"));
        assert!(script.contains("(if exist \"%TTSNATIVE_ERASE_1%\\\" rmdir /s /q \"%TTSNATIVE_ERASE_1%\")"));
        assert!(script
            .contains("(if not exist \"%TTSNATIVE_ERASE_0%\\\" if not exist \"%TTSNATIVE_ERASE_1%\\\" exit /b 0)"));
        assert!(!script.contains(":\\"), "no path is written into the command line");
    }
}
