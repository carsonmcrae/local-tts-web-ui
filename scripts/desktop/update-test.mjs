// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Prove the whole update path works between two real builds, including its failures.
 * Scope: Makes a throwaway update key, builds version A and a newer version B that trust it and look
 *   for updates on a local server, installs A, and drives its window through WebView2's debugging
 *   port: the update notice appears with B's notes; an update whose signature doesn't match (A's own
 *   signature, then B signed with a second throwaway key) and one whose download breaks off are
 *   refused with an explanation and A keeps running; then a good update
 *   downloads, verifies, installs B and reopens it, with the user's document still there. Finally B is
 *   uninstalled. CI only (it installs software for the current user); never uses the release key.
 *   Usage: no arguments does it all. CI builds A and B at the same time: `--make-key <dir>`, then
 *   `--build old|new --key <dir> --out <dir>` for each, then `--test <dir>` on what the builds left.
 * Does NOT belong: The installer smoke test (smoke-test.mjs) or release builds (build.mjs).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { repoRoot } from '../lib/paths.mjs';
import {
  appPage,
  endApp,
  isRunning,
  launchForDebugging,
  serverOrigin,
} from './webview-debugging.mjs';

const OLD = '2.1.0-updatetest.1';
const NEW = '2.1.0-updatetest.2';
const PORT = 8799;
const DEBUG_PORT = 9222;
const NOTES =
  'An update made by the update test.\n\n## Fixed\n\n- The update test can see these notes.';
const local = process.env.LOCALAPPDATA ?? '';
const installDir = path.join(local, 'TTSNative');
const KEY_PASSWORD = 'update-test-only';
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

const TAURI_CLI = path.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

/** Writes a new throwaway update key (update.key and update.key.pub) into `dir`. */
function makeKey(/** @type {string} */ dir) {
  mkdirSync(dir, { recursive: true });
  node([
    TAURI_CLI,
    'signer',
    'generate',
    '--ci',
    '-w',
    path.join(dir, 'update.key'),
    '-p',
    KEY_PASSWORD,
  ]);
}

/**
 * B's bytes signed by a key the app has never seen: a copy of `installer` in a folder of its own,
 * signed with a second throwaway key made there. Returns that signature (the app must refuse it).
 */
function signWithAnotherKey(/** @type {string} */ installer) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ttsnative-other-key-'));
  makeKey(dir);
  const copy = path.join(dir, path.basename(installer));
  copyFileSync(installer, copy);
  node([TAURI_CLI, 'signer', 'sign', '-k', path.join(dir, 'update.key'), '-p', KEY_PASSWORD, copy]);
  return readFileSync(`${copy}.sig`, 'utf8');
}

function readKey(/** @type {string} */ dir) {
  const file = path.join(dir, 'update.key');
  return {
    password: KEY_PASSWORD,
    privateKey: readFileSync(file, 'utf8'),
    publicKey: readFileSync(`${file}.pub`, 'utf8').trim(),
  };
}

/** Builds `version` trusting `key`; its installer and signature land in `out` as `<version>.exe(.sig)`. */
function build(
  /** @type {string} */ version,
  /** @type {ReturnType<typeof readKey>} */ key,
  /** @type {string} */ out,
) {
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
  const target = path.join(out, `${version}.exe`);
  mkdirSync(out, { recursive: true });
  copyFileSync(built, target);
  copyFileSync(`${built}.sig`, `${target}.sig`);
  return target;
}

/**
 * Serves latest.json and the new installer; `mode` decides what a check finds: a signature that is
 * not B's (`wrongSignatures` by mode), a download that breaks off, or the good update.
 * @param {string} installer
 * @param {Record<string, string>} wrongSignatures
 */
function updateServer(installer, wrongSignatures) {
  const bytes = readFileSync(installer);
  const state = { mode: 'bad-signature' };
  const server = createServer((request, response) => {
    if (request.url === '/latest.json') {
      const signature = wrongSignatures[state.mode] ?? readFileSync(`${installer}.sig`, 'utf8');
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

const installedVersion = () =>
  /DisplayVersion\s+REG_SZ\s+(\S+)/.exec(
    execFileSync(REG, ['query', KEY], { encoding: 'utf8' }),
  )?.[1];

/**
 * Tries the update again in the dialog and expects it refused, with A still installed and running.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 * @param {string} what
 */
async function retryRefused(page, dialog, what) {
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await page.waitForTimeout(3000);
  await dialog
    .getByRole('alert')
    .getByText(/couldn.t be downloaded and verified/)
    .waitFor({ timeout: 120_000 });
  check(isRunning() && installedVersion() === OLD, `${what} is refused; the app keeps running`);
}

/**
 * Installs A, refuses a wrong signature (A's own, then one from a key the app doesn't know) and a
 * broken download, then updates to B.
 */
async function verify(/** @type {string} */ older, /** @type {string} */ newer) {
  const server = updateServer(newer, {
    'bad-signature': readFileSync(`${older}.sig`, 'utf8'),
    'other-key': signWithAnotherKey(newer),
  });
  try {
    check(spawnSync(older, ['/S'], { stdio: 'inherit' }).status === 0, `installed ${OLD}`);
    const origin = await launchForDebugging(path.join(installDir, 'TTSNative.exe'), DEBUG_PORT);
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
    const page = await appPage(DEBUG_PORT, origin);
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
      isRunning() && installedVersion() === OLD,
      'an update with a wrong signature is refused; the app keeps running',
    );
    server.state.mode = 'other-key';
    await retryRefused(page, dialog, 'an update signed with a different key');
    server.state.mode = 'broken-download';
    await retryRefused(page, dialog, 'an interrupted download');
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
    const reopened = await serverOrigin(240_000, origin);
    check(isRunning(), 'TTSNative reopened after the update');
    const documents = await (await fetch(`${reopened}/api/documents`)).text();
    check(documents.includes(document.id), 'the document is still there after the update');
  } finally {
    server.close();
    await endApp();
  }
}

/** Runs the update test on two installers, then uninstalls what it installed. */
async function test(/** @type {string} */ older, /** @type {string} */ newer) {
  await verify(older, newer);
  await sleep(3000);
  spawnSync(path.join(installDir, 'uninstall.exe'), ['/S'], { stdio: 'inherit' });
}

async function main() {
  const { values } = parseArgs({
    options: {
      'make-key': { type: 'string' },
      build: { type: 'string' },
      key: { type: 'string' },
      out: { type: 'string' },
      test: { type: 'string' },
    },
  });
  const versions = new Map([
    ['old', OLD],
    ['new', NEW],
  ]);
  if (values['make-key']) {
    makeKey(values['make-key']);
  } else if (values.build) {
    const version = versions.get(values.build);
    if (!version || !values.key || !values.out) {
      throw new Error('Usage: --build old|new --key <key dir> --out <installer dir>');
    }
    build(version, readKey(values.key), values.out);
  } else if (values.test) {
    await test(path.join(values.test, `${OLD}.exe`), path.join(values.test, `${NEW}.exe`));
  } else {
    const work = mkdtempSync(path.join(tmpdir(), 'ttsnative-update-'));
    makeKey(work);
    const key = readKey(work);
    await test(build(OLD, key, work), build(NEW, key, work));
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
