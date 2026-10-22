// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Custom voice creation, use and deletion end to end, with consented synthetic test audio.
 * Scope: The reference "speaker" is a built-in Kokoro voice generated on the fly (no real person's
 *   voice is used). Imports it in Voice Studio, passes quality checks, confirms consent, creates the
 *   profile, generates a sample with the cloning engine (when installed), narrates a document with
 *   it, and permanently deletes it. Also records with Chromium's fake microphone, in the quick wizard
 *   and in a studio session (lossless capture through the AudioWorklet, saved as a take).
 * Does NOT belong: Built-in voice previews (reader.spec.ts).
 */
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pasteText, play } from './helpers';

/** Opens one of Voice Studio's creation wizards from the chooser and moves past its introduction. */
async function openWizard(page: Page, route: 'Quick voice' | 'Studio voice' = 'Quick voice') {
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Create voice' }).first().click();
  await page
    .getByRole('dialog', { name: 'Create a voice' })
    .getByRole('button', { name: route })
    .click();
  const title = route === 'Quick voice' ? 'Create a quick voice' : 'Create a studio voice';
  const wizard = page.getByRole('dialog', { name: title });
  await wizard.getByRole('button', { name: /Continue/ }).click();
  return wizard;
}

const PASSAGE =
  'Hello! I am recording a short sample so this app can learn the sound of my voice. On quiet mornings, I like to ' +
  'walk past the old bakery, where warm bread and fresh coffee fill the air.';

test('create, use and delete a custom voice', async ({ page, request }) => {
  const engines = (await (await request.get('/api/engines')).json()) as {
    id: string;
    status: string;
  }[];
  const cloningReady = engines.some(
    (engine) => engine.id === 'chatterbox' && engine.status === 'ready',
  );
  const reference = await request.post('/api/voices/kokoro:bm_george/preview', {
    headers: { 'X-LTTS-Client': 'web' },
    data: { text: PASSAGE },
  });
  expect(reference.ok()).toBe(true);
  const file = path.join(tmpdir(), 'ltts-e2e-reference.wav');
  writeFileSync(file, await reference.body());

  const wizard = await openWizard(page);
  await wizard.getByTestId('voice-file-input').setInputFiles(file);
  await expect(wizard.getByText('verified by the local server')).toBeVisible();
  await wizard.getByRole('button', { name: /Continue/ }).click();
  await wizard.getByLabel('Voice name').fill('E2E Synthetic Voice');
  await wizard.getByRole('checkbox').click();
  await wizard.getByRole('button', { name: 'Create voice' }).click();
  await expect(wizard.getByText('“E2E Synthetic Voice” is saved')).toBeVisible();

  if (cloningReady) {
    const sample = page.waitForResponse(
      (r) => r.url().includes('/api/voices/custom:') && r.url().endsWith('/preview'),
      { timeout: 150_000 },
    );
    await wizard.getByRole('button', { name: 'Generate sample' }).click();
    const response = await sample;
    expect(response.status()).toBe(200);
    expect(Number(response.headers()['x-audio-duration'])).toBeGreaterThan(1);
    await wizard.getByRole('button', { name: 'Use for reading' }).click();
    await wizard.getByRole('button', { name: 'Done' }).click();

    await pasteText(page, 'Narrated with my custom voice.', 'Custom voice doc');
    const narration = page.waitForResponse(
      (r) => r.url().includes('/segments/0/audio') && r.url().includes('custom%3A'),
      { timeout: 150_000 },
    );
    await play(page);
    expect((await narration).status()).toBe(200);
    await page.goto('/studio');
  } else {
    await expect(wizard.getByRole('button', { name: /Install Chatterbox/ })).toBeVisible();
    await wizard.getByRole('button', { name: 'Done' }).click();
  }

  await page.getByRole('button', { name: 'Delete E2E Synthetic Voice' }).click();
  await page
    .getByRole('dialog', { name: /Permanently delete/ })
    .getByRole('button', { name: 'Delete voice' })
    .click();
  await expect(page.getByText('No custom voices yet')).toBeVisible();
});

test('guided recording with the microphone', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Fake microphone flags are Chromium-only');
  const wizard = await openWizard(page);
  await wizard.getByRole('button', { name: 'Start recording' }).click();
  await expect(wizard.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.waitForTimeout(3000);
  await wizard.getByRole('button', { name: 'Stop recording' }).click();
  // Chromium's fake device produces a test tone, so the checks must flag it (too short / not speech).
  await expect(wizard.getByRole('button', { name: 'Record again' })).toBeVisible();
  await expect(wizard.getByText(/too little speech|seconds/i).first()).toBeVisible();
  await expect(wizard.getByRole('button', { name: /Continue/ })).toBeDisabled();
});

test('studio session records lossless takes with the microphone', async ({
  page,
  request,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Fake microphone flags are Chromium-only');
  const wizard = await openWizard(page, 'Studio voice');
  await wizard.getByRole('button', { name: 'Check microphone' }).click();
  await expect(wizard.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.waitForTimeout(3000);
  await wizard.getByRole('button', { name: 'Stop' }).click();
  // Chromium's fake device plays a test tone; whatever the verdict, the check must report one.
  await expect(
    wizard.getByRole('alert').or(wizard.getByText('Your microphone sounds good')).first(),
  ).toBeVisible();
  await wizard.getByRole('button', { name: /Continue/ }).click();
  // A session opens on the foundation passage, the one to record first.
  await expect(wizard.getByText(/^Foundation passage/)).toBeVisible();
  await wizard.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(wizard.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.waitForTimeout(4000);
  await wizard.getByRole('button', { name: 'Stop' }).click();
  // The take is saved (the fake tone fails the checks, so it stays on this passage to record again).
  await expect(wizard.getByRole('button', { name: 'Record again' })).toBeVisible();
  const sessions = (await (
    await request.get('/api/voice-sessions', { headers: { 'X-LTTS-Client': 'web' } })
  ).json()) as {
    id: string;
    takes: { number: number; durationS: number }[];
  }[];
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.takes).toHaveLength(1);
  expect(sessions[0]?.takes[0]?.durationS).toBeGreaterThan(0);
  await request.delete(`/api/voice-sessions/${sessions[0]?.id}`, {
    headers: { 'X-LTTS-Client': 'web' },
  });
});
