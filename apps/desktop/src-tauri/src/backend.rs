// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
//! Purpose: Start, watch and stop the bundled TTSNative server behind the desktop window.
//! Scope: Picks a loopback port (a fixed one first, so the window's origin and its per-device settings
//!   stay the same between launches), starts the bundled Python with no console window inside a
//!   kill-on-close Job Object (the server and its helpers can't outlive the app, even after a crash),
//!   strips inherited `LTTS_*` settings, sends its output to `logs/server.log`, waits for
//!   `/api/health`, and stops it cleanly by closing its stdin (forcefully after a grace period).
//! Does NOT belong: The window or its navigation rules (main.rs) or updates (updates.rs).

use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::paths::Paths;

const PREFERRED_PORT: u16 = 8770;
const PORT_ATTEMPTS: u16 = 20;
/// The first start after installing can be slow while Windows scans the new files.
const START_TIMEOUT: Duration = Duration::from_secs(180);
const STOP_GRACE: Duration = Duration::from_secs(8);
const LOG_TAIL_BYTES: u64 = 4096;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum Status {
    Starting,
    Ready { url: String, origin: String },
    Failed { message: String, detail: Option<String> },
}

struct Running {
    child: Child,
    /// Closing this pipe asks the server to shut down cleanly (`ltts serve --exit-with-stdin`).
    stdin: Option<ChildStdin>,
}

struct StartError {
    message: String,
    detail: Option<String>,
}

impl StartError {
    fn new(message: impl Into<String>, detail: Option<String>) -> Self {
        Self {
            message: message.into(),
            detail,
        }
    }
}

pub struct Backend {
    status: Mutex<Status>,
    running: Mutex<Option<Running>>,
}

impl Backend {
    pub fn new() -> Self {
        Self {
            status: Mutex::new(Status::Starting),
            running: Mutex::new(None),
        }
    }

    pub fn status(&self) -> Status {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or(Status::Starting)
    }

    /// The window's allowed origin while the server runs, e.g. `http://127.0.0.1:8770`.
    pub fn origin(&self) -> Option<String> {
        match self.status() {
            Status::Ready { origin, .. } => Some(origin),
            _ => None,
        }
    }

    fn set(&self, status: Status) {
        if let Ok(mut slot) = self.status.lock() {
            *slot = status;
        }
    }

    /// Starts the server (stopping one that still runs) and returns how that went.
    pub fn start(&self, paths: &Paths) -> Status {
        self.stop();
        self.set(Status::Starting);
        let status = match self.spawn_and_wait(paths) {
            Ok(port) => Status::Ready {
                url: format!("http://127.0.0.1:{port}/"),
                origin: format!("http://127.0.0.1:{port}"),
            },
            Err(error) => {
                note(paths, &format!("server did not start: {}", error.message));
                self.stop();
                Status::Failed {
                    message: error.message,
                    detail: error.detail,
                }
            }
        };
        self.set(status.clone());
        status
    }

    fn spawn_and_wait(&self, paths: &Paths) -> Result<u16, StartError> {
        let python = paths.runtime.join("python").join("ttsnative-backend.exe");
        if !python.is_file() {
            return Err(StartError::new(
                "Some of TTSNative's files are missing. Reinstall TTSNative from ttsnative.com; your documents and voices are kept.",
                Some(format!("Not found: {}", python.display())),
            ));
        }
        let port = free_port().ok_or_else(|| {
            StartError::new(
                "No free local port was found for TTSNative's reading engine. Restart your computer and try again.",
                None,
            )
        })?;
        let log_path = paths.logs().join("server.log");
        let log = open_log(&log_path)
            .map_err(|error| StartError::new("TTSNative couldn't write its log file.", Some(error.to_string())))?;
        let mut child = self.command(paths, &python, port, log)?;
        contain(&child);
        let stdin = child.stdin.take();
        if let Ok(mut slot) = self.running.lock() {
            *slot = Some(Running { child, stdin });
        }
        note(paths, &format!("server starting on port {port}"));
        self.wait_until_healthy(port, &log_path)
    }

