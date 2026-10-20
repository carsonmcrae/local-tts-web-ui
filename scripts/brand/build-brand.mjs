// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Generate every TTSNative brand asset from one definition of the symbol, colours and type.
 * Scope: The N-waveform symbol (colour and one-colour), the app icon, horizontal and stacked lockups
 *   (light and dark), the README banner and the social preview as SVG (wordmarks embed the Inter
 *   font, OFL, so they render anywhere); PNG exports rendered in headless Chromium, which also
 *   measures the wordmark so each lockup's viewBox fits it exactly; WebP copies of the large images
 *   via FFmpeg; and the copies the app and website serve (favicons, touch icons, social image).
 *   Usage: `node scripts/brand/build-brand.mjs`.
 * Does NOT belong: The usage guidelines (brand/README.md) or the app's UI colour tokens.
 */
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';
import { findTool, run } from '../media/ffmpeg.mjs';

/** @typedef {'light' | 'dark'} Theme */

const OUT = path.join(repoRoot, 'brand');
const FONT = path.join(repoRoot, 'site', 'fonts', 'inter-latin-wght-normal.woff2');

const COLORS = {
  indigo: '#4F46E5',
  cyan: '#0891B2',
  indigoLight: '#A5B4FC',
  cyanLight: '#67E8F9',
  ink: '#14151A',
  muted: '#55565C',
  mutedDark: '#A9AAB1',
  paper: '#F7F6F3',
  night: '#0E0F14',
  white: '#FFFFFF',
};

/**
 * The symbol: an N drawn as five waveform bars on a 64-unit grid. The outer bars are the stems; the
 * three shorter bars step down from top left to bottom right, forming the diagonal.
 * @type {readonly { x: number; top: number; bottom: number }[]}
 */
const BARS = [
  { x: 12, top: 10, bottom: 54 },
  { x: 22, top: 12, bottom: 32 },
  { x: 32, top: 22, bottom: 42 },
  { x: 42, top: 32, bottom: 52 },
  { x: 52, top: 10, bottom: 54 },
];
const BAR_WIDTH = 7;
/** The icon tile's bars: the symbol at 72%, centred on the 64-unit tile. */
const TILE_BARS = { scale: 0.72, offset: 8.96 };

/**
 * The bars as SVG rectangles, scaled from the 64-unit grid and offset.
 * @param {string} fill @param {number} [scale] @param {number} [dx] @param {number} [dy]
 */
function bars(fill, scale = 1, dx = 0, dy = 0) {
  const w = BAR_WIDTH * scale;
  return BARS.map(({ x, top, bottom }) => {
    const left = dx + (x - BAR_WIDTH / 2) * scale;
    return `<rect x="${left}" y="${dy + top * scale}" width="${w}" height="${(bottom - top) * scale}" rx="${w / 2}" fill="${fill}"/>`;
  }).join('');
}

/**
 * A diagonal gradient across a box in user space, so one sweep spans the whole mark.
 * @param {string} id @param {[string, string]} stops @param {[number, number, number, number]} box
 */
function gradient(id, [from, to], [x1, y1, x2, y2]) {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
}

/** @param {Theme} theme @returns {[string, string]} */
const stops = (theme) =>
  theme === 'light' ? [COLORS.indigo, COLORS.cyan] : [COLORS.indigoLight, COLORS.cyanLight];

