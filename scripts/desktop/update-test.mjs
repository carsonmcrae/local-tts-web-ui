// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Prove the whole update path works between two real builds, including its failures.
 * Scope: Makes a throwaway update key, builds version A and a newer version B that trust it and look
 *   for updates on a local server, installs A, and drives its window through WebView2's debugging
 *   port: the update notice appears with B's notes; an update whose signature doesn't match and one
 *   whose download breaks off are refused with an explanation and A keeps running; then a good update
 *   downloads, verifies, installs B and reopens it, with the user's document still there. Finally B is
 *   uninstalled. CI only (it installs software for the current user); never uses the release key.
 *   Usage: `node scripts/desktop/update-test.mjs`.
 * Does NOT belong: The installer smoke test (smoke-test.mjs) or release builds (build.mjs).
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { repoRoot } from '../lib/paths.mjs';

const OLD = '2.1.0-updatetest.1';
const NEW = '2.1.0-updatetest.2';
const PORT = 8799;
const NOTES =
  'An update made by the update test.\n\n## Fixed\n\n- The update test can see these notes.';
const local = process.env.LOCALAPPDATA ?? '';
const installDir = path.join(local, 'TTSNative');
const work = mkdtempSync(path.join(tmpdir(), 'ttsnative-update-'));
const system32 = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32');
const REG = path.join(system32, 'reg.exe');
const KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\TTSNative`;

/** @param {boolean} condition @param {string} message */
function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ${message}`);
}

/** @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
function node(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) throw new Error(`FAILED: ${args.join(' ')}`);
}

function updateKey() {
  const password = 'update-test-only';
  const file = path.join(work, 'update.key');
  node([
    path.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    'signer',
    'generate',
    '--ci',
    '-w',
    file,
    '-p',
    password,
  ]);
  return {
    password,
    privateKey: readFileSync(file, 'utf8'),
    publicKey: readFileSync(`${file}.pub`, 'utf8').trim(),
  };
}

/** @param {string} version @param {ReturnType<typeof updateKey>} key */
function build(version, key) {
  const config = {
    plugins: {
      updater: {
        pubkey: key.publicKey,
        endpoints: [`http://127.0.0.1:${PORT}/latest.json`],
        dangerousInsecureTransportProtocol: true,
      },
    },
  };
  const npm = /** @type {string} */ (process.env.npm_execpath);
  node([npm, 'run', 'desktop:build'], {
    TTSNATIVE_BUILD_VERSION: version,
    TTSNATIVE_TAURI_CONFIG: JSON.stringify(config),
    TAURI_SIGNING_PRIVATE_KEY: key.privateKey,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: key.password,
  });
  const built = path.join(repoRoot, 'dist', 'desktop', `TTSNative-Setup-${version}.exe`);
  const target = path.join(work, `${version}.exe`);
  copyFileSync(built, target);
  copyFileSync(`${built}.sig`, `${target}.sig`);
  return target;
}

/** Serves latest.json and the new installer; `mode` decides what a check finds. */
function updateServer(/** @type {string} */ installer, /** @type {string} */ wrongSignature) {
  const bytes = readFileSync(installer);
  const state = { mode: 'bad-signature' };
  const server = createServer((request, response) => {
    if (request.url === '/latest.json') {
      const signature =
        state.mode === 'bad-signature' ? wrongSignature : readFileSync(`${installer}.sig`, 'utf8');
      const file = state.mode === 'broken-download' ? 'broken.exe' : 'update.exe';
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          version: NEW,
          notes: NOTES,
          pub_date: '2026-11-02T00:00:00Z',
          platforms: { 'windows-x86_64': { signature, url: `http://127.0.0.1:${PORT}/${file}` } },
        }),
      );
    } else if (request.url === '/update.exe') {
      response.setHeader('content-length', String(bytes.length));
      response.end(bytes);
    } else if (request.url === '/broken.exe') {
      response.setHeader('content-length', String(bytes.length));
      response.write(bytes.subarray(0, bytes.length / 3), () => request.socket.destroy());
    } else {
      response.statusCode = 404;
      response.end();
    }
  });
  server.listen(PORT, '127.0.0.1');
  return { state, close: () => server.close() };
}