    fn command(&self, paths: &Paths, python: &Path, port: u16, log: File) -> Result<Child, StartError> {
        let runtime = &paths.runtime;
        let mut command = Command::new(python);
        // -I ignores PYTHON* variables and user site-packages; -B keeps the install folder free of caches.
        command
            .args([
                "-I",
                "-B",
                "-X",
                "utf8",
                "-m",
                "ltts.cli",
                "serve",
                "--host",
                "127.0.0.1",
            ])
            .arg("--port")
            .arg(port.to_string())
            .arg("--static")
            .arg(runtime.join("web"))
            .arg("--exit-with-stdin")
            .current_dir(paths.data());
        for (key, _) in std::env::vars_os() {
            if key.to_string_lossy().to_ascii_uppercase().starts_with("LTTS_") {
                command.env_remove(key);
            }
        }
        command
            .env("LTTS_ENV", "production")
            .env("LTTS_DATA_DIR", paths.data())
            .env("LTTS_BUNDLED_MODELS_DIR", runtime.join("models"))
            .env("LTTS_UV_BIN", runtime.join("uv").join("uv.exe"))
            .env("LTTS_WORKER_PROJECT_DIR", runtime.join("worker"))
            .env("LTTS_UV_PYTHON_DIR", paths.tools().join("python"));
        let errors = log
            .try_clone()
            .map_err(|error| StartError::new("TTSNative couldn't write its log file.", Some(error.to_string())))?;
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::from(log))
            .stderr(Stdio::from(errors));
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        command.spawn().map_err(|error| {
            StartError::new(
                "TTSNative's reading engine couldn't be started.",
                Some(error.to_string()),
            )
        })
    }

    fn wait_until_healthy(&self, port: u16, log_path: &Path) -> Result<u16, StartError> {
        let deadline = Instant::now() + START_TIMEOUT;
        loop {
            let exited = self.running.lock().ok().and_then(|mut slot| {
                slot.as_mut()
                    .and_then(|running| running.child.try_wait().ok().flatten())
            });
            if let Some(code) = exited {
                return Err(StartError::new(
                    format!("TTSNative's reading engine stopped while starting ({code})."),
                    log_tail(log_path),
                ));
            }
            if healthy(port) {
                return Ok(port);
            }
            if Instant::now() > deadline {
                return Err(StartError::new(
                    "TTSNative's reading engine took too long to start.",
                    log_tail(log_path),
                ));
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    }

    /// Asks the server to finish cleanly, then ends it if it hasn't within the grace period.
    pub fn stop(&self) {
        let running = self.running.lock().ok().and_then(|mut slot| slot.take());
        let Some(mut running) = running else { return };
        drop(running.stdin.take());
        let deadline = Instant::now() + STOP_GRACE;
        while Instant::now() < deadline {
            if matches!(running.child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = running.child.kill();
        let _ = running.child.wait();
    }
}

fn free_port() -> Option<u16> {
    (PREFERRED_PORT..PREFERRED_PORT + PORT_ATTEMPTS)
        .find(|port| TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, *port)).is_ok())
}

fn healthy(port: u16) -> bool {
    let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port).into();
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_secs(2)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let request = format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    let _ = stream.take(16 * 1024).read_to_string(&mut response);
    response.starts_with("HTTP/1.1 200") && response.contains("\"status\":\"ok\"")
}

/// Keeps the previous run's log as `server.previous.log` and starts a fresh one.
fn open_log(path: &Path) -> std::io::Result<File> {
    if path.is_file() {
        let _ = std::fs::rename(path, path.with_file_name("server.previous.log"));
    }
    File::create(path)
}

fn log_tail(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let length = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(length.saturating_sub(LOG_TAIL_BYTES))).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    let text = String::from_utf8_lossy(&bytes).trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// Puts the server in a Job Object that ends everything in it when the app exits or crashes. The job's
/// handle is deliberately kept open (leaked) until this process ends.
#[cfg(windows)]
fn contain(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    let mut info = win32job::ExtendedLimitInfo::new();
    info.limit_kill_on_job_close();
    if let Ok(job) = win32job::Job::create_with_limit_info(&info) {
        if job.assign_process(child.as_raw_handle() as isize).is_ok() {
            std::mem::forget(job);
        }
    }
}

#[cfg(not(windows))]
fn contain(_child: &Child) {}

/// Appends a line to `logs/desktop.log` (no document text or personal data is ever written).
pub fn note(paths: &Paths, message: &str) {
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(paths.logs().join("desktop.log"))
    {
        let _ = writeln!(file, "{} {message}", crate::prefs::now());
    }
}
