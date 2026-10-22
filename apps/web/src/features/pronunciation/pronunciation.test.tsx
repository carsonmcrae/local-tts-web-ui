// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for Settings → Pronunciation.
 * Scope: Adding a word (and its exact-case option), hearing the word as written and the respelling
 *   in the reading voice before and after saving, changing and cancelling a change, each rule's
 *   scope (naming a document whose title is unknown as best it can), moving one document's rule to
 *   all documents, removing, the empty state, and errors from saving, loading and previews; picking
 *   the word out of a selection.
 * Does NOT belong: Applying the rules to speech (server tests) or the reader's dialog
 *   (fixPronunciation.test.tsx).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pronunciation } from '@/api/types';
import { json, kokoro, mockApi, preferences, renderWithApp, voice } from '@/test/render';
import { WARDENS, dictionaryRoutes, rule, sent } from './dictionaryTestApi';
import { PronunciationSection } from './PronunciationSection';
import { selectedWord } from './pronunciationRules';

afterEach(() => vi.unstubAllGlobals());

function pronunciationApi(initial: Pronunciation[], overrides: Record<string, unknown> = {}) {
  const state = { rules: [...initial] };
  return mockApi({
    'GET /api/engines': [kokoro()],
    'GET /api/preferences': preferences,
    'GET /api/voices': [voice()],
    ...dictionaryRoutes(state),
    ...overrides,
  });
}

const section = () => screen.findByRole('region', { name: 'Pronunciation' });
const previews = (calls: Parameters<typeof sent>[0]) =>
  sent(calls, 'POST', '/api/pronunciation-preview');

