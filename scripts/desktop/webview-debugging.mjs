// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Start a test build of TTSNative with WebView2's debugging port open, so a test can drive its window.
 * Scope: Ends any running copy first (one without the port would take the single instance), starts the
 *   app with `--remote-debugging-port=N` (honoured only by builds with the `test-hooks` Cargo feature,
 *   which the Desktop workflow's installer and update builds have and a release never does), checks that
 *   the port answers, and takes the server's origin from the window's own address rather than scanning
 *   ports (another server in the range may answer first on a developer's PC). Finds the app's page over
 *   CDP. When the port never opens, prints the browser process's switches so the cause shows.
 * Does NOT belong: What the tests check (persistence-test.mjs, update-test.mjs) or installing (smoke-test.mjs).
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const system32 = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32');
const POWERSHELL = path.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const PORTS = { first: 8770, last: 8789 };

/** @param {string} script */
const powershell = (script) =>
  execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  }).trim();

export const isRunning = () =>
  execFileSync(path.join(system32, 'tasklist.exe'), ['/FI', 'IMAGENAME eq TTSNative.exe'], {
    encoding: 'utf8',
  }).includes('TTSNative.exe');

/** Ends the app (and, through its Job Object, the server) and waits until both are gone. */
export async function endApp() {
  if (!isRunning()) return;
  spawnSync(path.join(system32, 'taskkill.exe'), ['/IM', 'TTSNative.exe', '/F'], {
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 40 && isRunning(); attempt += 1) await sleep(500);
  await sleep(2000); // WebView2's browser process leaves a moment after its host
}

/** @param {string} origin */
const healthy = (origin) =>
  fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1500) })
    .then((response) => response.ok)
    .catch(() => false);

/**
 * The server's origin once it answers, without the window's help (after an update reopened the app):
 * the origin it used before, which the app takes again when free, else the first port that answers.
 * @param {number} timeoutMs
 * @param {string} [preferred]
 */
export async function serverOrigin(timeoutMs, preferred) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (preferred && (await healthy(preferred))) return preferred;
    for (let port = PORTS.first; port <= PORTS.last; port += 1) {
      const origin = `http://127.0.0.1:${port}`;
      if (origin !== preferred && (await healthy(origin))) return origin;
    }
    await sleep(1000);
  }
  throw new Error('FAILED: the app did not start its server');
}

/** @param {number} port @param {number} timeoutMs */
async function portAnswers(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    })
      .then((response) => response.ok)
      .catch(() => false);
    if (ok) return true;
    await sleep(1000);
  }
  return false;
}

/** The switches of the app's WebView2 browser process, for a diagnosis. */
function browserSwitches() {
  const line = powershell(
    "Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Where-Object { $_.CommandLine -match 'TTSNative' -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1 -ExpandProperty CommandLine",
  );
  return line ? line.split(' ').filter((part) => part.startsWith('--')) : ['(no browser process)'];
}

/**
 * Starts the app with the debugging port open and returns its server's origin.
 * @param {string} exe
 * @param {number} port
 */
export async function launchForDebugging(exe, port) {
  await endApp();
  spawn(exe, [`--remote-debugging-port=${port}`], { detached: true, stdio: 'ignore' }).unref();
  if (!(await portAnswers(port, 120_000))) {
    console.log(
      `(WebView2 did not open port ${port}: is this a test build? browser switches: ${browserSwitches().join(' ')})`,
    );
    throw new Error('FAILED: the app window could not be reached through WebView2');
  }
  // The window leaves the start-up page for the server's address once the server is ready, so its
  // address is the one to trust.
  const page = await appPage(port, 'http://127.0.0.1:', 240_000);
  const origin = new URL(page.url()).origin;
  await page.context().browser()?.close();
  // The first answers after start-up can take longer than one probe allows on a slow runner.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await healthy(origin)) return origin;
    await sleep(1000);
  }
  throw new Error(`FAILED: the window shows ${origin} but its server does not answer`);
}

/**
 * The app's page on the server's origin, through the debugging port (it can appear a little after the
 * server answers).
 * @param {number} port
 * @param {string} origin
 * @param {number} [timeoutMs]
 */
export async function appPage(port, origin, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => null);
    const page = browser
      ?.contexts()
      .flatMap((context) => context.pages())
      .find((item) => item.url().startsWith(origin));
    if (page) return page;
    await browser?.close().catch(() => undefined);
    await sleep(1000);
  }
  throw new Error('FAILED: the app window could not be reached through WebView2');
}
