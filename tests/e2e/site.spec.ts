// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: End-to-end tests for the TTSNative website (site/), built the way GitHub Pages builds it.
 * Scope: Builds the site with scripts/site/build-site.mjs and serves it over loopback; checks the
 *   calls to action reach real sections, the base URL fills canonical and social links, the browser
 *   speech demo (a scripted SpeechSynthesis: voices on the device first, online voices warned about,
 *   speak and stop, unsupported browsers), axe finds no serious violations in light and dark, and
 *   phones get no sideways scrolling.
 * Does NOT belong: The app (the other specs) or the page's wording.
 */
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import path from 'node:path';
import { seriousViolations } from './helpers';

const OUT = path.join(process.cwd(), '.tools', 'site-e2e');
const PORT = 8792;
const BASE = `http://127.0.0.1:${PORT}`;
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

let server: Server;

test.beforeAll(async () => {
  execFileSync(process.execPath, ['scripts/site/build-site.mjs', '--out', OUT, '--base-url', BASE]);
  server = createServer((req, res) => {
    let file = decodeURIComponent(new URL(req.url ?? '/', BASE).pathname);
    if (file.endsWith('/')) file += 'index.html';
    const full = path.join(OUT, file);
    if (!full.startsWith(OUT) || !existsSync(full) || !statSync(full).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', TYPES[path.extname(full)] ?? 'application/octet-stream');
    createReadStream(full).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
});

test.afterAll(() => {
  server.close();
});

/**
 * A scripted SpeechSynthesis: one voice on the device, one online; records what it was asked and
 * queues utterances like a browser (window.finishUtterance() ends the one being spoken).
 */
async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const spoken: { text: string; rate: number; voice: string }[] = [];
    const voices = [
      {
        name: 'Cloud Voice',
        lang: 'en-US',
        localService: false,
        voiceURI: 'cloud',
        default: false,
      },
      {
        name: 'Device Voice',
        lang: 'en-US',
        localService: true,
        voiceURI: 'device',
        default: true,
      },
    ];
    class Utterance {
      text: string;
      rate = 1;
      lang = '';
      voice: { name: string } | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    const queue: Utterance[] = [];
    // The real speechSynthesis is a read-only accessor, so it is redefined rather than assigned.
    Object.defineProperties(window, {
      SpeechSynthesisUtterance: { value: Utterance, configurable: true },
      spoken: { value: spoken },
      finishUtterance: {
        value: () => {
          queue.shift()?.onend?.();
          queue[0]?.onstart?.();
        },
      },
      speechSynthesis: {
        configurable: true,
        value: {
          getVoices: () => voices,
          addEventListener: () => undefined,
          cancel: () => {
            spoken.push({ text: '(cancel)', rate: 0, voice: '' });
            for (const u of queue.splice(0)) u.onerror?.({ error: 'interrupted' });
          },
          speak: (u: Utterance) => {
            spoken.push({ text: u.text, rate: u.rate, voice: u.voice?.name ?? '' });
            queue.push(u);
            if (queue.length === 1) u.onstart?.();
          },
        },
      },
    });
  });
}

test.describe('website @site @cross-browser', () => {
  test('calls to action reach real sections, and social links use the base URL', async ({
    page,
  }) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Natural text-to-speech. Private, powerful, and local.',
    );
    for (const name of ['Install TTSNative', 'Try speech in your browser']) {
      const href = await page.getByRole('link', { name }).getAttribute('href');
      await expect(page.locator(String(href))).toBeAttached();
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${BASE}/`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      `${BASE}/media/social-preview.png`,
    );
    const sitemap = await page.request.get(`${BASE}/sitemap.xml`);
    expect(await sitemap.text()).toContain(`<loc>${BASE}/</loc>`);
    await page.getByRole('button', { name: 'Copy' }).click();
  });

  test('the speech demo prefers voices on the device and warns about online ones', async ({
    page,
  }) => {
    await fakeSpeech(page);
    await page.goto(`${BASE}/#try`);
    const voice = page.getByLabel('Browser voice');
    await expect(voice).toBeEnabled();
    await expect(voice.locator('option').first()).toHaveText('Device Voice (en-US)');
    await expect(page.getByText(/This voice is an online voice/)).toBeHidden();
    await voice.selectOption({ label: 'Cloud Voice (en-US) · online' });
    await expect(page.getByText(/This voice is an online voice/)).toBeVisible();

    await page.getByLabel('Text to read').fill('Hello from the website.');
    await page.getByLabel(/Speed/).fill('1.5');
    await expect(page.getByText('1.5×')).toBeVisible();
    await page.getByRole('button', { name: 'Speak' }).click();
    await expect(page.locator('#speech-status')).toHaveText('Speaking…');
    const spoken = await page.evaluate(() => (window as unknown as { spoken: unknown[] }).spoken);
    expect(spoken).toContainEqual({
      text: 'Hello from the website.',
      rate: 1.5,
      voice: 'Cloud Voice',
    });
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.locator('#speech-status')).toHaveText('Stopped.');

    await page.getByLabel('Text to read').fill('  ');
    await page.getByRole('button', { name: 'Speak' }).click();
    await expect(page.locator('#speech-status')).toHaveText('Type something to read first.');
  });

  test('the demo reads sentence by sentence and highlights the one being read', async ({
    page,
  }) => {
    await fakeSpeech(page);
    await page.goto(`${BASE}/#try`);
    await expect(page.getByLabel('Browser voice')).toBeEnabled();
    await page.getByLabel('Text to read').fill('First sentence here. And a second one!');
    await page.getByRole('button', { name: 'Speak' }).click();
    const current = page.locator('#speech-readalong .current');
    await expect(current).toHaveText('First sentence here.');
    const spoken = await page.evaluate(() =>
      (window as unknown as { spoken: { text: string }[] }).spoken.map((item) => item.text),
    );
    expect(spoken).toEqual(['(cancel)', 'First sentence here.', 'And a second one!']);
    const finish = () =>
      page.evaluate(() => (window as unknown as { finishUtterance: () => void }).finishUtterance());
    await finish();
    await expect(current).toHaveText('And a second one!');
    await finish();
    await expect(current).toHaveCount(0);
    await expect(page.locator('#speech-status')).toHaveText('Done.');
  });

  test('browsers without speech get an explanation', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { value: undefined });
    });
    await page.goto(`${BASE}/#try`);
    await expect(page.locator('#speech-status')).toContainText('can’t speak text aloud');
    await expect(page.getByRole('button', { name: 'Speak' })).toBeDisabled();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no serious problems (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await fakeSpeech(page);
      await page.goto(`${BASE}/`);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test('the 404 page links home', async ({ page }) => {
    await page.goto(`${BASE}/404.html`);
    await expect(page.getByRole('link', { name: 'Go to the TTSNative home page' })).toHaveAttribute(
      'href',
      `${BASE}/`,
    );
  });
});

test.describe('website on phones @mobile', () => {
  test('the page fits the screen', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
