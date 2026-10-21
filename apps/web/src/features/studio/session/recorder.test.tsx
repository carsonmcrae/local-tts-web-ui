// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the studio recorder's guidance: hints, the passage strip and the early voice.
 * Scope: Every passage has a reading hint and a stable take number; the strip jumps to a passage and
 *   says which ones are recorded, have advice or need another take; the foundation passage plus a
 *   little more unlocks an early build, with a warning on the record and build steps.
 * Does NOT belong: The full wizard (session.test.tsx) or the recorder hook.
 */
import { within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { quality, resumeStudioSession, studioApi, studioSession, take } from '@/test/studio';
import { FOUNDATION_ID, maxTakeSeconds, PASSAGES } from './passages';

describe('Studio passages', () => {
  it('gives every passage a hint and a stable take number, the foundation passage first', () => {
    expect(PASSAGES[0]?.id).toBe(FOUNDATION_ID);
    expect(PASSAGES.map((passage) => passage.number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: PASSAGES.length }, (_, index) => index + 1),
    );
    expect(PASSAGES.find((passage) => passage.id === 'narration-1')?.number).toBe(1);
    for (const passage of PASSAGES) expect(passage.hint.length).toBeGreaterThan(20);
    expect(maxTakeSeconds(PASSAGES[0]!)).toBe(100);
    expect(maxTakeSeconds(PASSAGES[1]!)).toBe(45);
  });
});

describe('Studio recorder guidance', () => {
  it('jumps to any passage from the strip, which shows each passage’s state', async () => {
    const retake = {
      ...take(2, 'narration-2', 2),
      quality: quality(2, [{ code: 'too_short', severity: 'error', message: 'Too short.' }]),
    };
    const advice = {
      ...take(3, 'narration-3'),
      quality: quality(12, [{ code: 'noisy', severity: 'warning', message: 'A bit noisy.' }]),
    };
    studioApi(studioSession({ takes: [take(1, 'narration-1'), retake, advice], usableSpeechS: 24, requiredSpeechS: 300 })); // prettier-ignore
    const { user, dialog } = await resumeStudioSession();
    expect(await within(dialog).findByText('Foundation passage')).toBeInTheDocument();
    await user.click(within(dialog).getByText(/All passages \(2 of 49 recorded\)/));
    const strip = within(dialog).getByRole('list', { name: 'Passages' });
    expect(within(strip).getByRole('button', { name: 'Foundation passage, not recorded' })).toHaveAttribute('aria-current', 'step'); // prettier-ignore
    expect(within(strip).getByRole('button', { name: 'Passage 1, recorded' })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: 'Passage 2, needs another take' })).toBeInTheDocument(); // prettier-ignore
    await user.click(
      within(strip).getByRole('button', { name: 'Passage 3, recorded, with advice' }),
    );
    expect(within(dialog).getByText(/Passage 3 of 48/)).toBeInTheDocument();
    expect(within(dialog).getByText('A bit noisy.')).toBeInTheDocument();
    expect(within(dialog).getByText('Recorded · 12 s')).toBeInTheDocument();
    expect(within(dialog).getByText(/Start with the foundation passage/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Continue/ })).toBeDisabled();
  });

  it('lets an early voice be built from the foundation passage, with a warning', async () => {
    const early = studioSession({
      takes: [take(49, 'foundation', 50), take(1, 'narration-1')],
      usableSpeechS: 62,
      requiredSpeechS: 300,
      canBuild: true,
      complete: false,
    });
    studioApi(early);
    const { user, dialog } = await resumeStudioSession();
    expect(await within(dialog).findByText('You can build an early version now')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    expect(await within(dialog).findByText('This will be an early version of your voice')).toBeInTheDocument();
  }); // prettier-ignore

  it('asks for a little more speech once the foundation passage is recorded', async () => {
    studioApi(studioSession({ takes: [take(49, 'foundation', 35)], usableSpeechS: 35, requiredSpeechS: 300 }));
    const { dialog } = await resumeStudioSession();
    expect(await within(dialog).findByText(/Record a little more \(45 seconds in all\)/)).toBeInTheDocument();
  }); // prettier-ignore
});
