// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Empty, missing-model, accessibility and mobile checks in real browsers.
 * Scope: First-run library state; a server with no models shows install guidance and a clear player
 *   error instead of failing silently; axe finds no serious/critical violations on the main screens;
 *   phone layouts have no horizontal overflow, usable touch targets and working uploads/playback.
 * Does NOT belong: The core reading journey (reader.spec.ts).
 */
import { expect, test } from '@playwright/test';
import { pasteText, play, seriousViolations, uploadFixture } from './helpers';

const NO_MODELS = 'http://127.0.0.1:8798';

test('missing voice model shows install guidance and an actionable player error @cross-browser', async ({
  page,
}) => {
  await page.goto(`${NO_MODELS}/library`);
  await expect(page.getByText('Install the voice model to start listening')).toBeVisible();
  await expect(page.getByRole('button', { name: /Install Kokoro/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Paste text' }).first().click();
  await page.getByRole('dialog').getByLabel('Text').fill('No model is installed yet.');
  await page.getByRole('dialog').getByRole('button', { name: 'Add to library' }).click();
  await play(page);
  const player = page.getByRole('region', { name: 'Audio player' });
  await expect(player.getByRole('alert')).toContainText("isn't installed");
  await expect(player.getByRole('link', { name: 'Open Settings' })).toBeVisible();
});

test('main screens have no serious accessibility violations', async ({ page }) => {
  await pasteText(page, 'Accessibility check. Second sentence.', 'A11y');
  for (const path of [
    '/library',
    page.url().replace('http://127.0.0.1:8799', ''),
    '/voices',
    '/studio',
    '/settings',
  ]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect((await seriousViolations(page)).map((v) => `${path}: ${v}`)).toEqual([]);
  }
});

test.describe('phones @mobile', () => {
  test('layout fits the screen and controls are touch-sized', async ({ page }) => {
    await page.goto('/library');
    await expect(page.getByRole('navigation', { name: 'Main' }).last()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await pasteText(page, 'Mobile narration works. It plays on phones too.', 'Mobile');
    const playButton = page
      .getByRole('region', { name: 'Audio player' })
      .getByRole('button', { name: 'Play', exact: true });
    const box = await playButton.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    const audio = page.waitForResponse((r) => r.url().includes('/segments/0/audio'));
    await playButton.click();
    expect((await audio).status()).toBe(200);
    for (const path of ['/voices', '/studio', '/settings']) {
      await page.goto(path);
      const width = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(width, path).toBeLessThanOrEqual(1);
    }
  });

  test('uploads work from a phone', async ({ page }) => {
    await uploadFixture(page, 'sample.pdf');
    await expect(page.getByText('Harbour Stories').first()).toBeVisible();
    await page.getByRole('button', { name: 'Contents' }).click();
    const contents = page.getByRole('dialog', { name: 'Contents' });
    await contents.getByText('The Storm').click();
    await expect(
      page.getByText('By midnight the wind had turned and the rain began.'),
    ).toBeVisible();
  });
});
