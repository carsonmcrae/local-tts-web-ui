// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for reviewing a studio take and seeing how far the session has come.
 * Scope: The most important issue first with the rest under "Also noticed"; comparing a take with the
 *   one it replaced and keeping the previous take; the three voice tiers; the speaking styles the takes
 *   can teach with one optional pointer; and microphone problems shown as a message with a hint.
 * Does NOT belong: The full wizard (session.test.tsx) or the passage strip (recorder.test.tsx).
 */
import { within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionTake } from '@/api/types';
import { quality, resumeStudioSession, studioApi, studioSession, take } from '@/test/studio';
import {
  MicrophoneError,
  describeMicrophoneError,
  explainMicrophoneError,
} from '@/lib/audio/recorder';

const foundationTake = (overrides: Partial<SessionTake> = {}): SessionTake => ({
  ...take(49, 'foundation', 50),
  ...overrides,
});

describe('Reviewing a take', () => {
  it('shows the most important issue first and the rest as quieter notes', async () => {
    const issues = [
      { code: 'noisy', severity: 'warning' as const, message: 'Some background noise is audible.' },
      { code: 'clipping', severity: 'error' as const, message: 'The audio is distorted (clipping).' },
      { code: 'cut_off', severity: 'warning' as const, message: 'The take ends mid-word.' },
    ];
    studioApi(studioSession({ takes: [foundationTake({ quality: quality(50, issues) })], requiredSpeechS: 300 }));
    const { dialog } = await resumeStudioSession();
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('The audio is distorted (clipping).');
    const notes = within(dialog).getByText('Also noticed').parentElement as HTMLElement;
    expect(within(notes).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Some background noise is audible.',
      'The take ends mid-word.',
    ]);
  }); // prettier-ignore

  it('compares a take with the one it replaced and can keep the previous one', async () => {
    const previous = { durationS: 41, quality: quality(41), createdAt: '2026-10-20T09:00:00+00:00' };
    const { calls } = studioApi(
      studioSession({ takes: [foundationTake({ previous })], requiredSpeechS: 300 }),
      { 'POST /api/voice-sessions/': () => foundationTake({ durationS: 41 }) },
    );
    const { user, dialog } = await resumeStudioSession();
    await user.click(await within(dialog).findByRole('button', { name: 'Previous passage' })); // to the foundation passage
    expect(await within(dialog).findByText(/Your previous take of this passage is kept/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Listen to the previous take' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Keep the previous take' }));
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/takes/49/restore'))).toBe(true);
  }); // prettier-ignore

  it('says nothing about a previous take when there is none', async () => {
    studioApi(studioSession({ takes: [foundationTake()], requiredSpeechS: 300 }));
    const { user, dialog } = await resumeStudioSession();
    await user.click(await within(dialog).findByRole('button', { name: 'Previous passage' })); // to the foundation passage
    await within(dialog).findByText('Recorded · 50 s');
    expect(within(dialog).queryByRole('button', { name: 'Keep the previous take' })).not.toBeInTheDocument();
  }); // prettier-ignore
});

describe('Session progress', () => {
  it('marks the tier, each style out of three, and the passage that would help most', async () => {
    const styles = [
      { style: 'narration', takes: 3, needed: 3 }, { style: 'question', takes: 0, needed: 3 },
      { style: 'lively', takes: 1, needed: 3 }, { style: 'dialogue', takes: 0, needed: 3 },
      { style: 'calm', takes: 1, needed: 3 },
    ];
    studioApi(studioSession({
      takes: [foundationTake(), take(1, 'narration-1')], usableSpeechS: 62, requiredSpeechS: 300,
      canBuild: true, tier: 'foundation', styles, suggested: ['questions-and-surprise-2'],
    })); // prettier-ignore
    const { user, dialog } = await resumeStudioSession();
    const tiers = await within(dialog).findByRole('list', { name: 'Your voice so far' });
    const steps = within(tiers).getAllByRole('listitem');
    expect(steps.map((step) => step.getAttribute('aria-current'))).toEqual(['step', null, null]);
    expect(steps[0]).toHaveTextContent('Foundation, reached');
    expect(steps[2]).toHaveTextContent('Complete, not yet');
    expect(steps[2]).toHaveTextContent('every style it uses');
    const covered = within(dialog).getByRole('list', { name: 'Speaking styles' });
    expect(within(covered).getByText(/Questions/)).toHaveTextContent('Questions 0/3, needs more');
    expect(within(covered).getByText(/Narration/)).toHaveTextContent('Narration 3/3, has all it uses');
    expect(within(dialog).getByText(/Most useful next/)).toHaveTextContent('Questions and surprise');
    await user.click(within(dialog).getByRole('button', { name: 'Go to it' }));
    expect(within(dialog).getByText(/^Have you ever wondered why the/)).toBeInTheDocument();
  }); // prettier-ignore

  it('says when more passages would not change the voice', async () => {
    const styles = ['narration', 'question', 'lively', 'dialogue', 'calm'].map((style) => ({ style, takes: 3, needed: 3 }));
    studioApi(studioSession({
      takes: [foundationTake(), take(1, 'narration-1')], usableSpeechS: 150, requiredSpeechS: 300,
      canBuild: true, complete: true, tier: 'complete', styles, suggested: [],
    })); // prettier-ignore
    const { dialog } = await resumeStudioSession();
    expect(await within(dialog).findByText(/More passages won’t change it/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Most useful next/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText('You can build an early version now')).not.toBeInTheDocument();
  }); // prettier-ignore

  it('keeps quiet about styles before the first good take', async () => {
    studioApi(studioSession({ requiredSpeechS: 300 }));
    const { dialog } = await resumeStudioSession();
    await within(dialog).findByRole('list', { name: 'Your voice so far' });
    expect(within(dialog).queryByRole('list', { name: 'Speaking styles' })).not.toBeInTheDocument();
  });
});

describe('Microphone problems', () => {
  it('give one message and a hint on what to do', () => {
    const blocked = explainMicrophoneError(new DOMException('no', 'NotAllowedError'));
    expect([blocked.code, blocked.message]).toEqual(['denied', 'Microphone access was blocked.']);
    expect(blocked.hint).toMatch(/site settings/);
    expect(explainMicrophoneError(new DOMException('gone', 'AbortError')).code).toBe('device');
    expect(explainMicrophoneError(new Error('?')).code).toBe('unknown');
    expect(
      describeMicrophoneError(new MicrophoneError('empty', 'Nothing was recorded.', 'Check it.')),
    ).toBe('Nothing was recorded. Check it.');
  });
});
