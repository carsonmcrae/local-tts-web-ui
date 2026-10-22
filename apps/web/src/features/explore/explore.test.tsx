// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for Explore: the books that come with the app.
 * Scope: Grouping with featured experiences first, searching, the hidden-books switch, each card's
 *   facts, content notes, rights notes and plain covers, reading a book (opened once, then
 *   continued), hiding and showing again, an opening failure, the credits dialog, loading and error
 *   states, and the tabs between the library and Explore.
 * Does NOT belong: The server's catalog (apps/server tests) or the library list.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BundledWork } from '@/api/types';
import { documentDetail, json, mockApi, renderWithApp } from '@/test/render';
import { LibraryTabs } from '@/features/library/LibraryTabs';
import ExplorePage, { groupWorks, matchesWork } from './ExplorePage';

afterEach(() => vi.unstubAllGlobals());

const work = (overrides: Partial<BundledWork>): BundledWork => ({
  workId: 'the-time-machine',
  title: 'The Time Machine',
  sortTitle: 'Time Machine, The',
  authors: ['H. G. Wells'],
  firstPublished: 1895,
  documentType: 'novella',
  genres: ['science-fiction'],
  description: 'A traveller goes forward in time.',
  contentNotes: [],
  wordCount: 32_000,
  chapterCount: 13,
  estimatedSeconds: 12_000,
  hasCover: true,
  coverNote: null,
  editionSource: 'Standard Ebooks',
  editionSourceUrl: 'https://standardebooks.org/ebooks/h-g-wells/the-time-machine',
  rightsScope:
    'Public domain in the United States, and wherever copyright ends 70 years or less after death.',
  rightsCaveat: null,
  featured: null,
  documentId: null,
  hidden: false,
  ...overrides,
});

const alice = work({
  workId: 'alices-adventures-in-wonderland',
  title: 'Alice’s Adventures in Wonderland',
  sortTitle: 'Alice',
  authors: ['Lewis Carroll'],
  documentType: 'novel',
  genres: ['fantasy', 'childrens'],
  featured: { presetId: 'alice', blurb: 'Alice and the Rabbit in their own voices.' },
});
const poems = work({
  workId: 'poe-selected-poems',
  title: 'The Raven and Other Poems',
  sortTitle: 'Raven',
  authors: ['Edgar Allan Poe'],
  documentType: 'poetry-collection',
  genres: ['poetry'],
  hasCover: false,
  coverNote: 'No cover ships.',
  contentNotes: ['Tales of terror.'],
  rightsScope: 'Public domain in the United States.',
  rightsCaveat: 'Rights elsewhere depend on the editor, whose dates are not recorded.',
  documentId: 'd'.repeat(32),
});
const hiddenWork = work({
  workId: 'up-from-slavery',
  title: 'Up from Slavery',
  sortTitle: 'Up',
  hidden: true,
  description: null,
});
const works = [work({}), alice, poems, hiddenWork];

function renderExplore(routes: Record<string, unknown> = {}) {
  const api = mockApi({ 'GET /api/library/works': works, ...routes });
  const view = renderWithApp(<ExplorePage />, { path: '/explore', route: '/explore' });
  return { user: userEvent.setup(), ...api, ...view };
}

/** The card of the work with that title. */
const cardOf = (title: string) =>
  screen.getByText(title, { selector: 'h3' }).closest('li') as HTMLElement;

