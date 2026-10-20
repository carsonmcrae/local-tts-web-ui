// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Tests for searching inside a document.
 * Scope: Results follow the typing, show their section with the found words marked and a count,
 *   and jump to the sentence; no matches; a failed search; marking with a blank query.
 * Does NOT belong: The server's matching (server tests) or other reader navigation (reader.test.tsx).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchResults } from '@/api/types';
import type { usePlayer } from '@/features/player/PlayerProvider';
import { documentDetail, json, mockReaderApi, PlayerSpy, renderWithApp } from '@/test/render';
import ReaderPage from './ReaderPage';
import { markMatches } from './SearchDialog';

afterEach(() => vi.unstubAllGlobals());

const doc = documentDetail();
const hit = (segmentIndex: number, text: string) => ({
  segmentIndex,
  sectionIndex: segmentIndex < 2 ? 0 : 1,
  text,
});

function results(query: string): SearchResults {
  if (query === 'dragon') return { query, total: 0, hits: [] };
  if (query === 'one') return { query, total: 1, hits: [hit(0, 'Chapter One')] };
  return { query, total: 5, hits: [hit(1, 'Sentence 2.'), hit(3, 'Sentence 4 and SENTENCE 4.')] };
}

async function openSearch(overrides: Record<string, unknown> = {}) {
  const { calls } = mockReaderApi(doc, {
    [`GET /api/documents/${doc.id}/search`]: (url: URL) => results(url.searchParams.get('q') ?? ''),
    ...overrides,
  });
  const user = userEvent.setup();
  const latest: { player: ReturnType<typeof usePlayer> | null } = { player: null };
  renderWithApp(
    <>
      <ReaderPage />
      <PlayerSpy onPlayer={(player) => (latest.player = player)} />
    </>,
    { path: '/read/:documentId', route: `/read/${doc.id}` },
  );
  await user.click(await screen.findByRole('button', { name: 'Search this document' }));
  const dialog = await screen.findByRole('dialog', { name: 'Search this document' });
  return { user, dialog, calls, state: () => latest.player?.state };
}

describe('Searching a document', () => {
  it('finds sentences as you type, marks the words and jumps to a match', async () => {
    const { user, dialog, state } = await openSearch();
    await user.type(within(dialog).getByLabelText('Search for'), 'sentence  4');
    expect(
      await within(dialog).findByText('5 matching sentences, showing the first 2'),
    ).toBeVisible();
    const marks = within(dialog).getAllByText(/sentence 4/i, { selector: 'mark' });
    expect(marks.map((mark) => mark.textContent)).toEqual(['Sentence 4', 'SENTENCE 4']);
    await user.click(within(dialog).getByRole('button', { name: /Chapter Two/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Section 2 of 2 · Chapter Two')).toBeVisible();
    await waitFor(() => expect(state()?.segmentIndex).toBe(3));
  });

  it('says when nothing or one sentence matches', async () => {
    const { user, dialog } = await openSearch();
    const input = within(dialog).getByLabelText('Search for');
    await user.type(input, 'dragon');
    expect(await within(dialog).findByText('No sentences match.')).toBeVisible();
    await user.clear(input);
    await user.type(input, 'one');
    expect(await within(dialog).findByText('1 matching sentence')).toBeVisible();
  });

  it('explains a search that fails', async () => {
    const { user, dialog } = await openSearch({
      [`GET /api/documents/${doc.id}/search`]: () =>
        json({ error: { code: 'x', message: 'Search is unavailable.' } }, 500),
    });
    await user.type(within(dialog).getByLabelText('Search for'), 'keeper');
    expect(await within(dialog).findByText('Search is unavailable.')).toBeVisible();
  });

  it('marks nothing for a blank query', () => {
    expect(markMatches('Plain text.', '   ')).toEqual(['Plain text.']);
  });
});