async function serverOrigin(/** @type {number} */ timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let port = 8770; port < 8790; port += 1) {
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

/**
 * The app's page, through WebView2's debugging port (it can open a little after the server answers).
 * @param {string} origin
 */
async function appPage(origin) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => null);
    const page = browser
      ?.contexts()
      .flatMap((context) => context.pages())
      .find((item) => item.url().startsWith(origin));
    if (page) return page;
    await browser?.close().catch(() => undefined);
    await sleep(1000);
  }
  const webviews = spawnSync(
    path.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Where-Object { $_.CommandLine -match 'TTSNative' } | Select-Object -First 1 -ExpandProperty CommandLine",
    ],
    { encoding: 'utf8' },
  ).stdout;
  console.log(
    `(TTSNative processes running: ${running()}; web view: ${webviews.trim() || 'none'})`,
  );
  throw new Error('FAILED: the app window could not be reached through WebView2');
}

const installedVersion = () =>
  /DisplayVersion\s+REG_SZ\s+(\S+)/.exec(
    execFileSync(REG, ['query', KEY], { encoding: 'utf8' }),
  )?.[1];
const running = () =>
  execFileSync(path.join(system32, 'tasklist.exe'), ['/FI', 'IMAGENAME eq TTSNative.exe'], {
    encoding: 'utf8',
  }).includes('TTSNative.exe');

async function main() {
  const key = updateKey();
  const older = build(OLD, key);
  const newer = build(NEW, key);
  const server = updateServer(newer, readFileSync(`${older}.sig`, 'utf8'));
  try {
    check(spawnSync(older, ['/S'], { stdio: 'inherit' }).status === 0, `installed ${OLD}`);
    // A copy started without the debugging port would take the single instance; end it first.
    if (running()) {
      console.log('(the app was already running after the install; ending it)');
      spawnSync(path.join(system32, 'taskkill.exe'), ['/IM', 'TTSNative.exe', '/F'], {
        stdio: 'ignore',
      });
      await sleep(3000);
    }
    spawn(path.join(installDir, 'TTSNative.exe'), [], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222',
      },
    }).unref();
    const origin = await serverOrigin(240_000);
    const document = /** @type {{ id: string }} */ (
      await (
        await fetch(`${origin}/api/documents/text`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-ltts-client': 'update-test' },
          body: JSON.stringify({
            title: 'Kept across updates',
            text: 'This document must survive the update.',
          }),
        })
      ).json()
    );
    const page = await appPage(origin);
    const notice = page.getByRole('region', { name: 'Update available' });
    await notice.getByText(`TTSNative ${NEW} is available`).waitFor({ timeout: 60_000 });
    check(
      await notice.getByText('The update test can see these notes.').isVisible(),
      'the notice shows the new notes',
    );
    await notice.getByRole('button', { name: 'Update now' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Install and restart' }).click();
    await dialog
      .getByRole('alert')
      .getByText(/couldn.t be downloaded and verified/)
      .waitFor({ timeout: 120_000 });
    check(
      running() && installedVersion() === OLD,
      'an update with a wrong signature is refused; the app keeps running',
    );
    server.state.mode = 'broken-download';
    await dialog.getByRole('button', { name: 'Try again' }).click();
    await page.waitForTimeout(3000);
    await dialog
      .getByRole('alert')
      .getByText(/couldn.t be downloaded and verified/)
      .waitFor({ timeout: 120_000 });
    check(
      running() && installedVersion() === OLD,
      'an interrupted download is refused; the app keeps running',
    );
    server.state.mode = 'good';
    await dialog
      .getByRole('button', { name: 'Try again' })
      .click()
      .catch(() => undefined);
    await page
      .context()
      .browser()
      ?.close()
      .catch(() => undefined);
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline && installedVersion() !== NEW) await sleep(1000);
    check(installedVersion() === NEW, `the verified update installed ${NEW}`);
    const reopened = await serverOrigin(240_000);
    check(running(), 'TTSNative reopened after the update');
    const documents = await (await fetch(`${reopened}/api/documents`)).text();
    check(documents.includes(document.id), 'the document is still there after the update');
  } finally {
    server.close();
    spawnSync(path.join(system32, 'taskkill.exe'), ['/IM', 'TTSNative.exe', '/F'], {
      stdio: 'ignore',
    });
  }
}

try {
  await main();
  await sleep(3000);
  spawnSync(path.join(installDir, 'uninstall.exe'), ['/S'], { stdio: 'inherit' });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
