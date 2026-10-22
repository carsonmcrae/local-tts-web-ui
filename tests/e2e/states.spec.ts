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

test('settings section links scroll the page area, never the whole window', async ({ page }) => {
  await page.goto('/settings');
  const sections = page.getByRole('navigation', { name: 'Settings sections' });
  for (const name of ['Privacy', 'About']) {
    await sections.getByRole('link', { name }).click();
    await expect(page.locator('#main')).not.toHaveJSProperty('scrollTop', 0);
    // The app shell fills the window exactly; nothing may scroll it out of line.
    expect(
      await page.evaluate(() => ({
        window: document.documentElement.scrollTop,
        overflow: document.documentElement.scrollHeight - window.innerHeight,
      })),
    ).toEqual({ window: 0, overflow: 0 });
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

  test('every control on every page is at least 24 px square (WCAG 2.5.8)', async ({ page }) => {
    await pasteText(page, 'Touch targets matter. Every control should be easy to hit.', 'Touch');
    const reader = new URL(page.url()).pathname;
    for (const path of [
      '/library',
      '/explore',
      '/voices',
      '/studio',
      '/exports',
      '/settings',
      reader,
    ]) {
      await page.goto(path);
      // Measured once the page has drawn its controls, not while it is still loading.
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      const small = await page.evaluate(() =>
        [
          // Mirrors hidden from assistive technology (a checkbox's form input) aren't targets.
          ...document.querySelectorAll<HTMLElement>(
            ':is(button, [role="slider"], [role="switch"], select, input:not([type="hidden"])):not([aria-hidden="true"])',
          ),
        ]
          .map((element) => {
            // What a finger presses: a slider's whole track rather than the thumb the role sits
            // on, and a control's label too when pressing the label works it (a card-sized radio).
            const label =
              element instanceof HTMLInputElement || element instanceof HTMLButtonElement
                ? element.labels?.[0]
                : undefined;
            const target =
              element.getAttribute('role') === 'slider'
                ? (element.closest<HTMLElement>('[data-orientation]:not([role="slider"])') ??
                  element)
                : element;
            const own = target.getBoundingClientRect();
            const box = label
              ? (() => {
                  // Pressing either works, so the target is both together.
                  const other = label.getBoundingClientRect();
                  const visible = own.width > 1 && own.height > 1 ? own : other;
                  const left = Math.min(visible.left, other.left);
                  const top = Math.min(visible.top, other.top);
                  return {
                    width: Math.max(visible.right, other.right) - left,
                    height: Math.max(visible.bottom, other.bottom) - top,
                  };
                })()
              : own;
            const name = element.getAttribute('aria-label') ?? label?.textContent ?? '';
            return { box, name: name.trim().slice(0, 40), tag: element.tagName.toLowerCase() };
          })
          // Visually hidden controls without a label of their own are left out.
          .filter(({ box }) => box.width > 1 && box.height > 1)
          .filter(({ box }) => box.width < 24 || box.height < 24)
          .map(
            ({ box, name, tag }) =>
              `${tag} "${name}" ${Math.round(box.width)}×${Math.round(box.height)}`,
          ),
      );
      expect(small, path).toEqual([]);
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
