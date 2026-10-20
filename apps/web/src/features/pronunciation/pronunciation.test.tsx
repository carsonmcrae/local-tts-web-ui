// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for Settings → Pronunciation.
 * Scope: Adding a word (and its exact-case option), hearing it before and after saving in the
 *   reading voice, changing and cancelling a change, removing, the empty state, and errors from
 *   saving, loading and previews.
 * Does NOT belong: Applying the rules to speech (server tests).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pronunciation } from '@/api/types';
import { json, kokoro, mockApi, preferences, renderWithApp, voice } from '@/test/render';
import { PronunciationSection } from './PronunciationSection';

afterEach(() => vi.unstubAllGlobals());

const rule = (word: string, sayAs: string, matchCase = false): Pronunciation => ({
  id: String(word.length).repeat(32).slice(0, 32),
  word,
  sayAs,
  matchCase,
  createdAt: '2026-10-20T10:00:00+00:00',
});

function pronunciationApi(initial: Pronunciation[], overrides: Record<string, unknown> = {}) {
  const state = { rules: [...initial] };
  const api = mockApi({
    'GET /api/engines': [kokoro()],
    'GET /api/preferences': preferences,
    'GET /api/voices': [voice()],
    'GET /api/pronunciations': () => state.rules,
    'POST /api/pronunciations': (_url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Pronunciation;
      const added = rule(body.word, body.sayAs, body.matchCase);
      state.rules = [...state.rules, added];
      return json(added, 201);
    },
    'PUT /api/pronunciations/': (url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Pronunciation;
      const id = url.pathname.split('/').pop() ?? '';
      state.rules = state.rules.map((r) => (r.id === id ? { ...r, ...body } : r));
      return state.rules.find((r) => r.id === id);
    },
    'DELETE /api/pronunciations/': (url: URL) => {
      state.rules = state.rules.filter((r) => r.id !== url.pathname.split('/').pop());
      return new Response(null, { status: 204 });
    },
    'POST /api/voices/': () =>
      new Response(new Blob(['wav']), { headers: { 'X-Audio-Duration': '1' } }),
    ...overrides,
  });
  return api;
}

const section = () => screen.findByRole('region', { name: 'Pronunciation' });

describe('Pronunciation dictionary', () => {
  it('adds a word, hears it, changes it and removes it', async () => {
    const { calls } = pronunciationApi([]);
    const user = userEvent.setup();
    renderWithApp(<PronunciationSection />);
    const area = await section();
    expect(await within(area).findByText(/No words yet/)).toBeVisible();
    const add = within(area).getByRole('button', { name: 'Add word' });
    expect(add).toBeDisabled();
    await user.type(within(area).getByLabelText('Word or name'), 'Kael');
    await user.type(within(area).getByLabelText('Say it as'), 'Kale');
    await user.click(within(area).getByLabelText(/Only when the letter case matches/));
    await user.click(within(area).getByRole('button', { name: 'Hear it' }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/voices/kokoro:af_heart/preview')).toBe(true),
    );
    expect(JSON.parse(String(calls.at(-1)?.body))).toMatchObject({ text: 'Kale' });
    await user.click(add);
    const list = await within(area).findByRole('list', { name: 'Pronunciations' });
    expect(within(list).getByText('Kael')).toBeVisible();
    expect(within(list).getByText('Exact case')).toBeVisible();
    expect(
      JSON.parse(
        String(calls.find((c) => c.method === 'POST' && c.path === '/api/pronunciations')?.body),
      ),
    ).toEqual({ word: 'Kael', sayAs: 'Kale', matchCase: true });
    expect(within(area).getByLabelText('Word or name')).toHaveValue(''); // ready for the next word

    await user.click(within(list).getByRole('button', { name: 'Hear Kael' }));
    await user.click(within(list).getByRole('button', { name: 'Change Kael' }));
    expect(within(area).getByLabelText('Say it as')).toHaveValue('Kale');
    await user.click(within(area).getByRole('button', { name: 'Cancel' }));
    expect(within(area).getByLabelText('Say it as')).toHaveValue('');
    await user.click(within(list).getByRole('button', { name: 'Change Kael' }));
    await user.clear(within(area).getByLabelText('Say it as'));
    await user.type(within(area).getByLabelText('Say it as'), 'Kayl');
    await user.click(within(area).getByRole('button', { name: 'Save changes' }));
    expect(await within(list).findByText('Kayl')).toBeVisible();

    await user.click(within(list).getByRole('button', { name: 'Remove Kael' }));
    expect(await within(area).findByText(/No words yet/)).toBeVisible();
  });

  it('explains words that cannot be saved, a list that cannot load and a preview that fails', async () => {
    pronunciationApi([rule('Dr.', 'Doctor')], {
      'POST /api/pronunciations': () =>
        json(
          {
            error: { code: 'pronunciation_exists', message: '“Dr.” is already in the dictionary.' },
          },
          409,
        ),
      'POST /api/voices/': () =>
        json({ error: { code: 'engine_not_installed', message: 'No engine.' } }, 409),
    });
    const user = userEvent.setup();
    renderWithApp(<PronunciationSection />);
    const area = await section();
    await within(area).findByRole('list', { name: 'Pronunciations' });
    await user.type(within(area).getByLabelText('Word or name'), 'dr.');
    await user.type(within(area).getByLabelText('Say it as'), 'Drive');
    await user.click(within(area).getByRole('button', { name: 'Add word' }));
    expect(await within(area).findByText('“Dr.” is already in the dictionary.')).toBeVisible();
    await user.click(within(area).getByRole('button', { name: 'Hear Dr.' }));
    expect(await within(area).findByText('No engine.')).toBeVisible();
  });

  it('says when the dictionary cannot be loaded', async () => {
    pronunciationApi([], {
      'GET /api/pronunciations': () =>
        json({ error: { code: 'x', message: 'Dictionary unavailable.' } }, 500),
    });
    renderWithApp(<PronunciationSection />);
    expect(await within(await section()).findByText('Dictionary unavailable.')).toBeVisible();
  });
});
