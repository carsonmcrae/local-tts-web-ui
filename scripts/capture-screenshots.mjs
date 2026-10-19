// @ts-check
/**
 * Purpose: Regenerate the README screenshots from the real running app (no mock-ups).
 * Scope: Starts an isolated production-style server with the installed models, adds sample documents,
 *   plays real narration, and captures desktop (light/dark) and phone screenshots into docs/images.
 *   Usage: `npm run build && node scripts/capture-screenshots.mjs`.
 * Does NOT belong: Tests (tests/e2e) — this only produces images.
 */
import { chromium, devices } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { repoRoot } from './lib/paths.mjs';
import { waitForHttp } from './lib/processes.mjs';

const PORT = '8796';
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(repoRoot, 'docs', 'images');
const FIXTURES = path.join(repoRoot, 'tests', 'fixtures', 'documents');

/** @param {import('@playwright/test').Page} page @param {string} name */
async function upload(page, name) {
  await page.goto(`${BASE}/library`);
  await page.getByTestId('file-input').first().setInputFiles(path.join(FIXTURES, name));
  await page.waitForURL(/\/read\//);
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

    // Start from the empty library and use the app's own "Try a sample" button.
    await page.goto(`${BASE}/library`);
    await page.getByRole('button', { name: 'Try a sample' }).click();
    await page.waitForURL(/\/read\//);
    const sampleUrl = page.url();
    await upload(page, 'sample.epub');
    await upload(page, 'sample.docx');
    await upload(page, 'sample.pdf');
    await page.goto(sampleUrl);
    await page
      .getByRole('region', { name: 'Audio player' })
      .getByRole('button', { name: 'Play', exact: true })
      .click();
    await page.locator('[data-index="3"][data-active="true"]').waitFor({ timeout: 60_000 });
    await page.mouse.move(5, 890);
    await page.screenshot({ path: path.join(OUT, 'reader-light.png') });

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: path.join(OUT, 'reader-dark.png') });
    await page
      .getByRole('region', { name: 'Audio player' })
      .getByRole('button', { name: 'Pause', exact: true })
      .click();
    await page.waitForTimeout(1200);
    await page.emulateMedia({ colorScheme: 'light' });

    for (const [route, file] of [
      ['/library', 'library'],
      ['/voices', 'voices'],
      ['/settings#engines', 'settings'],
    ]) {
      await page.goto(`${BASE}${route}`);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(OUT, `${file}.png`) });
    }
    await page.goto(`${BASE}/studio`);
    await page.getByRole('button', { name: 'Create voice' }).first().click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Continue/ })
      .click();
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
    server.kill();
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
