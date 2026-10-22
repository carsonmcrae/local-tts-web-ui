// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the reading experience chooser of an included book.
 * Scope: Nothing for an ordinary document or a book without a preset; the preset's title, summary,
 *   suggested voice (given to the player on request), music recommendation and characters with the
 *   voice each gets or "not installed"; Immersive offered only once effects and music are available;
 *   choosing Multi-voice applies the voice components, choosing Standard removes them; an error is
 *   shown and the choice can be made again.
 * Does NOT belong: The server's preset logic or the reader page around it (reader.test.tsx).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReadingPreset } from '@/api/types';
import { mockApi, renderWithApp } from '@/test/render';
import { ReadingExperience } from './ReadingExperience';

afterEach(() => vi.unstubAllGlobals());

const DOC = 'b'.repeat(32);
const NOTE = 'Sound effects arrive with a later version of TTSNative.';

const report = (applied: string[] = [], available = false): ReadingPreset => ({
  presetId: 'alice-immersive',
  presetVersion: 1,
  workId: 'alice',
  title: 'Wonderland, in voices',
  summary: 'Alice and the Rabbit in their own voices.',
  narrator: { preferred: 'kokoro:af_heart', chosen: 'kokoro:alpha' },
  characters: [
    { id: 'alice', name: 'Alice', description: null, lines: 179,
      voice: { preferred: 'kokoro:bf_isabella', chosen: 'kokoro:alpha' } },
    { id: 'rabbit', name: 'White Rabbit', description: 'Late.', lines: 0,
      voice: { preferred: 'kokoro:am_puck', chosen: null } },
  ], // prettier-ignore
  speakersResolved: 8,
  speakersUnresolved: 0,
  effects: 5,
  musicTrackId: 'gymnopedie-1',
  components: [
    { name: 'narrator', available: true, note: 'A voice.', applied: applied.includes('narrator') },
    {
      name: 'characters',
      available: true,
      note: 'Voices.',
      applied: applied.includes('characters'),
    },
    { name: 'speakers', available: true, note: 'Lines.', applied: applied.includes('speakers') },
    { name: 'effects', available, note: NOTE, applied: applied.includes('effects') },
    { name: 'music', available, note: 'Music later.', applied: applied.includes('music') },
  ],
  appliedAt: applied.length ? '2026-10-21T00:00:00+00:00' : null,
  appliedVersion: applied.length ? 1 : null,
});

const voices = [
  { id: 'kokoro:alpha', engineId: 'kokoro', name: 'Alpha', language: 'English (US)',
    languageCode: 'en-us', gender: 'female', category: 'built-in', description: '', available: true },
]; // prettier-ignore

const failure = (code: string) =>
  new Response(JSON.stringify({ error: { code, message: 'Try again.' } }), {
    status: 409,
    headers: { 'content-type': 'application/json' },
  });

function renderChooser(bundledWorkId: string | null = 'alice') {
  const onChanged = vi.fn();
  const onVoice = vi.fn();
  const view = renderWithApp(
    <ReadingExperience
      documentId={DOC}
      bundledWorkId={bundledWorkId}
      onChanged={onChanged}
      onVoice={onVoice}
    />,
    { path: '/read/:documentId', route: `/read/${DOC}` },
  );
  return { user: userEvent.setup(), onChanged, onVoice, ...view };
}

const region = () => screen.findByRole('region', { name: 'Reading experience' });

