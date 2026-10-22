// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for a studio voice's fine-tune on a phone or tablet paired in LAN mode.
 * Scope: Starting, comparing, keeping, discarding and removing a fine-tune are refused to paired
 *   devices, so none of it is offered there; the card only says whether one is kept or waiting.
 * Does NOT belong: Fine-tuning on this computer (tuning.test.tsx) or LAN policy (the server).
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VoiceProfile } from '@/api/types';
import { kokoro, mockApi, preferences, renderWithApp, voiceProfile } from '@/test/render';
import { chatterbox } from '@/test/studio';
import VoiceStudioPage from './VoiceStudioPage';

vi.mock('@/features/lan/LanIndicator', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  onThisComputer: () => false,
}));

const candidate: NonNullable<VoiceProfile['tuning']> = {
  epochs: 4, bestEpoch: 4, lossBefore: 4.1, lossAfter: 3.89, gain: 0.051, similarityBefore: 0.91,
  similarityAfter: 0.92, texts: ['A quiet morning.'], createdAt: '2026-10-20T10:05:00+00:00',
}; // prettier-ignore

function studioPage(profile: VoiceProfile) {
  mockApi({
    'GET /api/engines': [kokoro(), chatterbox()],
    'GET /api/preferences': preferences,
    'GET /api/voices': [],
    'GET /api/voice-profiles': [profile],
    'GET /api/voice-profiles/consent': { statement: 'I have permission to use this voice.' },
    'GET /api/voice-sessions': [],
  });
}

const studio = (overrides: Partial<VoiceProfile>) =>
  voiceProfile({
    name: 'Studio me',
    kind: 'studio',
    source: 'studio',
    canTune: true,
    ...overrides,
  });

describe('Fine-tuning on a paired phone', () => {
  it('offers nothing to start, and says nothing when there is no fine-tune', async () => {
    studioPage(studio({}));
    renderWithApp(<VoiceStudioPage />);
    await screen.findByText('Studio me');
    expect(screen.queryByRole('button', { name: /Fine-tune/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/fine-tune/i)).not.toBeInTheDocument();
  });

  it('says a waiting fine-tune is compared on the computer, with no players or decisions', async () => {
    studioPage(studio({ tuning: candidate }));
    renderWithApp(<VoiceStudioPage />);
    expect(await screen.findByText(/waiting: compare it.*on the computer/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Play sentence/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep fine-tune' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
  });

  it('says a voice is fine-tuned, without offering to remove it', async () => {
    studioPage(studio({ fineTuned: true }));
    renderWithApp(<VoiceStudioPage />);
    expect(
      await screen.findByText(/Fine-tuned on the computer running TTSNative/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove fine-tune' })).not.toBeInTheDocument();
  });
});
