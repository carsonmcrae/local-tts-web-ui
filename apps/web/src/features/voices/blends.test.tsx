// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for blending built-in voices into a new one.
 * Scope: The dialog's voices, shares shown as percentages, adding and removing parts, refusing the
 *   same voice twice, saving the blend, listing and deleting blends, and hiding the feature until two
 *   built-in Kokoro voices are installed.
 * Does NOT belong: Browsing and previewing voices (voices.test.tsx).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceBlend } from '@/api/blendQueries';
import { kokoro, mockApi, preferences, renderWithApp, voice } from '@/test/render';
import VoiceLibraryPage from './VoiceLibraryPage';

afterEach(() => vi.unstubAllGlobals());

const heart = voice();
const george = voice({ id: 'kokoro:bm_george', name: 'George', language: 'English (UK)' });
const cloned = voice({ id: 'custom:me', name: 'Me', category: 'custom', engineId: 'chatterbox' });
const saved: VoiceBlend = {
  id: 'b'.repeat(32),
  voiceId: `blend:${'b'.repeat(32)}`,
  name: 'Warm mix',
  parts: [
    { voiceId: heart.id, weight: 0.5 },
    { voiceId: george.id, weight: 0.5 },
  ],
  createdAt: '2026-10-21T10:00:00+00:00',
};

function api(voices = [heart, george, cloned], blends: VoiceBlend[] = []) {
  return mockApi({
    'GET /api/engines': [kokoro()],
    'GET /api/preferences': preferences,
    'GET /api/voices': voices,
    'GET /api/voice-profiles/blends': blends,
    'POST /api/voice-profiles/blends': saved,
    'DELETE /api/voice-profiles/blends/': () => new Response(null, { status: 204 }),
  });
}

describe('Voice blends', () => {
  it('mixes built-in voices with shares, and never offers cloned voices', async () => {
    const { calls } = api();
    const user = userEvent.setup();
    renderWithApp(<VoiceLibraryPage />);
    await user.click(await screen.findByRole('button', { name: 'Blend voices' }));
    const dialog = await screen.findByRole('dialog', { name: 'Blend voices' });
    const first = within(dialog).getByLabelText('Voice 1');
    expect(
      within(first)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Heart · English (US)', 'George · English (UK)']);
    expect(within(dialog).getAllByText('Share of the mix: 50%')).toHaveLength(2);
    expect(
      within(dialog).getByText(/Cloned voices copy one person’s recording/),
    ).toBeInTheDocument();
    const make = within(dialog).getByRole('button', { name: 'Make this blend' });
    expect(make).toBeDisabled(); // no name yet
    await user.type(within(dialog).getByLabelText('Name'), 'Warm mix');
    await user.selectOptions(within(dialog).getByLabelText('Voice 2'), heart.id);
    expect(within(dialog).getByText('Choose a different voice for each part.')).toBeInTheDocument();
    expect(make).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Voice 2'), george.id);
    await user.click(within(dialog).getByRole('button', { name: 'Add a voice' }));
    expect(within(dialog).getAllByText('Share of the mix: 33%')).toHaveLength(3);
    await user.click(within(dialog).getByRole('button', { name: 'Remove voice 3' }));
    await user.click(make);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const sent = calls.find((call) => call.method === 'POST');
    expect(JSON.parse(String(sent?.body))).toEqual({
      name: 'Warm mix',
      parts: [
        { voiceId: heart.id, weight: 5 },
        { voiceId: george.id, weight: 5 },
      ],
    });
    expect(await screen.findByText('Warm mix is ready')).toBeInTheDocument();
  });

  it('lists blends and deletes one after confirmation', async () => {
    const { calls } = api(undefined, [saved]);
    const user = userEvent.setup();
    renderWithApp(<VoiceLibraryPage />);
    await user.click(await screen.findByText('Your blends (1)'));
    await user.click(screen.getByRole('button', { name: 'Delete Warm mix' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete Warm mix?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete blend' }));
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'DELETE' && call.path.endsWith(saved.id))).toBe(
        true,
      ),
    );
  });

  it('stays hidden until two built-in Kokoro voices are installed', async () => {
    api([heart, cloned]);
    renderWithApp(<VoiceLibraryPage />);
    await screen.findByText('Heart');
    expect(screen.queryByRole('button', { name: 'Blend voices' })).not.toBeInTheDocument();
  });
});