describe('Pronunciation dictionary', () => {
  it('adds a word, hears it both ways, changes it and removes it', async () => {
    const { calls } = pronunciationApi([]);
    const user = userEvent.setup();
    renderWithApp(<PronunciationSection />);
    const area = await section();
    expect(await within(area).findByText(/No words yet/)).toBeVisible();
    const add = within(area).getByRole('button', { name: 'Add word' });
    expect(add).toBeDisabled();
    expect(within(area).getByRole('button', { name: 'Hear respelling' })).toBeDisabled();
    await user.type(within(area).getByLabelText('Word or name'), 'gnocchi');
    await user.type(within(area).getByLabelText('Say it as'), 'NYOH-kee');
    expect(within(area).getByLabelText('Say it as')).toHaveAccessibleDescription(
      /Write it as it sounds: gnocchi → NYOH-kee, quinoa → KEEN-wah, Nguyen → Win/,
    );
    await user.click(within(area).getByLabelText(/Only when the letter case matches/));
    await user.click(within(area).getByRole('button', { name: 'Hear as written' }));
    await user.click(within(area).getByRole('button', { name: 'Hear respelling' }));
    await waitFor(() => expect(previews(calls)).toHaveLength(2));
    expect(previews(calls)).toEqual([
      { voiceId: 'kokoro:af_heart', text: 'gnocchi', respelling: false, pace: 1 },
      { voiceId: 'kokoro:af_heart', text: 'NYOH-kee', respelling: true, pace: 1 },
    ]);
    expect(await within(area).findByText('Playing the respelling.')).toBeInTheDocument();
    // Listening again replays the clip instead of asking for it again.
    await user.click(within(area).getByRole('button', { name: 'Hear respelling' }));
    await user.click(within(area).getByRole('button', { name: 'Hear respelling' }));
    expect(previews(calls)).toHaveLength(2);

    await user.click(add);
    const list = await within(area).findByRole('list', { name: 'Pronunciations' });
    expect(within(list).getByText('gnocchi')).toBeVisible();
    expect(within(list).getByText('Exact case')).toBeVisible();
    expect(within(list).getByText('All documents')).toBeVisible();
    expect(sent(calls, 'POST', '/api/pronunciations')).toEqual([
      { word: 'gnocchi', sayAs: 'NYOH-kee', matchCase: true, documentId: null },
    ]);
    expect(within(area).getByLabelText('Word or name')).toHaveValue(''); // ready for the next word

    await user.click(within(list).getByRole('button', { name: 'Change gnocchi' }));
    expect(within(area).getByLabelText('Say it as')).toHaveValue('NYOH-kee');
    expect(within(area).queryByLabelText('Use it in')).not.toBeInTheDocument(); // already everywhere
    await user.click(within(area).getByRole('button', { name: 'Cancel' }));
    expect(within(area).getByLabelText('Say it as')).toHaveValue('');
    await user.click(within(list).getByRole('button', { name: 'Change gnocchi' }));
    await user.clear(within(area).getByLabelText('Say it as'));
    await user.type(within(area).getByLabelText('Say it as'), 'NYOK-kee');
    await user.click(within(area).getByRole('button', { name: 'Save changes' }));
    expect(await within(list).findByText('NYOK-kee')).toBeVisible();

    await user.click(within(list).getByRole('button', { name: 'Remove gnocchi' }));
    expect(await within(area).findByText(/No words yet/)).toBeVisible();
  });

  it("shows each rule's scope and moves one document's rule to all documents", async () => {
    const { calls } = pronunciationApi([
      rule('Nguyen', 'Win', { documentId: WARDENS }),
      rule('quinoa', 'KEEN-wah'),
    ]);
    const user = userEvent.setup();
    renderWithApp(<PronunciationSection />);
    const list = await within(await section()).findByRole('list', { name: 'Pronunciations' });
    const [nguyen, quinoa] = within(list).getAllByRole('listitem');
    expect(nguyen).toHaveTextContent('Only in “Wardens”');
    expect(quinoa).toHaveTextContent('All documents');

    await user.click(within(list).getByRole('button', { name: 'Hear Nguyen' }));
    await waitFor(() =>
      expect(previews(calls)).toEqual([
        { voiceId: 'kokoro:af_heart', text: 'Win', respelling: true, pace: 1 },
      ]),
    );
    await user.click(within(list).getByRole('button', { name: 'Change Nguyen' }));
    const scope = screen.getByLabelText('Use it in');
    expect(scope).toHaveValue(WARDENS);
    await user.selectOptions(scope, 'All documents');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(nguyen).toHaveTextContent('All documents'));
    expect(sent(calls, 'PUT', '/api/pronunciations/').at(-1)).toEqual({
      word: 'Nguyen',
      sayAs: 'Win',
      matchCase: false,
      documentId: null,
    });
  });

  it('names the document of a rule as best it can when its title is unknown', async () => {
    pronunciationApi([{ ...rule('Nguyen', 'Win', { documentId: WARDENS }), documentTitle: null }]);
    const user = userEvent.setup();
    renderWithApp(<PronunciationSection />);
    const list = await within(await section()).findByRole('list', { name: 'Pronunciations' });
    expect(within(list).getByRole('listitem')).toHaveTextContent('Only in “one document”');
    await user.click(within(list).getByRole('button', { name: 'Change Nguyen' }));
    const scope = screen.getByLabelText('Use it in');
    expect(within(scope).getByRole('option', { name: 'Only “This document”' })).toBeInTheDocument();
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
      'POST /api/pronunciation-preview': () =>
        json({ error: { code: 'rate_limited', message: 'Wait a moment.' } }, 429),
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
    expect(await within(area).findByText('Wait a moment.')).toBeVisible();
  });

  it('says when the dictionary cannot be loaded', async () => {
    pronunciationApi([], {
      'GET /api/pronunciations': () =>
        json({ error: { code: 'x', message: 'Dictionary unavailable.' } }, 500),
    });
    renderWithApp(<PronunciationSection />);
    expect(await within(await section()).findByText('Dictionary unavailable.')).toBeVisible();
  });

  it('picks the word out of a selection', () => {
    expect(selectedWord(' gnocchi, ')).toBe('gnocchi');
    expect(selectedWord('“Nguyen.”')).toBe('Nguyen');
    expect(selectedWord('Dr. Nguyen')).toBe('Dr. Nguyen');
    expect(selectedWord('Dr.')).toBe('Dr.'); // an abbreviation keeps its full stop
    expect(selectedWord('quinoa…')).toBe('quinoa');
    expect(selectedWord(' — ')).toBeNull();
    expect(selectedWord('one two three four five six seven')).toBeNull();
    expect(selectedWord('x'.repeat(101))).toBeNull();
  });
});