describe('Reading experience', () => {
  it('shows nothing for an ordinary document, or a book without a preset', async () => {
    const { calls } = mockApi({
      'GET /api/documents/': new Response(
        JSON.stringify({ error: { code: 'preset_not_found', message: 'None.' } }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      ),
    });
    renderChooser(null);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(calls.filter((call) => call.path.endsWith('/preset'))).toHaveLength(0);
    renderChooser('alice');
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/preset'))).toBe(true));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    const broken = mockApi({ 'GET /api/documents/': new Response('down', { status: 500 }) });
    renderChooser('alice');
    await waitFor(() =>
      expect(broken.calls.some((call) => call.path.endsWith('/preset'))).toBe(true),
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('shows a bare preset plainly, applies everything for immersive, and takes one choice at a time', async () => {
    const bare = { ...report([], true), narrator: null, musicTrackId: null, characters: [] };
    let release: (() => void) | undefined;
    const { calls } = mockApi({
      'GET /api/documents/': bare, // and no voices answer yet
      'POST /api/documents/': () =>
        new Promise((resolve) => {
          release = () =>
            resolve(report(['narrator', 'characters', 'speakers', 'effects', 'music'], true));
        }),
    });
    const { user, onChanged } = renderChooser();
    const chooser = await region();
    expect(within(chooser).queryByText('Suggested reading voice')).not.toBeInTheDocument();
    expect(within(chooser).queryByText(/is recommended/)).not.toBeInTheDocument();
    expect(within(chooser).queryByRole('list')).not.toBeInTheDocument();
    await user.click(within(chooser).getByRole('radio', { name: /Immersive/ }));
    await user.click(within(chooser).getByRole('radio', { name: /Multi-voice/ })); // while the first is pending
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    expect(calls.find((call) => call.method === 'POST')?.body).toBe(
      '{"components":["narrator","characters","speakers","effects","music"]}',
    );
    release?.();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(within(chooser).getByRole('radio', { name: /Immersive/ })).toBeChecked();
  });

  it('describes the preset, offers the suggested voice and applies the voices', async () => {
    const { calls } = mockApi({
      'GET /api/voices': voices,
      'GET /api/documents/': report(),
      'POST /api/documents/': report(['narrator', 'characters', 'speakers']),
    });
    const { user, onChanged, onVoice } = renderChooser();
    const chooser = await region();
    expect(within(chooser).getByRole('heading', { name: 'Wonderland, in voices' })).toBeVisible();
    expect(within(chooser).getByRole('radio', { name: /Standard/ })).toBeChecked();
    expect(within(chooser).queryByRole('radio', { name: /Immersive/ })).not.toBeInTheDocument();
    expect(within(chooser).getByText(NOTE)).toBeInTheDocument();
    expect(within(chooser).getByText(/Gymnopedie 1 is recommended/)).toBeInTheDocument();
    const characters = within(chooser).getByRole('list', { name: 'Characters in this experience' });
    expect(
      within(characters)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Alice · 179 lines · Alpha · English (US)', 'White Rabbit · not installed here']);
    await user.click(within(chooser).getByRole('button', { name: 'Use this voice' }));
    expect(onVoice).toHaveBeenCalledWith('kokoro:alpha');
    await user.click(within(chooser).getByRole('radio', { name: /Multi-voice/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(calls.find((call) => call.method === 'POST')?.body).toBe(
      '{"components":["narrator","characters","speakers"]}',
    );
    expect(within(chooser).getByRole('radio', { name: /Multi-voice/ })).toBeChecked();
  });

  it('offers immersive once everything is available, and returns to standard after an error', async () => {
    let attempts = 0;
    const { calls } = mockApi({
      'GET /api/voices': [],
      'GET /api/documents/': {
        ...report(['narrator', 'characters', 'speakers', 'effects', 'music'], true),
        narrator: { preferred: 'kokoro:af_heart', chosen: null },
      },
      'DELETE /api/documents/': () =>
        attempts++ === 0 ? failure('busy') : new Response(null, { status: 204 }),
    });
    const { user, onChanged } = renderChooser();
    const chooser = await region();
    expect(within(chooser).getByRole('radio', { name: /Immersive/ })).toBeChecked();
    expect(within(chooser).getAllByText(/not installed here/)).toHaveLength(2); // narrator and Rabbit
    expect(
      within(chooser).queryByRole('button', { name: 'Use this voice' }),
    ).not.toBeInTheDocument();
    expect(within(chooser).getByText(/· kokoro:alpha$/)).toBeInTheDocument(); // no name for it here
    await user.click(within(chooser).getByRole('radio', { name: /Standard/ }));
    expect(await within(chooser).findByText('Try again.')).toBeVisible();
    expect(onChanged).not.toHaveBeenCalled();
    await user.click(within(chooser).getByRole('radio', { name: /Standard/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(2);
  });
});
