// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Measure memory over a long listening session in a real browser, reproducibly.
 * Scope: Drives the running app in Playwright's Chromium for N minutes and samples, every minute and
 *   after a forced garbage collection, the private memory of every browser process by type, the JS
 *   heap, the renderer's memory outside it, and the page's DOM nodes and event listeners. Modes: the reader with background music off or on
 *   (`--music`), or a bare page that plays the same sentence audio on one <audio> element
 *   (`--bare`, optionally `--reset-src` to clear the element between sentences). At the end it
 *   pauses for a minute, then simulates critical memory pressure, and samples after each.
 *   Run against `npm run dev` or `npm start`, with a document of at least N × 20 sentences:
 *   `node tests/perf/long-listening.mjs --url http://127.0.0.1:5173 --document <id> --minutes 60 [--music]`
 * Does NOT belong: Pass/fail tests (this only reports) or the server's own memory (benchmark.py).
 */
/* global window, document, Audio */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (/** @type {string} */ name, fallback = '') => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? String(args[at + 1]) : fallback;
};
const url = option('--url', 'http://127.0.0.1:5173');
const documentId = option('--document');
const minutes = Number(option('--minutes', '60'));
const mode = args.includes('--bare')
  ? args.includes('--reset-src')
    ? 'bare-reset'
    : 'bare'
  : args.includes('--music')
    ? 'music'
    : 'narration';
const out = option('--out', path.join('.tools', `long-listening-${mode}-${Date.now()}.csv`));
if (!documentId)
  throw new Error('Pass --document <id> (a pasted document of at least minutes × 20 sentences).');

/** Private memory per process, in MB: PowerShell on Windows, `ps` RSS elsewhere. */
function processMemory(/** @type {number[]} */ ids) {
  if (process.platform === 'win32') {
    const shell = path.join(
      process.env.SystemRoot ?? 'C:/Windows',
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    );
    const text = execFileSync(
      shell,
      [
        '-NoProfile',
        '-Command',
        `Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { '{0} {1}' -f $_.Id, $_.PrivateMemorySize64 }`,
      ],
      { encoding: 'utf8' },
    );
    return new Map(
      text
        .trim()
        .split('\n')
        .map((line) => line.trim().split(' ').map(Number))
        .map(([id, bytes]) => [id, bytes / 1e6]),
    );
  }
  const text = execFileSync('/bin/ps', ['-o', 'pid=,rss=', '-p', ids.join(',')], {
    encoding: 'utf8',
  });
  return new Map(
    text
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number))
      .map(([id, kb]) => [id, kb / 1e3]),
  );
}

const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const browserCdp = await browser.newBrowserCDPSession();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

/** One sample, after a full garbage collection. */
async function sample(/** @type {string} */ label) {
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(500);
  const { processInfo } = await browserCdp.send('SystemInfo.getProcessInfo');
  const memory = processMemory(processInfo.map((p) => p.id));
  const byType = {};
  for (const info of processInfo)
    byType[info.type] = (byType[info.type] ?? 0) + (memory.get(info.id) ?? 0);
  const { metrics } = await cdp.send('Performance.getMetrics');
  const metric = (/** @type {string} */ name) => metrics.find((m) => m.name === name)?.value ?? 0;
  const heap = metric('JSHeapUsedSize') / 1e6;
  const state = await page.evaluate(() => ({
    sentence:
      document
        .querySelector('[aria-label="Position in document"]')
        ?.getAttribute('aria-valuetext') ?? String(window.bareIndex ?? ''),
  }));
  const total = Object.values(byType).reduce((sum, value) => sum + value, 0);
  const renderer = byType.renderer ?? 0;
  return {
    label,
    total,
    renderer,
    heap,
    native: renderer - heap,
    nodes: String(metric('Nodes')),
    listeners: String(metric('JSEventListeners')),
    byType,
    sentence: state.sentence,
  };
}

