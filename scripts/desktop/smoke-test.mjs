// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Prove a built Windows installer works for someone with no developer tools.
 * Scope: Silent per-user install; Installed Apps entry with the right version and publisher; start
 *   TTSNative.exe; the bundled server answers on loopback with the bundled Kokoro model ready; real
 *   speech (a voice preview) and an MP3 export of pasted text; the app serves this installer's web
 *   build byte for byte at every route and reports this version (the Windows app and the browser get
 *   the same interface); only the app's own window is visible
 *   (no console windows); a second launch doesn't start another server; closing stops the server;
 *   the document is still there after a restart; silent uninstall removes the app but keeps the user's
 *   data. Usage: `node scripts/desktop/smoke-test.mjs <TTSNative-Setup-X.Y.Z.exe> <X.Y.Z>`.
 *   Run it only on a disposable machine (CI): it installs and uninstalls TTSNative for the current user.
 * Does NOT belong: Building (build.mjs) or the update path (update-test.mjs).
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { APP_ROUTES } from '../lib/app-routes.mjs';
import { describe, leftoverProcesses } from './processes.mjs';
import { repoRoot } from '../lib/paths.mjs';

const [installer = '', version = ''] = process.argv.slice(2);
const local = process.env.LOCALAPPDATA ?? '';
const installDir = path.join(local, 'TTSNative');
const dataDir = path.join(local, 'com.ttsnative.desktop', 'data');
const POWERSHELL = path.join(
  process.env.SystemRoot ?? 'C:/Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);
const REG = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'reg.exe');
const HEADERS = { 'content-type': 'application/json', 'x-ltts-client': 'smoke-test' };

/** @param {boolean} condition @param {string} message */
function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ${message}`);
}

/** @param {string} script */
function powershell(script) {
  return execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  }).trim();
}

/** @param {string} name */
function processCount(name) {
  return Number(powershell(`@(Get-Process -Name '${name}' -ErrorAction SilentlyContinue).Count`));
}

/** @param {number} timeoutMs @returns {Promise<string>} the server's origin */
async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let port = 8770; port < 8790; port += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: AbortSignal.timeout(1500),
        });
        if (response.ok) return `http://127.0.0.1:${port}`;
      } catch {
        // not this port yet
      }
    }
    await sleep(1000);
  }
  throw new Error('FAILED: the bundled server did not answer within the time limit');
}

/** @param {string} name @param {number} timeoutMs */
async function waitUntilGone(name, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && processCount(name) > 0) await sleep(500);
  return processCount(name) === 0;
}

function launch() {
  spawn(path.join(installDir, 'TTSNative.exe'), [], { detached: true, stdio: 'ignore' }).unref();
}

/** @param {string} origin */
async function journey(origin) {
  const engines = /** @type {{ id: string, status: string }[]} */ (
    await (await fetch(`${origin}/api/engines`)).json()
  );
  check(
    engines.find((engine) => engine.id === 'kokoro')?.status === 'ready',
    'the bundled Kokoro voice is ready without a download',
  );
  const preview = await fetch(`${origin}/api/voices/kokoro:af_heart/preview`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ text: 'Hello from the TTSNative installer test.' }),
  });
  const audio = Buffer.from(await preview.arrayBuffer());
  check(preview.ok && audio.length > 20_000, `real speech was generated (${audio.length} bytes)`);
  const document = /** @type {{ id: string }} */ (
    await (
      await fetch(`${origin}/api/documents/text`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          title: 'Installer test',
          text: 'This sentence is read aloud. And so is this one.',
        }),
      })
    ).json()
  );
  /** @typedef {{ id: string, status: string }} Job */
  const job = /** @type {Job} */ (
    await (
      await fetch(`${origin}/api/exports`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          documentId: document.id,
          voiceId: 'kokoro:af_heart',
          format: 'mp3',
        }),
      })
    ).json()
  );
  let status = job.status;
  for (
    let attempt = 0;
    attempt < 120 && !['succeeded', 'failed', 'canceled'].includes(status);
    attempt += 1
  ) {
    await sleep(1000);
    status = /** @type {Job} */ (await (await fetch(`${origin}/api/jobs/${job.id}`)).json()).status;
  }
  const mp3 = Buffer.from(
    await (await fetch(`${origin}/api/exports/${job.id}/download`)).arrayBuffer(),
  );
  check(
    status === 'succeeded' && mp3.length > 5_000,
    `an MP3 export finished (${mp3.length} bytes)`,
  );
  const page = await (await fetch(`${origin}/`)).text();
  check(page.includes('<div id="root"'), 'the reader UI is served by the bundled server');
  await servesThisBuild(origin, page, document.id);
  return document.id;
}

/** @param {Buffer | string} bytes */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * The installed app serves exactly the web build this installer was made from (every file under
 * apps/web/dist, byte for byte) at every page of the app, and reports this build's version: the
 * Windows app and a browser on the computer get the same interface.
 * @param {string} origin @param {string} page the served start page @param {string} documentId
 */
