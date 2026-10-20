// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Shared steps for end-to-end tests.
 * Scope: Adding documents (paste or upload of fixtures), starting playback, waiting for the spoken
 *   sentence to advance (proof that real audio played to its end), and reading API JSON.
 * Does NOT belong: Assertions specific to one scenario.
 */
import type { Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';
import path from 'node:path';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'documents');

export async function pasteText(page: Page, text: string, title?: string): Promise<void> {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Paste text' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Paste text' });
  if (title) await dialog.getByLabel('Title (optional)').fill(title);
  await dialog.getByLabel('Text').fill(text);
  await dialog.getByRole('button', { name: 'Add to library' }).click();
  await expect(page).toHaveURL(/\/read\/[0-9a-f]{32}$/);
}

export async function uploadFixture(page: Page, name: string): Promise<void> {
  await page.goto('/library');
  await page.getByTestId('file-input').first().setInputFiles(path.join(FIXTURES, name));
}

export function isSegmentAudio(response: Response, index?: number): boolean {
  return (
    /\/segments\/\d+\/audio/.test(response.url()) &&
    (index === undefined || response.url().includes(`/segments/${index}/audio`))
  );
}

export async function play(page: Page): Promise<void> {
  await page
    .getByRole('region', { name: 'Audio player' })
    .getByRole('button', { name: 'Play', exact: true })
    .click();
}

export async function waitForActiveSegment(
  page: Page,
  index: number,
  timeout = 60_000,
): Promise<void> {
  await expect(page.locator(`[data-index="${index}"][data-active="true"]`)).toBeVisible({
    timeout,
  });
}
