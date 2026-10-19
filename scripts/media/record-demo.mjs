// @ts-check
/**
 * Purpose: Record the README demo video from the real running app, with its real narration audio.
 * Scope: Starts an isolated production-style server with the installed models, drives the UI the way
 *   a person would (upload, choose a voice, play, chapters, voice library, Voice Studio, export,
 *   settings), captures the screen through Chromium's screencast at 1920×1080 and logs every audio
 *   clip the app plays. demo-assemble.mjs then turns that into docs/media/local-tts-demo.mp4.
 *   Usage: `npm run build && node scripts/media/record-demo.mjs` (needs FFmpeg; see docs/media).
 * Does NOT belong: Encoding (demo-assemble.mjs) or tests (tests/e2e). Nothing here is staged: every
 *   frame and every sound comes from the app as it runs.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, serverDir } from '../lib/paths.mjs';
import { startManaged, stopManaged, waitForHttp } from '../lib/processes.mjs';
import { resolveUv, uvEnv } from '../lib/uv.mjs';
import { run } from './ffmpeg.mjs';
import { assemble } from './demo-assemble.mjs';

const PORT = '8794';
const BASE = `http://127.0.0.1:${PORT}`;
const WORK = path.join(repoRoot, '.tools', 'media', 'demo');
const HEADERS = { 'X-LTTS-Client': 'web', 'Content-Type': 'application/json' };
const REFERENCE_TEXT =
  'Hello! I am recording a short sample so this app can learn the sound of my voice. On quiet mornings, ' +
  'I like to walk past the old bakery, where warm bread and fresh coffee fill the air.';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */
/** @typedef {import('./demo-assemble.mjs').MediaEvent} MediaEvent */

/** @param {string} src an http(s) or data: URL the app played @returns {Promise<Buffer>} */
async function fetchClip(src) {
  if (src.startsWith('data:')) return Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
  const response = await fetch(src, { headers: { 'X-LTTS-Client': 'web' } });
  if (!response.ok) throw new Error(`audio ${src}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Audio cache size, logged after each step as a health check. */
async function cacheBytes() {
  const system = /** @type {{ storage: { audioCacheBytes: number } }} */ (
    await (await api('/api/system')).json()
  );
  return system.storage.audioCacheBytes;
}

/** @param {string} route @param {RequestInit} [init] */
async function api(route, init = {}) {
  const response = await fetch(BASE + route, { ...init, headers: { ...HEADERS, ...init.headers } });
  if (!response.ok) throw new Error(`${route}: ${response.status} ${await response.text()}`);
  return response;
}

/**
 * The cloning reference is a built-in Kokoro voice reading a passage: consented synthetic audio, not
 * a real person. Also loads both engines so the recording shows normal (warm) response times.
 * @returns {Promise<{ reference: string, document: string, cloning: boolean }>}
 */
async function prepare() {
  const document = path.join(WORK, 'The Lighthouse Keeper.pdf');
  const uv = await resolveUv({ allowDownload: false });
  await run(
    uv,
    [
      'run',
      '--frozen',
      '--project',
      serverDir,
      'python',
      path.join(repoRoot, 'scripts', 'media', 'make_demo_pdf.py'),
      document,
    ],
    uvEnv(),
  );
  const reference = path.join(WORK, 'reference.wav');
  const audio = await api('/api/voices/kokoro:bm_george/preview', {
    method: 'POST',
    body: JSON.stringify({ text: REFERENCE_TEXT }),
  });
  const bytes = Buffer.from(await audio.arrayBuffer());
  writeFileSync(reference, bytes);
  const engines = /** @type {{ id: string, status: string }[]} */ (
    await (await api('/api/engines')).json()
  );
  const cloning = engines.some((e) => e.id === 'chatterbox' && e.status === 'ready');
  if (cloning) {
    const created = await api('/api/voice-profiles?name=Warm-up&consent=true&source=import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(bytes),
    });
    const profile = /** @type {{ id: string, voiceId: string }} */ (await created.json());
    await api(`/api/voices/${encodeURIComponent(profile.voiceId)}/preview`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Warming up.' }),
    });
    await api(`/api/voice-profiles/${profile.id}`, { method: 'DELETE' });
  }
  return { reference, document, cloning };
}

/** Moves the visible cursor smoothly onto an element. @param {Page} page @param {Locator} target */
async function point(page, target) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`not visible: ${target}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
  await page.waitForTimeout(250);
}

/** @param {Page} page @param {Locator} target */
async function click(page, target) {
  await point(page, target);
  await page.mouse.down();
  await page.mouse.up();
}

/** @param {Page} page @param {string} name */
const nav = (page, name) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).first();