describe('Explore', () => {
  it('groups the books with featured experiences first and describes each', async () => {
    renderExplore();
    const headings = (await screen.findAllByRole('heading', { level: 2 })).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(['Featured experiences', 'Novels and novellas', 'Poetry']);
    const featured = screen.getByRole('region', { name: 'Featured experiences' });
    expect(
      within(featured).getByText('Alice and the Rabbit in their own voices.'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { level: 3, name: 'Alice’s Adventures in Wonderland' }),
    ).toHaveLength(2);
    expect(
      screen.getByText(/Novella · Science fiction · 13 chapters · ~3 h 20 min listen/),
    ).toBeInTheDocument();
    expect(screen.getByText('Tales of terror.')).toBeInTheDocument();
    expect(screen.getByText(/whose dates are not recorded/)).toBeInTheDocument();
    expect(screen.getAllByText(/Public domain in the United States/)).toHaveLength(4); // every card says where (Alice is shown twice)
    expect(screen.getByText('In your library')).toBeInTheDocument();
    expect(screen.queryByText('Up from Slavery')).not.toBeInTheDocument(); // hidden
    const covers = screen
      .getAllByRole('presentation', { hidden: true })
      .filter((el) => el.tagName === 'IMG');
    expect(covers).toHaveLength(3); // Time Machine, Alice twice; the poems draw a plain cover
    expect(groupWorks([])).toEqual([]);
    expect(matchesWork(alice, 'carroll')).toBe(true);
    expect(matchesWork(alice, 'dickens')).toBe(false);
    expect(matchesWork(hiddenWork, 'slavery')).toBe(true);
  });

  it('searches, and shows hidden books on request so they can be shown again', async () => {
    const { user, calls } = renderExplore({
      'PUT /api/library/works/': () => ({ ...hiddenWork, hidden: false }),
    });
    await screen.findByRole('heading', { level: 2, name: 'Poetry' });
    const search = screen.getByRole('searchbox', { name: 'Search the included books' });
    await user.type(search, 'raven');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Poetry',
    ]);
    await user.clear(search);
    await user.type(search, 'nothing here');
    expect(screen.getByText('No included book matches “nothing here”.')).toBeInTheDocument();
    await user.clear(search);
    await user.click(screen.getByRole('switch', { name: 'Show hidden books' }));
    const card = screen
      .getByText('Up from Slavery', { selector: 'h3' })
      .closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Show again' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toBe('{"hidden":false}'),
    );
    expect(calls.find((c) => c.method === 'PUT')?.path).toBe(
      '/api/library/works/up-from-slavery/hidden',
    );
    await waitFor(() =>
      expect(within(card).getByRole('button', { name: 'Hide' })).toBeInTheDocument(),
    );
  });

  it('opens a book once, continues one already in the library, and hides one', async () => {
    const opened = documentDetail({ id: 'e'.repeat(32), title: 'The Time Machine' });
    const { user, calls, router } = renderExplore({
      'POST /api/library/works/': opened,
      'PUT /api/library/works/': () => ({ ...work({}), hidden: true }),
    });
    await screen.findByRole('heading', { level: 2, name: 'Poetry' });
    const poemsCard = cardOf('The Raven and Other Poems');
    await user.click(within(poemsCard).getByRole('button', { name: 'Continue' }));
    expect(router.state.location.pathname).toBe(`/read/${'d'.repeat(32)}`);
    const backToExplore = async () => {
      await router.navigate('/explore');
      await screen.findByRole('heading', { level: 2, name: 'Poetry' });
      return cardOf('The Time Machine');
    };
    await user.click(within(await backToExplore()).getByRole('button', { name: 'Read' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/read/${'e'.repeat(32)}`));
    expect(calls.find((c) => c.method === 'POST')?.path).toBe(
      '/api/library/works/the-time-machine/open',
    );
    await user.click(within(await backToExplore()).getByRole('button', { name: 'Hide' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'PUT').at(-1)?.body).toBe('{"hidden":true}'),
    );
  });

  it('explains when a book cannot be opened', async () => {
    const { user } = renderExplore({
      'POST /api/library/works/': () =>
        json({ error: { code: 'document_limit', message: 'Your library is full.' } }, 409),
    });
    await screen.findByRole('heading', { level: 2, name: 'Poetry' });
    const machine = cardOf('The Time Machine');
    await user.click(within(machine).getByRole('button', { name: 'Read' }));
    expect(await within(machine).findByRole('alert')).toHaveTextContent('Your library is full.');
  });

  it('shows the credits, and retries after a failure to load', async () => {
    let fail = true;
    const { user } = renderExplore({
      'GET /api/library/works': () =>
        fail ? json({ error: { code: 'x', message: 'The catalog is busy.' } }, 503) : works,
      'GET /api/library/works/credits': () =>
        new Response('# Credits for the bundled books\nEverything here is public domain.', {
          headers: { 'Content-Type': 'text/plain' },
        }),
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The catalog is busy.');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { level: 2, name: 'Poetry' });
    expect(screen.getByRole('link', { name: 'Explore included books' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'My library' })).not.toHaveAttribute('aria-current');
    await user.click(screen.getByRole('button', { name: 'Where these books come from' }));
    const dialog = await screen.findByRole('dialog', { name: 'Where these books come from' });
    expect(await within(dialog).findByText(/Everything here is public domain/)).toBeInTheDocument();
  });

  it('shows a failed credits request and the library tab', async () => {
    const { user } = renderExplore({
      'GET /api/library/works/credits': () => new Response('gone', { status: 500 }),
    });
    await screen.findByRole('heading', { level: 2, name: 'Poetry' });
    await user.click(screen.getByRole('button', { name: 'Where these books come from' }));
    const dialog = await screen.findByRole('dialog', { name: 'Where these books come from' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The credits could not be loaded.',
    );
    renderWithApp(<LibraryTabs current="library" />);
    expect(screen.getAllByRole('link', { name: 'My library' }).at(-1)).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
