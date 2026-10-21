// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Background music in a real browser, under real Kokoro narration, with the bundled tracks.
 * Scope: Music stays off until it is turned on; while narrating, one track plays straight through
 *   several sentences (no restart at each one), stops when the narration pauses and carries on when
 *   it plays; after a reload it is off again with the chosen track kept; every bundled track
 *   decodes to its recorded length and loops without a jump at the seam.
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
  }
}

/** Count the music sources the app starts and ends (the narration doesn't use Web Audio). */
async function watchMusic(page: Page) {
  await page.addInitScript(() => {
    window.musicSources = { started: 0, ended: 0 };
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      override createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
          window.musicSources.started += 1;
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
  };
}

async function musicPanel(page: Page) {
  await page
    .getByRole('region', { name: 'Audio player' })
    .getByRole('button', { name: /^Background music/ })
    .filter({ visible: true })
    .click();
  return page.getByRole('dialog', { name: 'Background music' });
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
    await expect(again.getByRole('switch')).not.toBeChecked();
    await expect(again.getByText(LIBRARY.tracks[0]?.title ?? '')).toBeVisible();
  });

  test('every bundled track decodes to its recorded length and loops without a jump', async ({
    page,
  }) => {
    await page.goto('/library');
    const results = await page.evaluate(async (tracks) => {
      const context = new AudioContext();
      const out: { id: string; seconds: number; recorded: number; seam: number }[] = [];
      for (const track of tracks) {
        const data = await (await fetch(`/music/${track.file}`)).arrayBuffer();
        const buffer = await context.decodeAudioData(data);
        let seam = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
          const samples = buffer.getChannelData(channel);
          const steps: number[] = [];
          for (let i = 1; i < samples.length; i += 7)
            steps.push(Math.abs(samples[i]! - samples[i - 1]!));
          steps.sort((a, b) => a - b);
          const typical = steps[Math.floor(steps.length * 0.999)]!;
          // The jump from the last sample back to the first, against a large normal step.
          seam = Math.max(seam, Math.abs(samples[0]! - samples[samples.length - 1]!) / typical);
        }
        out.push({ id: track.id, seconds: buffer.duration, recorded: track.durationSeconds, seam });
      }
      await context.close();
      return out;
    }, LIBRARY.tracks);
    for (const result of results) {
      expect(Math.abs(result.seconds - result.recorded), result.id).toBeLessThan(0.05);
      expect(result.seam, result.id).toBeLessThan(1);
    }
  });
});