/** @param {string} title @param {string} viewBox @param {string} body @param {string} [defs] */
const svg = (title, viewBox, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${title}"><title>${title}</title>${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

/** The symbol alone, in the brand gradient (light backgrounds) or its lighter twin (dark). */
const symbol = (/** @type {Theme} */ theme) =>
  svg('TTSNative', '0 0 64 64', bars('url(#g)'), gradient('g', stops(theme), [0, 0, 64, 64]));

/** The symbol in one colour, for single-colour printing, embossing or very small sizes. */
const symbolMono = (/** @type {string} */ fill) => svg('TTSNative', '0 0 64 64', bars(fill));

/** The rounded tile in the brand gradient with white bars: the app icon and favicon. */
const tile = () =>
  `<rect width="64" height="64" rx="15" fill="url(#tile)"/>${bars(COLORS.white, TILE_BARS.scale, TILE_BARS.offset, TILE_BARS.offset)}`;

const appIcon = () =>
  svg('TTSNative', '0 0 64 64', tile(), gradient('tile', stops('light'), [0, 0, 64, 64]));

const fontFace = () =>
  `<style>@font-face{font-family:"Inter";src:url(data:font/woff2;base64,${readFileSync(FONT).toString('base64')}) format("woff2");font-weight:100 900}text{font-family:"Inter",system-ui,sans-serif;font-weight:700;letter-spacing:-0.02em}</style>`;

/**
 * "TTS" in the text colour and "Native" in the accent: the two halves of the name.
 * @param {number} x @param {number} y @param {number} size @param {Theme} theme @param {string} [anchor]
 */
function wordmark(x, y, size, theme, anchor = 'start') {
  const [text, accent] =
    theme === 'light' ? [COLORS.ink, COLORS.indigo] : [COLORS.white, COLORS.indigoLight];
  return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${text}">TTS<tspan fill="${accent}">Native</tspan></text>`;
}

/** Horizontal lockup; WIDTH is measured in the browser. */
const horizontal = (/** @type {Theme} */ theme) =>
  svg(
    'TTSNative',
    '0 0 WIDTH 64',
    `${bars('url(#g)')}${wordmark(76, 49, 46, theme)}`,
    gradient('g', stops(theme), [0, 0, 64, 64]) + fontFace(),
  );

/** Stacked lockup: the symbol centred above the name; WIDTH and the centring are set in the browser. */
const stacked = (/** @type {Theme} */ theme) =>
  svg(
    'TTSNative',
    '0 0 WIDTH 150',
    `<g id="mark">${bars('url(#g)', 1.5)}</g>${wordmark(0, 140, 40, theme, 'middle')}`,
    gradient('g', stops(theme), [0, 0, 96, 96]) + fontFace(),
  );

/**
 * Lines of text turning into a waveform: what the app does, as a quiet illustration.
 * @param {number} right @param {number} middle @param {number} u @param {Theme} theme
 */
function textToSpeech(right, middle, u, theme) {
  const ink = theme === 'dark' ? COLORS.white : COLORS.ink;
  const waveWidth = 12 * 18 * u;
  const wave0 = right - waveWidth;
  const lines = [196, 168, 196, 132].map((length, i) => {
    const y = middle + (i - 1.5) * 44 * u - 7 * u;
    return `<rect x="${wave0 - 28 * u - 196 * u}" y="${y}" width="${length * u}" height="${14 * u}" rx="${7 * u}" fill="${ink}" opacity="0.13"/>`;
  });
  const wave = Array.from({ length: 12 }, (_, i) => {
    const h = (34 + 120 * Math.abs(Math.sin(0.9 + i * 0.62) * Math.cos(i * 0.27))) * u;
    return `<rect x="${wave0 + i * 18 * u}" y="${middle - h / 2}" width="${10 * u}" height="${h}" rx="${5 * u}" fill="url(#wave)"/>`;
  });
  return {
    body: lines.join('') + wave.join(''),
    defs: gradient('wave', stops(theme), [wave0, middle - 80 * u, right, middle + 80 * u]),
  };
}

/**
 * A wide card: the app icon, the name and the tagline on the left, the illustration on the right
 * (the README banner and the social preview, at different sizes).
 * @param {number} width @param {number} height @param {Theme} theme
 * @param {number} [u] the size of one design unit (the social preview is 640 units tall)
 */
function card(width, height, theme, u = height / 640) {
  const icon = 132 * u;
  const left = Math.max(96 * u, width * 0.07);
  const top = (height - (icon + 187 * u)) / 2;
  const name = top + icon + 44 * u + 73 * u;
  const art = textToSpeech(width - left, height / 2, u, theme);
  const muted = theme === 'dark' ? COLORS.mutedDark : COLORS.muted;
  const body = [
    `<rect width="${width}" height="${height}" fill="${theme === 'dark' ? COLORS.night : COLORS.paper}"/>`,
    `<g transform="translate(${left} ${top}) scale(${icon / 64})">${tile()}</g>`,
    wordmark(left - 4 * u, name, 100 * u, theme),
    `<text x="${left}" y="${name + 62 * u}" font-size="${32 * u}" fill="${muted}" style="font-weight:500;letter-spacing:0">Natural text-to-speech. Private, powerful, and local.</text>`,
    art.body,
  ].join('');
  return svg(
    'TTSNative: natural text-to-speech. Private, powerful, and local.',
    `0 0 ${width} ${height}`,
    body,
    gradient('tile', stops('light'), [0, 0, 64, 64]) + art.defs + fontFace(),
  );
}

/**
 * Renders an SVG in Chromium: replaces WIDTH from the measured wordmark, then saves the SVG and
 * PNG exports at the given widths.
 * @param {import('@playwright/test').Page} page @param {string} name @param {string} source
 * @param {number[]} widths
 */
async function render(page, name, source, widths) {
  await page.setContent(`<!doctype html><body style="margin:0">${source}</body>`);
  const final = await page.evaluate(async () => {
    const doc = /** @type {any} */ (globalThis).document;
    await doc.fonts.ready;
    const element = doc.querySelector('svg');
    const text = element.querySelector('text');
    const box = element.getAttribute('viewBox') ?? '';
    if (text && box.includes('WIDTH')) {
      const length = text.getComputedTextLength();
      const mark = element.querySelector('#mark');
      // Stacked: the symbol (96 wide) and the name share a centre line. Horizontal: name after symbol.
      const width = mark ? Math.ceil(Math.max(length, 96) + 8) : Math.ceil(76 + length + 4);
      element.setAttribute('viewBox', box.replace('WIDTH', String(width)));
      if (mark) {
        text.setAttribute('x', String(width / 2));
        mark.setAttribute('transform', `translate(${(width - 96) / 2} 0)`);
      }
    }
    return /** @type {string} */ (element.outerHTML);
  });
  writeFileSync(path.join(OUT, 'svg', `${name}.svg`), `${final}\n`);
  const [, , vw = 64, vh = 64] = (/viewBox="([^"]+)"/.exec(final)?.[1] ?? '')
    .split(' ')
    .map(Number);
  for (const width of widths) {
    const height = Math.round((width * vh) / vw);
    await page.setViewportSize({ width, height });
    await page.setContent(
      `<!doctype html><body style="margin:0;background:transparent">${final.replace('<svg ', `<svg width="${width}" height="${height}" `)}</body>`,
    );
    await page.evaluate(() => /** @type {any} */ (globalThis).document.fonts.ready);
    await page.screenshot({
      path: path.join(OUT, 'png', `${name}-${width}.png`),
      omitBackground: true,
      clip: { x: 0, y: 0, width, height },
    });
  }
}

