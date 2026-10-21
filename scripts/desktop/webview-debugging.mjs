// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Start the installed TTSNative with WebView2's debugging port open, so a test can drive its window.
 * Scope: Ends any running copy first (one without the port would take the single instance), starts the
 *   app with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, waits for its server and checks that the port answers.
 *   When WebView2 ignores the variable (seen on GitHub's Windows runners), starts again with Microsoft's
 *   documented registry override (HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments,
 *   read only when the variable is absent), which `removeDebugOverride` takes away again. Finds the app's
 *   page over CDP. When the port never opens, prints the browser process's switches so the cause shows.
 *   TTSNATIVE_WEBVIEW_DEBUG=registry skips the variable, to test that route by hand.
 * Does NOT belong: What the tests check (persistence-test.mjs, update-test.mjs) or installing (smoke-test.mjs).
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const system32 = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32');
const POWERSHELL = path.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const REG = path.join(system32, 'reg.exe');
const POLICY = String.raw`HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`;
/** The names WebView2 looks up, in order: the app's user model id, its executable, then any app. */
const APP_IDS = ['com.ttsnative.desktop', 'TTSNative.exe', '*'];
const PORTS = { first: 8770, last: 8789 };

/** @type {{ keyExisted: boolean } | null} what `removeDebugOverride` must undo */
let override = null;

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

/** The server's origin once it answers, on the first free port the app tries. @param {number} timeoutMs */
export async function serverOrigin(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let port = PORTS.first; port <= PORTS.last; port += 1) {
      const ok = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1500),
      })
        .then((response) => response.ok)
        .catch(() => false);
      if (ok) return `http://127.0.0.1:${port}`;
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

/** @param {number} port */
function setDebugOverride(port) {
  const keyExisted = spawnSync(REG, ['query', POLICY], { stdio: 'ignore' }).status === 0;
  for (const id of APP_IDS) {
    execFileSync(
      REG,
      ['add', POLICY, '/v', id, '/t', 'REG_SZ', '/d', `--remote-debugging-port=${port}`, '/f'],
      { stdio: 'ignore' },
    );
  }
  override = { keyExisted };
}

/** Takes the registry override away again (a no-op when it was never set). */
export function removeDebugOverride() {
  if (!override) return;
  for (const id of APP_IDS) spawnSync(REG, ['delete', POLICY, '/v', id, '/f'], { stdio: 'ignore' });
  if (!override.keyExisted) spawnSync(REG, ['delete', POLICY, '/f'], { stdio: 'ignore' });
  override = null;
}

/**
 * Starts the app with the debugging port open and returns its server's origin.
 * @param {string} exe
 * @param {number} port
 */
export async function launchForDebugging(exe, port) {
  const routes =
    process.env.TTSNATIVE_WEBVIEW_DEBUG === 'registry' ? ['registry'] : ['variable', 'registry'];
  for (const route of routes) {
    await endApp();
    const env = { ...process.env };
    delete env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
    if (route === 'variable')
      env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port}`;
    else setDebugOverride(port);
    spawn(exe, [], { detached: true, stdio: 'ignore', env }).unref();
    const origin = await serverOrigin(240_000);
    if (await portAnswers(port, 30_000)) return origin;
    console.log(
      `(WebView2 did not open port ${port} through the ${route === 'variable' ? 'environment variable' : 'registry override'}; browser switches: ${browserSwitches().join(' ')})`,
    );
  }
  throw new Error('FAILED: the app window could not be reached through WebView2');
}

/**
 * The app's page, through the debugging port (it can appear a little after the server answers).
 * @param {number} port
 * @param {string} origin
 */
export async function appPage(port, origin) {
  const deadline = Date.now() + 90_000;
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
