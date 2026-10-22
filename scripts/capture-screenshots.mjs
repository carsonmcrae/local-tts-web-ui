// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Regenerate the README and website screenshots from the real running app (no mock-ups).
 * Scope: Starts an isolated production-style server with the installed models, adds sample documents
 *   and a few of the included books, organises them into a folder, a collection and favourites, plays
 *   real narration, and captures desktop (light/dark) and phone screenshots into docs/images: the
 *   reader on an included book with its reading experience chosen, the library with its rail, Explore,
 *   voices, settings and Voice Studio. Usage: `npm run build && node scripts/capture-screenshots.mjs`.
 * Does NOT belong: Tests (tests/e2e) — this only produces images.
 */
import { chromium, devices } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { repoRoot } from './lib/paths.mjs';
import { waitForHttp } from './lib/processes.mjs';

const PORT = '8796';
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(repoRoot, 'docs', 'images');
const FIXTURES = path.join(repoRoot, 'tests', 'fixtures', 'documents');
const TASKKILL = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'taskkill.exe');
const JSON_HEADERS = { 'content-type': 'application/json', 'x-ltts-client': 'screenshots' };

/** @param {import('@playwright/test').Page} page @param {string} name */
async function upload(page, name) {
  await page.goto(`${BASE}/library`);
  await page.getByTestId('file-input').first().setInputFiles(path.join(FIXTURES, name));
  await page.waitForURL(/\/read\//);
}

/** @param {string} route @param {RequestInit} [init] @returns {Promise<any>} */
async function api(route, init = {}) {
  const response = await fetch(`${BASE}${route}`, { ...init, headers: JSON_HEADERS });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${route} answered ${response.status}`);
  return response.status === 204 ? undefined : response.json();
}

/** Open a few of the included books and organise the library the way a reader might. */
async function organise() {
  const open = (/** @type {string} */ workId) =>
    api(`/api/library/works/${workId}/open`, { method: 'POST' });
  const alice = await open('alices-adventures-in-wonderland');
  const frankenstein = await open('frankenstein');
  const austen = await open('pride-and-prejudice');
  const holmes = await open('the-adventures-of-sherlock-holmes');
  const douglass = await open('narrative-of-the-life-of-frederick-douglass');
  const classics = await api('/api/library/folders', {
    method: 'POST',
    body: JSON.stringify({ name: 'Classics' }),
  });
  const bedtime = await api('/api/library/collections', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bedtime reading' }),
  });
  await api('/api/library/organize', {
    method: 'POST',
    body: JSON.stringify({
      documentIds: [alice.id, frankenstein.id, austen.id, holmes.id, douglass.id],
      folderId: classics.id,
    }),
  });
  await api('/api/library/organize', {
    method: 'POST',
    body: JSON.stringify({ documentIds: [alice.id, austen.id], favorite: true }),
  });
  await api(`/api/library/collections/${bedtime.id}/documents`, {
    method: 'POST',
    body: JSON.stringify({ add: [alice.id, holmes.id] }),
  });
  await api(`/api/documents/${alice.id}/shelf`, {
    method: 'PUT',
    body: JSON.stringify({ tags: ['read aloud', 'with the kids'] }),
  });
  return alice;
}

/** Wait until the player shows its Pause icon rather than the loading spinner between sentences. */
async function settled(/** @type {import('@playwright/test').Page} */ page) {
  await page
    .getByRole('region', { name: 'Audio player' })
    .locator('.animate-spin')
    .waitFor({ state: 'detached', timeout: 30_000 });
}

async function main() {
  const server = spawn(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'e2e-server.mjs'), '--port', PORT],
    { stdio: 'ignore' },
  );
  try {
    if (!(await waitForHttp(`${BASE}/api/health`, 120_000)))
      throw new Error('server did not start');
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: 'light',
    });
    const page = await desktop.newPage();

    // Start from the empty library: the app's own "Try a sample" button, a few uploads, then the
    // included books, organised.
    await page.goto(`${BASE}/library`);
    await page.getByRole('button', { name: 'Try a sample' }).click();
    await page.waitForURL(/\/read\//);
    await upload(page, 'sample.epub');
    await upload(page, 'sample.docx');
    await upload(page, 'sample.pdf');
    const alice = await organise();

    // The reader on an included book: its reading experience chosen, real narration under way.
    await page.goto(`${BASE}/read/${alice.id}`);
    const experience = page.getByRole('region', { name: 'Reading experience' });
    const applied = page.waitForResponse((response) => response.url().endsWith('/preset/apply'));
    await experience.getByText('Multi-voice', { exact: true }).click(); // the radio's label
    await applied;
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: /Chapter 1: Down the Rabbit-Hole/ })
      .first()
      .click();
    await page
      .getByRole('region', { name: 'Audio player' })
      .getByRole('button', { name: 'Play', exact: true })
      .click();
    await page.locator('[data-active="true"]').waitFor({ timeout: 60_000 });
    await page.mouse.move(5, 890);
    await settled(page);
    await page.screenshot({ path: path.join(OUT, 'reader-light.png') });

    await page.emulateMedia({ colorScheme: 'dark' });
    await settled(page);
    await page.screenshot({ path: path.join(OUT, 'reader-dark.png') });
    await page
      .getByRole('region', { name: 'Audio player' })
      .getByRole('button', { name: 'Pause', exact: true })
      .click();
    await page.waitForTimeout(1200);
    await page.emulateMedia({ colorScheme: 'light' });

    for (const [route, file] of [
      ['/library', 'library'],
      ['/explore', 'explore'],
      ['/voices', 'voices'],
      ['/settings#engines', 'settings'],
    ]) {
      await page.goto(`${BASE}${route}`);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(OUT, `${file}.png`) });
    }
    await page.goto(`${BASE}/studio`);
    // The chooser between a quick voice and a guided studio voice.
    await page.getByRole('button', { name: 'Create voice' }).first().click();
    await page.getByRole('dialog', { name: 'Create a voice' }).getByText('Studio voice').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'studio.png') });

    const phone = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
    const mobile = await phone.newPage();
    await mobile.goto(`${BASE}/library`);
    await mobile
      .getByRole('link', { name: /A Scandal in Bohemia/ })
      .first()
      .click();
    await mobile.waitForURL(/\/read\//);
    await mobile.waitForTimeout(800);
    await mobile.screenshot({ path: path.join(OUT, 'mobile-reader.png') });
    await browser.close();
    console.log(`Screenshots written to ${OUT}`);
  } finally {
    // On Windows, kill() ends the wrapper only; the server it started would keep the port.
    if (process.platform === 'win32' && server.pid)
      spawnSync(TASKKILL, ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill();
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
