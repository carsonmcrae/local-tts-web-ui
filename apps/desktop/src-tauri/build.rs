// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
//! Purpose: Tauri build step: embeds the config, icons and Windows resources, and declares the app's
//!   own commands so capabilities can grant them per window and origin.
//! Scope: The command list below must match `generate_handler!` in main.rs.
//! Does NOT belong: Building the bundled runtime (scripts/desktop/build-runtime.mjs).

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "app_quit",
            "backend_retry",
            "backend_status",
            "delete_user_data",
            "desktop_info",
            "open_folder",
            "update_check",
            "update_install",
            "update_set_auto",
            "update_snooze",
        ])),
    )
    .expect("failed to run the Tauri build step");
}
