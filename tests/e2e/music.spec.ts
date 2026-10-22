// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Background music in a real browser, under real Kokoro narration, with the bundled tracks.
 * Scope: Music stays off until it is turned on; while narrating, one track plays straight through
 *   several sentences (no restart at each one), stops when the narration pauses and carries on when
 *   it plays; after a reload it is off again with the chosen track kept, and narrating again doesn't
 *   bring it back; every bundled track, previewed from the music library, decodes to its recorded
 *   length and the loop the player starts has no jump at its seam (on Chromium 156, whose decoder
 *   drops the first 24 samples, that needs the player's crossfaded seam).
 * Does NOT belong: Music rules in isolation (apps/web/src/features/music/*.test.ts*).
 */
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pasteText, play, waitForActiveSegment } from './helpers';

interface TrackRecord {
  id: string;
  title: string;
  file: string;
  durationSeconds: number;
}

const LIBRARY = JSON.parse(
  readFileSync(path.join(process.cwd(), 'apps/web/src/features/music/library.json'), 'utf8'),
) as { tracks: TrackRecord[] };

declare global {
  interface Window {
    musicSources: { started: number; ended: number };
    musicLoops: { seconds: number; seam: number }[];
  }
}

/**
 * Count the music sources the app starts and ends (the narration doesn't use Web Audio), and measure
 * each loop as it starts: the jump from its last sample back to its first, against a large normal step
 * (the 99.9th percentile) inside the loop.
 */
async function watchMusic(page: Page) {
  await page.addInitScript(() => {
    window.musicSources = { started: 0, ended: 0 };
    window.musicLoops = [];
    const measure = (source: AudioBufferSourceNode) => {
      const buffer = source.buffer;
      if (!source.loop || !buffer) return;
      const first = Math.round(source.loopStart * buffer.sampleRate);
      const last = Math.round(source.loopEnd * buffer.sampleRate);
      let seam = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const samples = buffer.getChannelData(channel);
        const steps: number[] = [];
        for (let i = first + 1; i < last; i += 7)
          steps.push(Math.abs(samples[i]! - samples[i - 1]!));
        steps.sort((a, b) => a - b);
        const typical = steps[Math.floor(steps.length * 0.999)]!;
        seam = Math.max(seam, Math.abs(samples[first]! - samples[last - 1]!) / typical);
      }
      window.musicLoops.push({ seconds: buffer.duration, seam });
    };
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      override createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
          window.musicSources.started += 1;
          measure(source);
          source.addEventListener('ended', () => (window.musicSources.ended += 1));
          start(...args);
        };
        return source;
      }
    };
  });
  return {
    started: () => page.evaluate(() => window.musicSources.started),
    playing: () => page.evaluate(() => window.musicSources.started - window.musicSources.ended),
    loops: () => page.evaluate(() => window.musicLoops),
  };
}

async function musicPanel(page: Page) {
  await page
    .getByRole('region', { name: 'Audio player' })
    .getByRole('button', { name: /^Audio mixer/ })
    .filter({ visible: true })
    .click();
  return page.getByRole('dialog', { name: 'Audio mixer' });
}

test.describe('background music', () => {
  test('plays one track through the narration, follows pause and play, and is off after a reload', async ({
    page,
  }) => {
    const music = await watchMusic(page);
    await pasteText(
      page,
      'The tide came in. The gulls went quiet. A lamp was lit. The keeper climbed the stairs. ' +
        'The night was long. The morning came at last.',
      'Music journey',
    );
    await play(page);
    await waitForActiveSegment(page, 0);
    const panel = await musicPanel(page);
    const toggle = panel.getByRole('switch', { name: 'Background music' });
    await expect(toggle).not.toBeChecked();
    expect(await music.started()).toBe(0);

    await toggle.click();
    await expect.poll(music.playing).toBe(1);
    await waitForActiveSegment(page, 2);
    await waitForActiveSegment(page, 3);
    expect(await music.started()).toBe(1); // one track, never restarted between sentences

    const player = page.getByRole('region', { name: 'Audio player' });
    await page.keyboard.press('Escape');
    await player.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect.poll(music.playing).toBe(0);
    await play(page);
    await expect.poll(music.playing).toBe(1);
    expect(await music.started()).toBe(2);

    await page.reload();
    const again = await musicPanel(page);
    await expect(again.getByRole('switch', { name: 'Background music' })).not.toBeChecked();
    await expect(again.getByText(LIBRARY.tracks[0]?.title ?? '')).toBeVisible();
    // Narrating again after the reload leaves the music off.
    await page.keyboard.press('Escape');
    await play(page);
    await waitForActiveSegment(page, 5);
    expect(await music.started()).toBe(0);
  });

  test('every bundled track decodes to its recorded length and loops without a jump where the player loops it', async ({
    page,
  }) => {
    const music = await watchMusic(page);
    await pasteText(page, 'A short page to open the player.', 'Music loops');
    const panel = await musicPanel(page);
    await panel.getByRole('button', { name: 'Browse' }).click();
    const library = page.getByRole('dialog', { name: 'Music library' });
    for (const [index, track] of LIBRARY.tracks.entries()) {
      await library.getByRole('button', { name: `Preview ${track.title}` }).click();
      await expect
        .poll(async () => (await music.loops()).length, { timeout: 30_000 })
        .toBe(index + 1);
    }
    const loops = await music.loops();
    for (const [index, track] of LIBRARY.tracks.entries()) {
      const loop = loops[index];
      expect(Math.abs((loop?.seconds ?? 0) - track.durationSeconds), track.id).toBeLessThan(0.05);
      expect(loop?.seam, track.id).toBeLessThan(1);
    }
  });
});
