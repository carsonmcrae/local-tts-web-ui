// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Find every process that belongs to the installed TTSNative, whatever its name.
 * Scope: The app (TTSNative.exe), its server (ttsnative-backend.exe), WebView2 (msedgewebview2.exe with
 *   the app's browser profile), uv while an engine installs, and the optional Chatterbox worker, which
 *   runs as a plain python.exe from the virtual environment under the app's data folder: anything whose
 *   program or command line lives under the install folder or the data folder. The installed-app tests
 *   use it to prove nothing lingers after a close or a crash.
 * Does NOT belong: Starting or stopping the app (webview-debugging.mjs) or the tests themselves.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const POWERSHELL = path.join(
  process.env.SystemRoot ?? 'C:/Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);
export const INSTALL_DIR = path.join(process.env.LOCALAPPDATA ?? '', 'TTSNative');
export const DATA_DIR = path.join(process.env.LOCALAPPDATA ?? '', 'com.ttsnative.desktop');

/** Runs a PowerShell command and returns what it printed, trimmed. @param {string} script */
export const powershell = (script) =>
  execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  }).trim();

/**
 * Processes running from, or started for, the installed app and its data folder (never the
 * PowerShell that asks, whose own command line names the folders).
 * @returns {{ pid: number, name: string, path: string }[]}
 */
export function appProcesses() {
  const script = [
    'Get-CimInstance Win32_Process | Where-Object {',
    `  $_.ProcessId -ne $PID -and (`,
    `    ($_.ExecutablePath -and ($_.ExecutablePath.StartsWith('${INSTALL_DIR}') -or $_.ExecutablePath.StartsWith('${DATA_DIR}'))) -or`,
    `    ($_.CommandLine -and ($_.CommandLine.Contains('${INSTALL_DIR}') -or $_.CommandLine.Contains('${DATA_DIR}')))`,
    '  )',
    '} | ForEach-Object { "$($_.ProcessId)|$($_.Name)|$($_.ExecutablePath)" }',
  ].join('\n');
  return powershell(script)
    .split(/\r?\n/)
    .filter((line) => line.includes('|'))
    .map((line) => {
      const [pid = '0', name = '', exe = ''] = line.split('|');
      return { pid: Number(pid), name, path: exe };
    });
}

/** `name pid` for each process, for a test message. */
export function describe(/** @type {ReturnType<typeof appProcesses>} */ processes) {
  return processes.map((process) => `${process.name} ${process.pid}`).join(', ');
}
