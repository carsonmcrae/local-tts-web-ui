// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
//! Purpose: The TTSNative desktop app: one window that shows the existing web UI from the bundled local
//!   server, started and stopped with the app.
//! Scope: Single instance (a second launch focuses the open window), the window (its size and position
//!   remembered, the start-up screen while the server starts), navigation rules (only the start-up
//!   screen and the local server load inside the window; other links open in the default browser),
//!   the commands the web UI may call, and a clean server shutdown on exit.
//! Does NOT belong: Running the server (backend.rs), updates (updates.rs) or file locations (paths.rs).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;
mod paths;
mod prefs;
mod updates;

use serde::Serialize;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

use crate::backend::{Backend, Status};
use crate::paths::Paths;

pub struct AppState {
    pub paths: Paths,
    pub backend: Backend,
    pub prefs: prefs::Store,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopInfo {
    version: String,
    channel: &'static str,
    data_dir: String,
    log_dir: String,
    auto_check: bool,
    last_checked_at: Option<u64>,
}

#[tauri::command]
fn desktop_info(app: AppHandle) -> DesktopInfo {
    let state = app.state::<AppState>();
    let version = &app.package_info().version;
    let saved = state.prefs.get();
    DesktopInfo {
        version: version.to_string(),
        channel: if version.pre.is_empty() && version.build.is_empty() { "stable" } else { "development" },
        data_dir: state.paths.data().display().to_string(),
        log_dir: state.paths.logs().display().to_string(),
        auto_check: saved.auto_check,
        last_checked_at: saved.last_check,
    }
}

#[tauri::command]
fn backend_status(app: AppHandle) -> Status {
    app.state::<AppState>().backend.status()
}

#[tauri::command]
fn backend_retry(app: AppHandle) {
    launch(app);
}

#[tauri::command]
fn open_folder(app: AppHandle, which: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let folder = match which.as_str() {
        "data" => state.paths.data(),
        "logs" => state.paths.logs(),
        _ => return Err("Unknown folder.".into()),
    };
    app.opener()
        .open_path(folder.display().to_string(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn app_quit(app: AppHandle) {
    app.exit(0);
}

/// Starts the server in the background and shows the app once it answers.
pub fn launch(app: AppHandle) {
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        if let Status::Ready { url, .. } = state.backend.start(&state.paths) {
            if let (Some(window), Ok(target)) = (app.get_webview_window("main"), url.parse::<Url>()) {
                let _ = window.navigate(target);
            }
        }
    });
}

fn is_start_screen(url: &Url) -> bool {
    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
}

/// Only the start-up screen and the local server load in the window; anything else opens outside it.
fn allow_navigation(app: &AppHandle, url: &Url) -> bool {
    let origin = url.origin().ascii_serialization();
    if is_start_screen(url) || app.state::<AppState>().backend.origin().is_some_and(|own| own == origin) {
        return true;
    }
    open_outside(app, url);
    false
}

fn open_outside(app: &AppHandle, url: &Url) {
    if matches!(url.scheme(), "https" | "http" | "mailto") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

fn focus_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn create_window(app: &AppHandle) -> tauri::Result<()> {
    let navigation = app.clone();
    let popups = app.clone();
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("TTSNative")
        .inner_size(1280.0, 860.0)
        .min_inner_size(420.0, 560.0)
        .center()
        // The web UI handles dropped documents and recordings itself.
        .disable_drag_drop_handler()
        .initialization_script("window.__TTSNATIVE_DESKTOP__ = true;")
        .on_navigation(move |url| allow_navigation(&navigation, url))
        .on_new_window(move |url, _features| {
            open_outside(&popups, &url);
            NewWindowResponse::Deny
        })
        .build()?;
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        // Registered first, so a second launch only focuses the running window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| focus_main(app)))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let paths = Paths::resolve(app.handle())?;
            paths.ensure()?;
            let prefs = prefs::Store::load(paths.prefs());
            app.manage(AppState { paths, backend: Backend::new(), prefs });
            create_window(app.handle())?;
            launch(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_quit,
            backend_retry,
            backend_status,
            desktop_info,
            open_folder,
            updates::update_check,
            updates::update_install,
            updates::update_set_auto,
            updates::update_snooze,
        ])
        .build(tauri::generate_context!())
        .expect("TTSNative could not start its window");
    app.run(|app, event| {
        if let RunEvent::Exit = event {
            app.state::<AppState>().backend.stop();
        }
    });
}
