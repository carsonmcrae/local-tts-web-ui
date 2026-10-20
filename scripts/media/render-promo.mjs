// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Render the showcase video (docs/media/local-tts-promo.mp4) from promo/promo.html.
 * Scope: A loopback file server limited to the composition, the screenshots and the app's fonts;
 *   headless Chromium stepping window.seek(t) frame by frame (PNG frames piped to FFmpeg); the
 *   soundtrack from promo-audio.mjs (voice-over spoken by the app through an isolated server); a
 *   WebP poster and WebVTT captions of the voice-over.
 *   Usage: `node scripts/media/render-promo.mjs` (video) or `... stills 1 13 30` (review frames).
 * Does NOT belong: The animation (promo/promo.js) or the demo recording (record-demo.mjs).
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';
import { startManaged, stopManaged, waitForHttp } from '../lib/processes.mjs';
import { findTool, run } from './ffmpeg.mjs';
import { mix, voiceOver } from './promo-audio.mjs';

const WORK = path.join(repoRoot, '.tools', 'media', 'promo');
const OUT = path.join(repoRoot, 'docs', 'media');
const NAME = 'local-tts-promo';
const ALLOWED = ['/scripts/media/promo/', '/docs/images/', '/node_modules/@fontsource-variable/'];
/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const PORT = '8793';

/** Serves only the composition's own files, over loopback. */
async function serveComposition() {
  const server = createServer((req, res) => {
    // Only the path is used; the base is this server's own loopback origin.
    const url = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    if (!ALLOWED.some((prefix) => url.startsWith(prefix)) || url.includes('..')) {
      res.writeHead(404).end();
      return;
    }
    readFile(path.join(repoRoot, url)).then(
      (body) =>
        res
          .writeHead(200, {
            'content-type': TYPES[path.extname(url)] ?? 'application/octet-stream',
          })
          .end(body),
      () => res.writeHead(404).end(),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server, origin: `http://127.0.0.1:${port}` };
}

/** Generates the voice-over with the real app, then mixes the soundtrack. @param {number} total */
async function soundtrack(total) {
  const app = startManaged({
    name: 'promo',
    label: '[promo-server]',
    command: process.execPath,
    args: [path.join(repoRoot, 'scripts', 'e2e-server.mjs'), '--port', PORT],
    cwd: repoRoot,
  });
  try {
    if (!(await waitForHttp(`http://127.0.0.1:${PORT}/api/health`, 180_000)))
      throw new Error('server did not start');
    const cues = await voiceOver(`http://127.0.0.1:${PORT}`, WORK);
    return { cues, file: await mix(WORK, cues, total) };
  } finally {
    stopManaged(app);
  }
}

/** @param {number} s */
const stamp = (s) => new Date(Math.round(s * 1000)).toISOString().slice(11, 23);

async function main() {
  const [mode, ...times] = process.argv.slice(2);
  mkdirSync(path.join(WORK, 'stills'), { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const { server, origin } = await serveComposition();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    page.on(
      'console',
      (message) => message.type() === 'error' && console.error('page:', message.text()),
    );
    await page.goto(`${origin}/scripts/media/promo/promo.html`);
    await page.evaluate(() => /** @type {any} */ (globalThis).ready);
    const { total, fps } = await page.evaluate(() => ({
      total: /** @type {any} */ (globalThis).DURATION,
      fps: /** @type {any} */ (globalThis).FPS,
    }));
    /** @param {number} t */
    const frame = async (t) => {
      await page.evaluate((time) => /** @type {any} */ (globalThis).seek(time), t);
      return page.locator('#stage').screenshot({ type: 'png' });
    };
    if (mode === 'stills') {
      for (const t of times)
        writeFileSync(
          path.join(WORK, 'stills', `t${t.padStart(5, '0')}.png`),
          await frame(Number(t)),
        );
      console.log(`wrote ${times.length} stills to ${path.join(WORK, 'stills')}`);
      return;
    }
    const audio = await soundtrack(total);
    const ffmpeg = findTool('ffmpeg');
    const master = path.join(WORK, 'master.mp4');
    const encoder = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'png_pipe', '-framerate', String(fps), '-i', 'pipe:0', '-i', audio.file,
      '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', String(fps),
      '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', String(total), '-movflags', '+faststart', master], { stdio: ['pipe', 'inherit', 'inherit'] }); // prettier-ignore
    const count = Math.round(total * fps);
    for (let i = 0; i < count; i += 1) {
      if (!encoder.stdin.write(await frame(i / fps)))
        await new Promise((resolve) => encoder.stdin.once('drain', resolve));
      if (i % 150 === 0) console.log(`  frame ${i}/${count}`);
    }
    encoder.stdin.end();
    const code = await new Promise((resolve) => encoder.on('close', resolve));
    if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
    const video = path.join(OUT, `${NAME}.mp4`);
    await run(ffmpeg, ['-y', '-v', 'error', '-i', master, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '22', '-profile:v', 'high',
      '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart',
      video]); // prettier-ignore
    await run(ffmpeg, ['-y', '-v', 'error', '-ss', '3.2', '-i', master, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', path.join(OUT, `${NAME}-poster.webp`)]); // prettier-ignore
    const vtt = audio.cues
      .map((c) => `${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`)
      .join('\n');
    writeFileSync(path.join(OUT, `${NAME}-captions.vtt`), `WEBVTT\n\n${vtt}`);
    console.log(`wrote ${video}`);
  } finally {
    await browser.close();
    server.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