/** @param {Page} page */
const player = (page) => page.getByRole('region', { name: 'Audio player' });

/**
 * The scripted walkthrough. `say` shows a step caption and records when it appeared.
 * @param {Page} page
 * @param {(text: string, step?: string) => Promise<void>} say
 * @param {{ reference: string, document: string, cloning: boolean }} prep
 */
async function walkthrough(page, say, prep) {
  await page.waitForTimeout(1200);
  await say('Add a document: PDF, EPUB, Word, Markdown or plain text', '1');
  await point(page, page.getByRole('button', { name: /Upload/ }).first());
  await page.getByTestId('file-input').first().setInputFiles(prep.document);
  await page.waitForURL(/\/read\//);
  await page.waitForTimeout(1800);

  await say('Choose a voice: 54 built-in voices in 9 languages', '2');
  await click(page, player(page).getByRole('button', { name: /^Voice:/ }));
  await page.waitForTimeout(700);
  await click(page, page.getByRole('option', { name: /Emma/ }).first());
  await page.waitForTimeout(800);

  await say('Press Play. The text follows along, sentence by sentence', '3');
  await click(page, player(page).getByRole('button', { name: 'Play', exact: true }));
  await page.locator('[data-index="3"][data-active="true"]').waitFor({ timeout: 90_000 });
  await page.waitForTimeout(2500);

  await say('Jump to a chapter, or click any sentence to start there', '4');
  const contents = page.getByRole('navigation', { name: 'Contents' });
  await click(page, contents.getByRole('button', { name: /The Visitor/ }));
  await page.waitForTimeout(1500);
  await click(page, page.getByText(/When he finally opened the box/).first());
  await page.waitForTimeout(1500);
  await say('Narration carries on into the next chapter, and the page follows', '4');
  await page.locator('[data-active="true"]', { hasText: 'Morning' }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4500);
  await click(page, player(page).getByRole('button', { name: 'Pause', exact: true }));
  await page.waitForTimeout(800);

  await say('Compare voices on the same passage', '5');
  await click(page, nav(page, 'Voices'));
  await page.waitForTimeout(1500);
  const previews = page.getByRole('button', { name: /^Preview / });
  for (const index of [0, 4]) {
    await click(page, previews.nth(index));
    await page.waitForTimeout(5200);
  }
  await click(page, page.getByRole('button', { name: /^Stop preview/ }).first());

  if (prep.cloning) await studio(page, say, prep.reference);

  await say(
    'Export narration as MP3 or WAV, one file or one per chapter',
    prep.cloning ? '7' : '6',
  );
  await click(page, nav(page, 'Library'));
  await page.waitForTimeout(1200);
  await click(page, page.getByRole('link', { name: /Lighthouse Keeper/ }).first());
  await page.waitForURL(/\/read\//);
  await page.waitForTimeout(1200);
  await click(page, player(page).getByRole('button', { name: 'Export audio' }));
  const dialog = page.getByRole('dialog', { name: 'Export audio' });
  await point(page, dialog.getByLabel('What to export'));
  await dialog.getByLabel('What to export').selectOption('current');
  await page.waitForTimeout(600);
  await click(page, dialog.getByRole('button', { name: 'Start export' }));
  await dialog.getByRole('link', { name: 'Download' }).waitFor({ timeout: 120_000 });
  await point(page, dialog.getByRole('link', { name: 'Download' }));
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');

  await say(
    'Light or dark theme. Models are checksum-verified, and nothing leaves your computer',
    prep.cloning ? '8' : '7',
  );
  await click(page, nav(page, 'Settings'));
  await page.waitForTimeout(1000);
  await click(
    page,
    page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }),
  );
  await page.waitForTimeout(1400);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(2600);
}

/**
 * @param {Page} page
 * @param {(text: string, step?: string) => Promise<void>} say
 * @param {string} reference
 */
