// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Sound effects beside real narration, in real browsers.
 * Scope: A pasted story is analysed on request, the suggestion is accepted, effects are turned on,
 *   and while Kokoro narrates the first sentence the browser fetches the bundled sound at that
 *   moment and the narration still advances; after a reload the effect is kept and effects are off
 *   again; the panel has no serious accessibility violations; on a phone the Sounds tab is reached
 *   through the Contents dialog.
 *   A browser without Web Audio (Playwright's WebKit on Windows) must say so and turn effects off.
 * Does NOT belong: Detection rules or the panel's every state (unit tests).
 */
import { expect, test } from '@playwright/test';
import { pasteText, play, seriousViolations, waitForActiveSegment } from './helpers';

const STORY =
  'The ancient door slowly creaked open. A cold wind swept through the corridor. Nobody spoke. ' +
  'Somewhere beyond the castle walls, thunder rumbled. She waited.';

test.describe('sound effects', () => {
  test('suggests, plays beside the narration and is kept for next time @cross-browser', async ({
    page,
  }) => {
    await pasteText(page, STORY, 'Sounds e2e');
    await page.getByRole('tab', { name: 'Sounds' }).click();
    const panel = page.getByRole('tabpanel');
    const toggle = panel.getByRole('switch', { name: 'Sound effects' });
    await expect(toggle).not.toBeChecked();
    await panel.getByRole('button', { name: 'Analyse this chapter' }).click();
    await expect(panel.getByRole('status')).toContainText('1 new suggestion');
    await expect(panel.getByText('A creaking door')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await panel
      .getByRole('button', {
        name: 'Accept the suggestion for “The ancient door slowly creaked open.”',
      })
      .click();
    await expect(panel.getByRole('region', { name: 'In this document' })).toBeVisible();
    await expect(page.locator('[data-index="0"][data-effect="true"]')).toBeVisible();
    await toggle.click();
    await expect(toggle).toBeChecked();
    if (await page.evaluate(() => typeof AudioContext !== 'undefined')) {
      const sound = page.waitForResponse((response) =>
        response.url().endsWith('/sfx/door-creak.mp3'),
      );
      await play(page);
      expect((await sound).status()).toBe(200);
    } else {
      // Playwright's WebKit on Windows has no Web Audio: the panel says so and effects turn off.
      await play(page);
      await expect(panel.getByRole('alert')).toContainText('aren’t available in this browser');
      await expect(toggle).not.toBeChecked();
    }
    await waitForActiveSegment(page, 1);
    await page.reload();
    await page.getByRole('tab', { name: 'Sounds' }).click();
    await expect(page.getByRole('tabpanel').getByText('A creaking door')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Sound effects' })).not.toBeChecked();
  });

  test('is reached through the Contents dialog on a phone @mobile', async ({ page }) => {
    await pasteText(page, STORY, 'Sounds on a phone');
    await page.getByRole('button', { name: 'Contents' }).click();
    const dialog = page.getByRole('dialog', { name: 'Contents' });
    await dialog.getByRole('tab', { name: 'Sounds' }).click();
    const panel = dialog.getByRole('tabpanel');
    await expect(panel.getByRole('switch', { name: 'Sound effects' })).not.toBeChecked();
    await panel.getByRole('button', { name: 'Analyse this chapter' }).click();
    await expect(panel.getByRole('status')).toContainText('1 new suggestion');
    expect(await seriousViolations(page)).toEqual([]);
  });
});
