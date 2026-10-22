// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for Voice Studio on a phone or tablet paired in LAN mode.
 * Scope: The page only lists the voices to choose from: no creating or importing (the header and the
 *   empty state say where voices are made instead), no engine section, and a card that offers "Use
 *   for reading" alone, without renaming, deleting, playing the recording, the delivery or expression
 *   controls or sharing.
 * Does NOT belong: Fine-tuning on a phone (tuningOnPhone.test.tsx) or the studio on this computer
 *   (profiles.test.tsx, sharing.test.tsx).
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VoiceProfile } from '@/api/types';
import type * as LanModule from '@/features/lan/LanIndicator';
import { kokoro, mockApi, preferences, renderWithApp, voice, voiceProfile } from '@/test/render';
import { chatterbox } from '@/test/studio';
import VoiceStudioPage from './VoiceStudioPage';

// Paired over the LAN: everything else about the indicator stays as it is.
vi.mock('@/features/lan/LanIndicator', async (importOriginal) => {
  const actual = await importOriginal<typeof LanModule>();
  return { ...actual, onThisComputer: () => false };
});

/** The studio over a ready cloning engine, as a paired phone sees it. */
function pairedPage(profiles: VoiceProfile[]) {
  mockApi({
    'GET /api/voice-profiles': profiles,
    'GET /api/voice-sessions': [],
    'GET /api/voices': [voice()],
    'GET /api/preferences': preferences,
    'GET /api/engines': [kokoro(), chatterbox()],
  });
  renderWithApp(<VoiceStudioPage />);
}

const STAYS_ON_THE_COMPUTER = [
  'Create voice', 'Import a voice', 'Rename Studio me', 'Delete Studio me', 'Play recording', 'Share',
  'Rebuild expression',
]; // prettier-ignore

describe('Voice Studio on a paired phone', () => {
  it('offers a voice for reading and nothing that changes it', async () => {
    pairedPage([
      voiceProfile({ name: 'Studio me', kind: 'studio', source: 'studio', canRefine: true, styles: ['question'] }), // prettier-ignore
    ]);
    expect(await screen.findByRole('button', { name: 'Use for reading' })).toBeEnabled();
    expect(
      screen.getByText(
        'Voices are created, imported and changed on the computer running TTSNative.',
      ),
    ).toBeInTheDocument();
    for (const name of STAYS_ON_THE_COMPUTER)
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delivery')).not.toBeInTheDocument();
    expect(screen.queryByText(/in your own style/)).not.toBeInTheDocument();
  });

  it('says where voices are made when there are none yet', async () => {
    pairedPage([]);
    expect(
      await screen.findByText(
        'Voices are created on the computer running TTSNative; they appear here to choose from.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create your first voice' }),
    ).not.toBeInTheDocument();
  });
});
