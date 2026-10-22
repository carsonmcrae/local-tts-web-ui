// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Background music in a real browser, under real Kokoro narration, with the bundled tracks.
 * Scope: Music stays off until it is turned on; while narrating, one track plays straight through
 *   several sentences (no restart at each one), stops when the narration pauses and carries on when
 *   it plays; after a reload it is off again with the chosen track kept, and narrating again doesn't
 *   bring it back; and for every bundled track, previewed from the music library and walked through
 *   chunk by chunk, every join the player schedules (the loop point included) starts on the frame
 *   the last chunk ended, has no step in what is heard, and lines the two chunks' copies of the music
 *   up, in Chromium and Firefox (whose decoders trim different amounts from a chunk's start).
 *   Measured, not listened to.
 * Does NOT belong: Music rules in isolation (apps/web/src/features/music/*.test.ts*).
 */
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pasteText, play, waitForActiveSegment } from './helpers';
import type { JoinMeasure } from './music-probe';
import { watchMusic } from './music-probe';

interface TrackRecord {
  id: string;
  title: string;
  durationSeconds: number;
  chunks: { frames: number }[];
}

const LIBRARY = JSON.parse(
  readFileSync(path.join(process.cwd(), 'apps/web/src/features/music/library.json'), 'utf8'),
) as { tracks: TrackRecord[] };

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
    await expect.poll(music.tracks).toBe(1);
    await waitForActiveSegment(page, 2);
    await waitForActiveSegment(page, 3);
    expect(await music.tracksStarted()).toBe(1); // one track, never restarted between sentences

    const player = page.getByRole('region', { name: 'Audio player' });
    await page.keyboard.press('Escape');
    await player.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect.poll(music.tracks).toBe(0);
    await play(page);
    await expect.poll(music.tracks).toBe(1);
    expect(await music.tracksStarted()).toBe(2);

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

  test('every chunk join and loop point of every track is seamless where the player joins it @cross-browser', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', "Playwright's WebKit on Windows has no Web Audio");
    test.setTimeout(5 * 60_000);
    const music = await watchMusic(page);
    await pasteText(page, 'A short page to open the player.', 'Music joins');
    const panel = await musicPanel(page);
    await panel.getByRole('button', { name: 'Browse' }).click();
    const library = page.getByRole('dialog', { name: 'Music library' });
    const joins: { label: string; measure: JoinMeasure }[] = [];
    for (const track of LIBRARY.tracks) {
      const before = (await music.newest()).voice;
      await library.getByRole('button', { name: `Preview ${track.title}` }).click();
      await expect
        .poll(async () => {
          const newest = await music.newest();
          return newest.voice !== before && newest.chunks >= 2;
        })
        .toBe(true);
      const { voice } = await music.newest();
      const count = track.chunks.length;
      // Each chunk is ended early, so the player schedules the next one now rather than in 20 s.
      for (let index = 0; index < count; index += 1) {
        const next = track.chunks[(index + 1) % count] as { frames: number };
        const measure = await music.join(voice, index, next.frames);
        joins.push({ label: `${track.id} join ${index + 1} of ${count}`, measure });
        if (index + 1 < count) {
          await music.finishOldest(voice);
          await expect.poll(async () => (await music.newest()).chunks).toBe(index + 3);
        }
      }
    }
    expect(joins).toHaveLength(LIBRARY.tracks.reduce((sum, track) => sum + track.chunks.length, 0));
    for (const track of LIBRARY.tracks) {
      const own = joins
        .filter(({ label }) => label.startsWith(`${track.id} `))
        .map(({ measure }) => measure);
      const worst = (pick: (measure: JoinMeasure) => number) => Math.max(...own.map(pick));
      console.log(
        `${browserName} ${track.id}: ${own.length} joins, seam ${worst((m) => m.seam).toFixed(2)}, ` +
          `cut ${worst((m) => m.cut).toFixed(2)}, lag ${worst((m) => Math.abs(m.lag))}, ` +
          `trim ${worst((m) => -m.decoded)}`,
      );
    }
    for (const { label, measure } of joins) {
      // The next chunk's music starts on the very frame the last one's ended.
      expect(Math.abs(measure.drift), label).toBeLessThan(1e-6);
      // No step in what is heard, at the join or where its crossfade begins.
      expect(measure.seam, label).toBeLessThan(1);
      // The two copies of the music line up, and a chunk read 24 frames off (a decoder trimming the
      // other end from the one the player assumes) would show: the estimate is good to about 5 frames
      // on noise-like beds, so the line between the two is drawn halfway.
      expect(Math.abs(measure.lag), label).toBeLessThan(12);
      expect(Math.abs(measure.shifted), label).toBeGreaterThan(12);
      // Decoders trim at most a millisecond of the 20 ms each chunk carries.
      expect(Math.abs(measure.decoded), label).toBeLessThanOrEqual(48);
    }
    // Cut together without the crossfade, some joins would step: the measure can tell.
    expect(Math.max(...joins.map(({ measure }) => measure.cut))).toBeGreaterThanOrEqual(1);
  });
});
