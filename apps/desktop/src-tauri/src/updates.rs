// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
//! Purpose: Find, download, verify and install official TTSNative updates from GitHub Releases.
//! Scope: Commands for the web UI: check (automatic at most every 12 hours, or on request), remind me
//!   later (3 days, for that version only), turn automatic checks on or off, and install. Tauri's
//!   updater only accepts a stable release newer than this build, and only after its minisign
//!   signature matches the public key built into the app; the server is stopped before the signed
//!   installer replaces the program files, and restarted if the installer can't be launched. A
//!   Microsoft Store build (the `store` feature) never checks or installs: the Store updates it.
//! Does NOT belong: The update endpoint and public key (tauri.conf.json) or how updates are shown
//!   (apps/web/src/features/updates).

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::prefs::{self, FoundUpdate, Prefs};
use crate::AppState;

const RECHECK_AFTER_S: u64 = 12 * 60 * 60;
const REMIND_AFTER_S: u64 = 3 * 24 * 60 * 60;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum CheckResult {
    Available {
        update: FoundUpdate,
    },
    Snoozed {
        update: FoundUpdate,
    },
    UpToDate,
    /// GitHub answered, but no release carries an update manifest yet (before the first release that
    /// ships one): not a connection problem, and nothing to remember.
    NoRelease,
    Disabled,
    NotDue,
    /// This copy came from the Microsoft Store, which delivers its updates.
    Store,
    Failed {
        message: String,
    },
}

/// What the release address said.
enum Fetched {
    Update(FoundUpdate),
    UpToDate,
    NoRelease,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "event")]
pub enum InstallEvent {
    Downloading { downloaded: u64, total: Option<u64> },
    Verifying,
    Installing,
}

#[tauri::command]
pub async fn update_check(app: AppHandle, manual: bool) -> CheckResult {
    if cfg!(feature = "store") {
        return CheckResult::Store;
    }
    let state = app.state::<AppState>();
    let saved = state.prefs.get();
    let now = prefs::now();
    if !manual {
        if !saved.auto_check {
            return CheckResult::Disabled;
        }
        if saved
            .last_check
            .is_some_and(|last| now.saturating_sub(last) < RECHECK_AFTER_S)
        {
            return remembered(&app, &saved, now);
        }
    }
    match fetch(&app).await {
        Ok(Fetched::NoRelease) => CheckResult::NoRelease,
        Ok(fetched) => {
            let found = match &fetched {
                Fetched::Update(update) => Some(update.clone()),
                _ => None,
            };
            state.prefs.update(|prefs| {
                prefs.last_check = Some(now);
                prefs.last_found = found;
            });
            match fetched {
                Fetched::Update(update) if !manual && saved.is_snoozed(&update.version, now) => {
                    CheckResult::Snoozed { update }
                }
                Fetched::Update(update) => CheckResult::Available { update },
                _ => CheckResult::UpToDate,
            }
        }
        Err(message) => CheckResult::Failed { message },
    }
}

#[tauri::command]
pub fn update_snooze(app: AppHandle, version: String) {
    let until = prefs::now() + REMIND_AFTER_S;
    app.state::<AppState>().prefs.update(|prefs| {
        prefs.snoozed_version = Some(version);
        prefs.snoozed_until = Some(until);
    });
}

#[tauri::command]
pub fn update_set_auto(app: AppHandle, enabled: bool) {
    app.state::<AppState>().prefs.update(|prefs| prefs.auto_check = enabled);
}

#[tauri::command]
pub async fn update_install(app: AppHandle, on_event: Channel<InstallEvent>) -> Result<(), String> {
    if cfg!(feature = "store") {
        return Err(FROM_STORE.to_string());
    }
    let updater = app.updater().map_err(|error| error.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|error| explain(&app, UNREACHABLE, &error))?
        .ok_or_else(|| "TTSNative is already up to date.".to_string())?;
    let progress = on_event.clone();
    let verifying = on_event.clone();
    let mut downloaded = 0_u64;
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = progress.send(InstallEvent::Downloading { downloaded, total });
            },
            move || {
                let _ = verifying.send(InstallEvent::Verifying);
            },
        )
        .await
        .map_err(|error| explain(&app, NOT_VERIFIED, &error))?;
    let _ = on_event.send(InstallEvent::Installing);
    let state = app.state::<AppState>();
    crate::backend::note(&state.paths, &format!("installing update {}", update.version));
    state.backend.stop();
    // On Windows this launches the verified installer and exits; the installer restarts TTSNative.
    if let Err(error) = update.install(bytes) {
        crate::launch(app.clone());
        return Err(explain(&app, NOT_STARTED, &error));
    }
    Ok(())
}

async fn fetch(app: &AppHandle) -> Result<Fetched, String> {
    let updater = app.updater().map_err(|error| error.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(Fetched::Update(FoundUpdate {
            version: update.version.clone(),
            date: update.date.map(|date| date.date().to_string()),
            notes: update.body.clone(),
        })),
        Ok(None) => Ok(Fetched::UpToDate),
        // The address answered without a release manifest (a 404 until the first release ships one);
        // a connection failure is reported as such by the updater and lands below.
        Err(tauri_plugin_updater::Error::ReleaseNotFound) => {
            crate::backend::note(&app.state::<AppState>().paths, "no published update manifest yet");
            Ok(Fetched::NoRelease)
        }
        Err(error) => Err(explain(app, UNREACHABLE, &error)),
    }
}

/// What a check found earlier, while it's too soon to ask GitHub again.
fn remembered(app: &AppHandle, saved: &Prefs, now: u64) -> CheckResult {
    let current = &app.package_info().version;
    match &saved.last_found {
        Some(update) if is_newer(&update.version, current) => {
            if saved.is_snoozed(&update.version, now) {
                CheckResult::Snoozed { update: update.clone() }
            } else {
                CheckResult::Available { update: update.clone() }
            }
        }
        _ => CheckResult::NotDue,
    }
}

fn is_newer(candidate: &str, current: &semver::Version) -> bool {
    semver::Version::parse(candidate).is_ok_and(|version| version > *current)
}

const FROM_STORE: &str = "This copy of TTSNative is updated by the Microsoft Store.";
const NOT_VERIFIED: &str = "The update couldn't be downloaded and verified, so nothing was changed.";
const NOT_STARTED: &str = "The update couldn't be started, so TTSNative kept the current version.";
const UNREACHABLE: &str = "TTSNative couldn't check for updates. Check your internet connection, or download the \
     latest version from ttsnative.com.";

/// The plain explanation for people; the technical reason goes to `logs/desktop.log` for bug reports.
fn explain(app: &AppHandle, message: &str, error: &dyn std::fmt::Display) -> String {
    crate::backend::note(&app.state::<AppState>().paths, &format!("{message} ({error})"));
    message.to_string()
}

#[cfg(test)]
mod tests {
    use super::is_newer;

    #[test]
    fn only_a_newer_version_counts_as_an_update() {
        let current = semver::Version::parse("2.1.0").unwrap();
        assert!(is_newer("2.1.1", &current));
        assert!(is_newer("3.0.0", &current));
        assert!(!is_newer("2.1.0", &current));
        assert!(!is_newer("2.0.9", &current));
        assert!(!is_newer("not a version", &current));
        let development = semver::Version::parse("2.1.0-dev.4+feat-x.abc").unwrap();
        assert!(is_newer("2.1.0", &development));
    }
}
