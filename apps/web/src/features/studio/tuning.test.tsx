// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for fine-tuning a studio voice from its profile card.
 * Scope: A voice that kept its takes offers the fine-tune and shows the job; a waiting fine-tune
 *   plays each sentence now and fine-tuned and is kept or discarded; a kept one can be removed; a
 *   failed run explains why; voices without takes don't offer it.
 * Does NOT belong: Speaking styles and sharing (sharing.test.tsx) or creating voices.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { JobOut, VoiceProfile } from '@/api/types';
import { kokoro, mockApi, preferences, renderWithApp, voiceProfile } from '@/test/render';
import { chatterbox } from '@/test/studio';
import VoiceStudioPage from './VoiceStudioPage';

const JOB_ID = 'f'.repeat(32);
const tuneJob = (status: JobOut['status'], message = 'Fine-tuning on your takes…'): JobOut => ({
  id: JOB_ID, kind: 'voice-tune', status, progress: 0.4, message, payload: {}, result: null,
  errorCode: status === 'failed' ? 'no_gain' : null, createdAt: '2026-10-20T10:00:00+00:00',
  updatedAt: '2026-10-20T10:00:00+00:00',
}); // prettier-ignore

const candidate: NonNullable<VoiceProfile['tuning']> = {
  epochs: 4, bestEpoch: 4, lossBefore: 4.1, lossAfter: 3.89, gain: 0.051, similarityBefore: 0.91,
  similarityAfter: 0.92, texts: ['A quiet morning.', 'Are you serious?'], createdAt: '2026-10-20T10:05:00+00:00',
}; // prettier-ignore

const studio = (overrides: Partial<VoiceProfile> = {}) =>
  voiceProfile({
    name: 'Studio me',
    kind: 'studio',
    source: 'studio',
    canRefine: true,
    canTune: true,
    ...overrides,
  });

function studioPage(profiles: () => unknown[], routes: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/engines': [kokoro(), chatterbox()],
    'GET /api/preferences': preferences,
    'GET /api/voices': [],
    'GET /api/voice-profiles': () => profiles(),
    'GET /api/voice-profiles/consent': { statement: 'I have permission to use this voice.' },
    'GET /api/voice-sessions': [],
    ...routes,
  });
}

describe('Fine-tuning a voice', () => {
  it('starts a fine-tune and then offers the result to compare', async () => {
    let profile = studio();
    const { calls } = studioPage(() => [profile], {
      'POST /api/voice-profiles/': () => {
        profile = studio({ tuning: candidate });
        return tuneJob('running');
      },
      'GET /api/jobs/': tuneJob('succeeded'),
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    expect(await screen.findByText(/Experimental: fine-tune the voice/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fine-tune this voice' }));
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/tuning'))).toBe(true));
    expect(
      await screen.findByText(/predicted the passages it didn’t train on 5% better/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep fine-tune' })).toBeInTheDocument();
  });

  it('plays each sentence now and fine-tuned, and keeps the fine-tune', async () => {
    let profile = studio({ tuning: candidate });
    const { calls } = studioPage(() => [profile], {
      'POST /api/voice-profiles/': () => {
        profile = studio({ fineTuned: true });
        return profile;
      },
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    const tuned = await screen.findByRole('button', { name: 'Play sentence 2, fine-tuned' });
    await user.click(tuned);
    expect(
      await screen.findByRole('button', { name: 'Stop sentence 2, fine-tuned' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play sentence 1, now' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep fine-tune' }));
    await waitFor(() =>
      expect(
        calls.some((call) => call.method === 'POST' && call.path.endsWith('/tuning/keep')),
      ).toBe(true),
    );
    expect(await screen.findByText(/Fine-tuned on this computer/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fine-tune again' })).toBeInTheDocument();
  });

  it('discards a waiting fine-tune and removes a kept one', async () => {
    let profile = studio({ fineTuned: true, tuning: candidate });
    const { calls } = studioPage(() => [profile], {
      'DELETE /api/voice-profiles/': () => {
        profile = studio({ fineTuned: profile.tuning ? true : false });
        return profile;
      },
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    const card = (await screen.findByText(/Fine-tuned on this computer/)).closest('li');
    expect(card).not.toBeNull();
    await user.click(within(card as HTMLElement).getByRole('button', { name: 'Remove fine-tune' }));
    await waitFor(() =>
      expect(calls.map((call) => `${call.method} ${call.path.split('/').pop()}`)).toEqual(
        expect.arrayContaining(['DELETE tuning', 'DELETE adapter']),
      ),
    );
    expect(await screen.findByRole('button', { name: 'Fine-tune this voice' })).toBeInTheDocument();
  });

  it('explains why a fine-tune was not offered', async () => {
    studioPage(() => [studio()], {
      'POST /api/voice-profiles/': tuneJob('running'),
      'GET /api/jobs/': tuneJob(
        'failed',
        'Fine-tuning didn’t bring the voice closer to your own reading, so nothing was changed.',
      ),
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    await user.click(await screen.findByRole('button', { name: 'Fine-tune this voice' }));
    expect(await screen.findByText(/didn’t bring the voice closer/)).toBeInTheDocument();
  });

  it('is not offered for a voice without takes', async () => {
    studioPage(() => [voiceProfile({ kind: 'studio', source: 'shared' })]);
    renderWithApp(<VoiceStudioPage />);
    await screen.findByText('Shared');
    expect(screen.queryByRole('button', { name: /Fine-tune/ })).not.toBeInTheDocument();
  });
});