async function startReader() {
  await fetch(`${url}/api/documents/${documentId}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-LTTS-Client': 'web' },
    body: JSON.stringify({ segmentIndex: 0, voiceId: 'kokoro:af_heart' }),
  });
  await page.goto(`${url}/read/${documentId}`, { waitUntil: 'networkidle' });
  const player = page.getByRole('region', { name: 'Audio player' });
  await player.getByRole('button', { name: 'Play', exact: true }).click();
  if (mode === 'music') {
    await player
      .getByRole('button', { name: /^Audio mixer/ })
      .filter({ visible: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Audio mixer' })
      .getByRole('switch', { name: 'Background music' })
      .click();
    await page.keyboard.press('Escape');
  }
  return () => player.getByRole('button', { name: 'Pause', exact: true }).click();
}

/** The same sentence audio the reader plays, one after another on one element, without the app. */
async function startBare() {
  await page.goto(`${url}/library`, { waitUntil: 'networkidle' });
  await page.evaluate(
    ({ id, reset }) => {
      const audio = new Audio();
      window.bareAudio = audio;
      window.bareIndex = 0;
      const next = async () => {
        const index = window.bareIndex;
        const prepared = await fetch(
          `/api/documents/${id}/segments/${index}/audio?voice=kokoro%3Aaf_heart&pace=1`,
          { headers: { 'X-LTTS-Client': 'web' } },
        );
        const src = prepared.headers.get('X-Audio-Url');
        await prepared.body?.cancel();
        if (reset) {
          audio.removeAttribute('src');
          audio.load();
        }
        audio.src = src;
        await audio.play();
      };
      audio.addEventListener('ended', () => {
        window.bareIndex += 1;
        void next();
      });
      void next();
    },
    { id: documentId, reset: mode === 'bare-reset' },
  );
  return () => page.evaluate(() => window.bareAudio.pause());
}

const pause = mode.startsWith('bare') ? await startBare() : await startReader();
const rows = [await sample('start')];
console.log(`mode ${mode}, ${minutes} min, writing ${out}`);
const print = (row) =>
  console.log(
    `${row.label.padEnd(16)} total ${row.total.toFixed(0)} MB | renderer ${row.renderer.toFixed(0)} (heap ${row.heap.toFixed(0)}, outside ${row.native.toFixed(0)}) | nodes ${row.nodes}, listeners ${row.listeners} | ${row.sentence}`,
  );
print(rows[0]);
for (let minute = 1; minute <= minutes; minute += 1) {
  await page.waitForTimeout(60_000 - 600);
  rows.push(await sample(`min ${minute}`));
  print(rows.at(-1));
}
await pause();
await page.waitForTimeout(60_000);
rows.push(await sample('paused 1 min'));
print(rows.at(-1));
await cdp.send('Memory.simulatePressureNotification', { level: 'critical' });
await page.waitForTimeout(5_000);
rows.push(await sample('after pressure'));
print(rows.at(-1));

const types = [...new Set(rows.flatMap((row) => Object.keys(row.byType)))].sort();
writeFileSync(
  out,
  [
    [
      'label',
      'total',
      'renderer',
      'heap',
      'renderer_outside_heap',
      'nodes',
      'listeners',
      ...types,
      'sentence',
    ].join(','),
    ...rows.map((row) =>
      [
        row.label,
        row.total,
        row.renderer,
        row.heap,
        row.native,
        row.nodes,
        row.listeners,
        ...types.map((t) => row.byType[t] ?? 0),
        `"${row.sentence}"`,
      ]
        .map((v) => (typeof v === 'number' ? v.toFixed(1) : v))
        .join(','),
    ),
  ].join('\n') + '\n',
);
const playing = rows.filter((row) => row.label.startsWith('min'));
const slope = (from, to) =>
  (to.renderer - from.renderer) /
  (Number(to.label.split(' ')[1]) - Number(from.label.split(' ')[1]));
const lastTen = playing.slice(-11);
console.log(
  `renderer: start ${rows[0].renderer.toFixed(0)} MB, peak ${Math.max(...playing.map((r) => r.renderer)).toFixed(0)} MB, end ${playing.at(-1)?.renderer.toFixed(0)} MB; last ten minutes ${lastTen.length > 1 ? slope(lastTen[0], lastTen.at(-1)).toFixed(1) : 'n/a'} MB/min`,
);
console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