async function main() {
  for (const dir of ['svg', 'png', 'webp']) mkdirSync(path.join(OUT, dir), { recursive: true });
  /** @type {[string, string, number[]][]} */
  const assets = [
    ['ttsnative-symbol', symbol('light'), [64, 256, 1024]],
    ['ttsnative-symbol-dark', symbol('dark'), [64, 256, 1024]],
    ['ttsnative-symbol-ink', symbolMono(COLORS.ink), [256]],
    ['ttsnative-symbol-white', symbolMono(COLORS.white), [256]],
    ['ttsnative-app-icon', appIcon(), [16, 32, 48, 180, 192, 512, 1024]],
    ['ttsnative-logo-horizontal', horizontal('light'), [480, 960]],
    ['ttsnative-logo-horizontal-dark', horizontal('dark'), [480, 960]],
    ['ttsnative-logo-stacked', stacked('light'), [240, 480]],
    ['ttsnative-logo-stacked-dark', stacked('dark'), [240, 480]],
    ['ttsnative-banner', card(1280, 400, 'light', 0.78), [1280]],
    ['ttsnative-banner-dark', card(1280, 400, 'dark', 0.78), [1280]],
    ['ttsnative-social-preview', card(1280, 640, 'dark'), [1280]],
  ];
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, source, widths] of assets) {
    await render(page, name, source, widths);
    console.log(`  ${name}`);
  }
  await browser.close();

  const ffmpeg = findTool('ffmpeg');
  /** @type {[string, number][]} */
  const webp = [
    ['ttsnative-banner', 1280],
    ['ttsnative-banner-dark', 1280],
    ['ttsnative-social-preview', 1280],
    ['ttsnative-logo-horizontal', 960],
    ['ttsnative-logo-horizontal-dark', 960],
  ];
  for (const [name, width] of webp) {
    const png = path.join(OUT, 'png', `${name}-${width}.png`);
    await run(ffmpeg, [
      '-y',
      '-loglevel',
      'error',
      '-i',
      png,
      '-quality',
      '90',
      path.join(OUT, 'webp', `${name}.webp`),
    ]);
  }

  // The copies the app, the website and GitHub use.
  const icon = (/** @type {number} */ size) =>
    path.join(OUT, 'png', `ttsnative-app-icon-${size}.png`);
  for (const dir of [path.join(repoRoot, 'apps', 'web', 'public'), path.join(repoRoot, 'site')]) {
    copyFileSync(path.join(OUT, 'svg', 'ttsnative-app-icon.svg'), path.join(dir, 'favicon.svg'));
    copyFileSync(icon(180), path.join(dir, 'apple-touch-icon.png'));
    copyFileSync(icon(192), path.join(dir, 'icon-192.png'));
    copyFileSync(icon(512), path.join(dir, 'icon-512.png'));
  }
  copyFileSync(
    path.join(OUT, 'png', 'ttsnative-social-preview-1280.png'),
    path.join(repoRoot, 'docs', 'media', 'social-preview.png'),
  );
  console.log('Brand assets written to brand/');
}

await main();
