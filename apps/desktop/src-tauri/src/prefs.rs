// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
//! Purpose: The desktop app's own small settings file (`desktop.json` in the user's folder).
//! Scope: Whether to check for updates automatically, when the last check ran and what it found, and an
//!   update the user asked to be reminded about later. Written atomically; a missing or unreadable file
//!   means the defaults (automatic checks on).
//! Does NOT belong: Reading preferences (stored by the server in its database) or update logic
//!   (updates.rs).

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundUpdate {
    pub version: String,
    pub date: Option<String>,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Prefs {
    pub auto_check: bool,
    /// Seconds since the Unix epoch of the last successful check.
    pub last_check: Option<u64>,
    pub last_found: Option<FoundUpdate>,
    pub snoozed_version: Option<String>,
    pub snoozed_until: Option<u64>,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            auto_check: true,
            last_check: None,
            last_found: None,
            snoozed_version: None,
            snoozed_until: None,
        }
    }
}

impl Prefs {
    pub fn is_snoozed(&self, version: &str, now: u64) -> bool {
        self.snoozed_version.as_deref() == Some(version) && self.snoozed_until.is_some_and(|until| now < until)
    }
}

pub struct Store {
    path: PathBuf,
    prefs: Mutex<Prefs>,
}

impl Store {
    pub fn load(path: PathBuf) -> Self {
        let prefs = std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self { path, prefs: Mutex::new(prefs) }
    }

    pub fn get(&self) -> Prefs {
        self.prefs.lock().map(|prefs| prefs.clone()).unwrap_or_default()
    }

    /// Changes the settings and saves them; a failed save keeps the change for this run only.
    pub fn update(&self, change: impl FnOnce(&mut Prefs)) {
        let Ok(mut prefs) = self.prefs.lock() else { return };
        change(&mut prefs);
        if let Ok(json) = serde_json::to_vec_pretty(&*prefs) {
            let staging = self.path.with_extension("json.tmp");
            if std::fs::write(&staging, json).is_ok() {
                let _ = std::fs::rename(&staging, &self.path);
            }
        }
    }
}

pub fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|elapsed| elapsed.as_secs()).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn automatic_checks_are_on_by_default_and_unknown_fields_are_ignored() {
        let prefs: Prefs = serde_json::from_str(r#"{"somethingNew": 1}"#).unwrap();
        assert!(prefs.auto_check);
        let saved: Prefs = serde_json::from_str(r#"{"autoCheck": false}"#).unwrap();
        assert!(!saved.auto_check);
    }

    #[test]
    fn a_reminder_applies_to_one_version_until_it_expires() {
        let prefs = Prefs { snoozed_version: Some("2.1.0".into()), snoozed_until: Some(100), ..Prefs::default() };
        assert!(prefs.is_snoozed("2.1.0", 99));
        assert!(!prefs.is_snoozed("2.1.0", 100));
        assert!(!prefs.is_snoozed("2.2.0", 50));
    }

    #[test]
    fn settings_survive_a_restart_and_a_damaged_file_means_defaults() {
        let dir = std::env::temp_dir().join(format!("ttsnative-prefs-{}", now()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("desktop.json");
        Store::load(path.clone()).update(|prefs| prefs.auto_check = false);
        assert!(!Store::load(path.clone()).get().auto_check);
        std::fs::write(&path, b"not json").unwrap();
        assert!(Store::load(path).get().auto_check);
        let _ = std::fs::remove_dir_all(dir);
    }
}
