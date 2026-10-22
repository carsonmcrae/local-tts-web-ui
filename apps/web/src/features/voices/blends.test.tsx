// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for blending built-in voices into a new one.
 * Scope: The dialog's voices, shares shown as percentages (and moved), adding and removing parts (four
 *   at most, each row keeping its own controls), refusing the same voice twice, saving the blend or explaining a refusal, closing with
 *   Escape, listing and deleting blends, and hiding the feature until two built-in Kokoro voices are
 *   installed.
 * Does NOT belong: Browsing and previewing voices (voices.test.tsx).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceBlend } from '@/api/blendQueries';
import { json, kokoro, mockApi, preferences, renderWithApp, voice } from '@/test/render';
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

function api(
  voices = [heart, george, cloned],
  blends: VoiceBlend[] = [],
  overrides: Record<string, unknown> = {},
) {
  return mockApi({
    'GET /api/engines': [kokoro()],
    'GET /api/preferences': preferences,
    'GET /api/voices': voices,
    'GET /api/voice-profiles/blends': blends,
    'POST /api/voice-profiles/blends': saved,
    'DELETE /api/voice-profiles/blends/': () => new Response(null, { status: 204 }),
    ...overrides,
  });
}

/** Opens the Voice Library and its Blend voices dialog. */
async function openBlendDialog() {
  const user = userEvent.setup();
  renderWithApp(<VoiceLibraryPage />);
  await user.click(await screen.findByRole('button', { name: 'Blend voices' }));
  return { user, dialog: await screen.findByRole('dialog', { name: 'Blend voices' }) };
}

describe('Voice blends', () => {
  it('mixes built-in voices with shares, and never offers cloned voices', async () => {
    const { calls } = api();
    const { user, dialog } = await openBlendDialog();
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

  it('keeps a row’s own controls when an earlier voice is removed', async () => {
    api();
    const { user, dialog } = await openBlendDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Add a voice' }));
    const third = within(dialog).getByLabelText('Voice 3');
    await user.click(within(dialog).getByRole('button', { name: 'Remove voice 1' }));
    // The third row moves up as itself (so focus stays put), now named Voice 2.
    expect(within(dialog).getByLabelText('Voice 2')).toBe(third);
    expect(third).toHaveValue(heart.id);
    expect(within(dialog).getByLabelText('Voice 1')).toHaveValue(george.id);
  });

  it('moves the shares, stops at four voices, closes with Escape and explains a refusal', async () => {
    api(undefined, [], {
      'POST /api/voice-profiles/blends': () =>
        json({ error: { code: 'refused', message: 'Too many blends already.' } }, 409),
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceLibraryPage />);
    await user.click(await screen.findByRole('button', { name: 'Blend voices' }));
    let dialog = await screen.findByRole('dialog', { name: 'Blend voices' });
    const [share] = within(dialog).getAllByLabelText('Share of the mix: 50%');
    fireEvent.change(share!, { target: { value: '10' } });
    expect(within(dialog).getByLabelText('Share of the mix: 67%')).toHaveAttribute('aria-valuetext', '67 percent'); // prettier-ignore
    expect(within(dialog).getByLabelText('Share of the mix: 33%')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add a voice' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add a voice' }));
    expect(within(dialog).getByLabelText('Voice 4')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Add a voice' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Blend voices' }));
    dialog = await screen.findByRole('dialog', { name: 'Blend voices' });
    await user.type(within(dialog).getByLabelText('Name'), 'Loud mix');
    await user.click(within(dialog).getByRole('button', { name: 'Make this blend' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Too many blends already.');
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