async function studio(page, say, reference) {
  await say('Optional: clone a voice in Voice Studio, with consent and quality checks', '6');
  await click(page, nav(page, 'Voice Studio'));
  await page.waitForTimeout(1200);
  await click(page, page.getByRole('button', { name: 'Create voice' }).first());
  const wizard = page.getByRole('dialog', { name: 'Create a voice' });
  await page.waitForTimeout(1500);
  await click(page, wizard.getByRole('button', { name: /Continue/ }));
  await say('This reference is a built-in synthetic voice, not a real person', '6');
  await wizard.getByTestId('voice-file-input').setInputFiles(reference);
  await wizard.getByText('verified by the local server').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await click(page, wizard.getByRole('button', { name: /Continue/ }));
  await page.waitForTimeout(800);
  await click(page, wizard.getByLabel('Voice name'));
  await wizard.getByLabel('Voice name').pressSequentially('Synthetic narrator', { delay: 55 });
  await click(page, wizard.getByRole('checkbox'));
  await page.waitForTimeout(600);
  await click(page, wizard.getByRole('button', { name: 'Create voice' }));
  await wizard.getByText('is saved').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await click(page, wizard.getByRole('button', { name: 'Generate sample' }));
  await wizard.getByRole('button', { name: 'Generate sample' }).waitFor({ timeout: 150_000 });
  await page.waitForTimeout(6500);
  await click(page, wizard.getByRole('button', { name: 'Done' }));
  await page.waitForTimeout(1000);
}

async function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(path.join(WORK, 'frames'), { recursive: true });
  const server = startManaged({
    name: 'demo',
    label: '[demo-server]',
    command: process.execPath,
    args: [path.join(repoRoot, 'scripts', 'e2e-server.mjs'), '--port', PORT],
    cwd: repoRoot,
  });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    if (!(await waitForHttp(`${BASE}/api/health`, 180_000)))
      throw new Error('server did not start');
    const prep = await prepare();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 810 },
      deviceScaleFactor: 4 / 3,
      colorScheme: 'light',
      acceptDownloads: true,
    });
    await context.addInitScript({ path: path.join(repoRoot, 'scripts', 'media', 'demo-page.js') });
    const page = await context.newPage();
    /** @type {MediaEvent[]} */
    const media = [];
    /** Each clip is downloaded as soon as it starts playing, while the server certainly has it. */
    /** @type {Map<string, Promise<Buffer>>} */
    const clips = new Map();
    await page.exposeFunction('__demoMedia', (/** @type {MediaEvent} */ event) => {
      media.push(event);
      if (event.type !== 'playing' || clips.has(event.src)) return;
      const download = fetchClip(event.src);
      download.catch(() => undefined);
      clips.set(event.src, download);
    });
    await page.goto(`${BASE}/library`);
    await page.waitForLoadState('networkidle');

    /** @type {{ file: string, t: number }[]} */
    const frames = [];
    const cdp = await context.newCDPSession(page);
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      const file = path.join(WORK, 'frames', `f${String(frames.length).padStart(6, '0')}.jpg`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 });
      void cdp.send('Page.screencastFrameAck', { sessionId });
    });
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: 1920,
      maxHeight: 1080,
    });

    /** @type {{ t: number, text: string | null }[]} */
    const captions = [];
    const say = async (/** @type {string} */ text, /** @type {string | undefined} */ step) => {
      captions.push({ t: Date.now() / 1000, text });
      console.log(`step: ${text} (audio cache ${await cacheBytes()} B)`);
      await page.evaluate(
        ([t, s]) => /** @type {any} */ (globalThis).__demo.caption(t, s),
        [text, step],
      );
      await page.waitForTimeout(900);
    };
    await walkthrough(page, say, prep);
    captions.push({ t: Date.now() / 1000, text: null });
    await page.evaluate(() =>
      /** @type {any} */ (globalThis).__demo.endCard(
        'Local TTS',
        [
          'Private text-to-speech for your documents.',
          'Free and open source under the MIT licence.',
        ],
        'npm install && npm run dev',
      ),
    );
    await page.waitForTimeout(4500);
    const end = Date.now() / 1000;
    await cdp.send('Page.stopScreencast');
    writeFileSync(
      path.join(WORK, 'timeline.json'),
      JSON.stringify({ frames, media, captions, end }, null, 2),
    );
    console.log(
      `recorded ${frames.length} frames, ${media.length} media events, ${(end - (frames[0]?.t ?? end)).toFixed(1)} s`,
    );
    await assemble({ work: WORK, frames, media, captions, end, clips });
  } finally {
    await browser.close();
    stopManaged(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