async function servesThisBuild(origin, page, documentId) {
  const dist = path.join(repoRoot, 'apps', 'web', 'dist');
  const built = readFileSync(path.join(dist, 'index.html'), 'utf8');
  check(page === built, 'the start page is the one this installer was built with');
  // Every file, not only assets/: the music chunks, sound effects and icons are part of the build too.
  const files = readdirSync(dist, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => statSync(path.join(dist, file)).isFile());
  const differ = [];
  for (const file of files) {
    const served = await fetch(`${origin}/${file.split('/').map(encodeURIComponent).join('/')}`);
    const bytes = Buffer.from(await served.arrayBuffer());
    if (!served.ok || sha256(bytes) !== sha256(readFileSync(path.join(dist, file))))
      differ.push(file);
  }
  const music = files.filter((file) => file.startsWith('music/')).length;
  const detail = differ.length ? ` (differ: ${differ.join(', ')})` : '';
  check(
    differ.length === 0,
    `all ${files.length} web files are served unchanged, ${music} of them music${detail}`,
  );
  for (const route of ['/', ...APP_ROUTES.map((page) => page.replace(':documentId', documentId))]) {
    const response = await fetch(`${origin}${route}`);
    check(response.ok && (await response.text()) === built, `${route} opens the app`);
  }
  const health = /** @type {{ version: string }} */ (
    await (await fetch(`${origin}/api/health`)).json()
  );
  check(health.version === version, `the app reports version ${version}`);
}

async function main() {
  check(
    existsSync(installer) && Boolean(version),
    `installer ${path.basename(installer)} for ${version}`,
  );
  const install = spawnSync(installer, ['/S'], { stdio: 'inherit' });
  check(install.status === 0, 'silent per-user install finished');
  check(existsSync(path.join(installDir, 'TTSNative.exe')), `installed to ${installDir}`);
  check(
    existsSync(path.join(installDir, 'runtime', 'python', 'ttsnative-backend.exe')),
    'the runtime is bundled',
  );
  const key = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\TTSNative`;
  const registry = execFileSync(REG, ['query', key], { encoding: 'utf8' });
  check(
    registry.includes(version) && registry.includes('Carson McRae'),
    'Installed Apps shows the version and publisher',
  );

  launch();
  const origin = await waitForServer(240_000);
  check(true, `the app started its server at ${origin}`);
  const documentId = await journey(origin);
  const windows = powershell(
    'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.ProcessName } | Sort-Object -Unique',
  ).split(/\r?\n/);
  check(windows.includes('TTSNative'), 'TTSNative has its own window');
  const title = powershell(
    '(Get-Process -Name TTSNative | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowTitle',
  );
  check(title === 'TTSNative', `the window is titled "${title}"`);
  check(
    !windows.some((name) => /^(ttsnative-backend|python|conhost|uv|cmd)$/i.test(name)),
    `no console windows (${windows.join(', ')})`,
  );
  launch();
  await sleep(5000);
  check(
    processCount('TTSNative') === 1 && processCount('ttsnative-backend') >= 1,
    'a second launch reuses the running app',
  );

  powershell('Get-Process -Name TTSNative | ForEach-Object { [void]$_.CloseMainWindow() }');
  check(await waitUntilGone('TTSNative', 30_000), 'closing the window quits the app');
  check(await waitUntilGone('ttsnative-backend', 20_000), 'the server stopped with the app');
  // Nothing else either: the web view, uv, a voice-cloning worker, anything run from the app's folders.
  const leftovers = await leftoverProcesses();
  const detail = leftovers.length ? `: ${describe(leftovers)}` : '';
  check(leftovers.length === 0, `nothing of TTSNative is left running${detail}`);

  launch();
  const again = await waitForServer(120_000);
  const documents = await (await fetch(`${again}/api/documents`)).json();
  check(
    JSON.stringify(documents).includes(documentId),
    'the document is still there after a restart',
  );
  powershell('Get-Process -Name TTSNative | ForEach-Object { [void]$_.CloseMainWindow() }');
  await waitUntilGone('ttsnative-backend', 30_000);

  const uninstall = spawnSync(path.join(installDir, 'uninstall.exe'), ['/S'], { stdio: 'inherit' });
  check(uninstall.status === 0, 'silent uninstall finished');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && existsSync(path.join(installDir, 'TTSNative.exe')))
    await sleep(500);
  check(!existsSync(path.join(installDir, 'TTSNative.exe')), 'the app was removed');
  check(existsSync(path.join(dataDir, 'ltts.sqlite3')), `your data was kept (${dataDir})`);
  // The uninstaller finishes in the background (it runs from a temporary copy of itself).
  const listed = () => spawnSync(REG, ['query', key]).status === 0;
  while (Date.now() < deadline + 30_000 && listed()) await sleep(500);
  check(!listed(), 'Installed Apps no longer lists TTSNative');
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
