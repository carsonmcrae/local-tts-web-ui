// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for bookmarks and notes.
 * Scope: Bookmarked sentences marked in the text; the Bookmarks tab (jump, write and change notes,
 *   remove, export as Markdown, empty and error states); bookmarking the sentence being read from
 *   the player and with the B key, and failures; the Markdown notes format.
 * Does NOT belong: Contents navigation and read-along (reader tests) or the player's transport.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bookmark } from '@/api/types';
import { PlayerBar } from '@/features/player/PlayerBar';
import type { usePlayer } from '@/features/player/PlayerProvider';
import ReaderPage from '@/features/reader/ReaderPage';
import { documentDetail, json, mockReaderApi, PlayerSpy, renderWithApp } from '@/test/render';
import { notesFilename, notesMarkdown } from './notes';

afterEach(() => vi.unstubAllGlobals());

const doc = documentDetail();
const base = `/api/documents/${doc.id}/bookmarks`;

const mark = (segmentIndex: number, note = ''): Bookmark => ({
  id: String(segmentIndex).repeat(32),
  segmentIndex,
  sectionIndex: segmentIndex < 2 ? 0 : 1,
  text: `Sentence ${segmentIndex + 1}.`,
  note,
  createdAt: '2026-10-20T10:00:00+00:00',
});

/** The reader API with bookmarks kept in memory, so adds, edits and removals show up. */
function bookmarkApi(initial: Bookmark[], overrides: Record<string, unknown> = {}) {
  const state = { list: [...initial] };
  const idOf = (url: URL) => url.pathname.split('/').pop();
  const api = mockReaderApi(doc, {
    [`GET ${base}`]: () => state.list,
    [`POST ${base}`]: (_url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { segmentIndex: number };
      const added = mark(body.segmentIndex);
      state.list = [...state.list, added].sort((a, b) => a.segmentIndex - b.segmentIndex);
      return json(added, 201);
    },
    [`PATCH ${base}/`]: (url: URL, init: RequestInit) => {
      const { note } = JSON.parse(String(init.body)) as { note: string };
      state.list = state.list.map((b) => (b.id === idOf(url) ? { ...b, note } : b));
      return state.list.find((b) => b.id === idOf(url));
    },
    [`DELETE ${base}/`]: (url: URL) => {
      state.list = state.list.filter((b) => b.id !== idOf(url));
      return new Response(null, { status: 204 });
    },
    ...overrides,
  });
  return { ...api, state };
}

type Player = ReturnType<typeof usePlayer>;

async function openReader(withPlayer = false) {
  const user = userEvent.setup();
  const latest: { player: Player | null } = { player: null };
  renderWithApp(
    <>
      <ReaderPage />
      {withPlayer ? <PlayerBar /> : null}
      <PlayerSpy onPlayer={(player) => (latest.player = player)} />
    </>,
    { path: '/read/:documentId', route: `/read/${doc.id}` },
  );
  await screen.findByRole('heading', { level: 1, name: doc.title });
  const sidebar = screen.getByRole('complementary', { name: 'Document contents' });
  return { user, sidebar, state: () => (latest.player as Player).state };
}

describe('Bookmarks in the reader', () => {
  it('marks bookmarked sentences, jumps to one, keeps notes, removes and exports them', async () => {
    const { calls } = bookmarkApi([mark(1), mark(3, 'Remember this')]);
    const { user, sidebar, state } = await openReader();
    const marked = await screen.findByRole('button', { description: 'Bookmarked' });
    expect(marked).toHaveAccessibleName('Sentence 2.');
    expect(marked).toHaveAttribute('data-bookmarked', 'true');
    await user.click(within(sidebar).getByRole('tab', { name: 'Bookmarks' }));
    expect(within(sidebar).getByText('2 bookmarks')).toBeInTheDocument();
    expect(within(sidebar).getByText('Remember this')).toBeInTheDocument();

    await user.click(within(sidebar).getByRole('button', { name: /Sentence 4\./ }));
    expect(await screen.findByText('Section 2 of 2 · Chapter Two')).toBeInTheDocument();
    await waitFor(() => expect(state().segmentIndex).toBe(3));

    await user.click(within(sidebar).getByRole('button', { name: 'Edit note' }));
    let dialog = await screen.findByRole('dialog', { name: 'Note' });
    await user.clear(within(dialog).getByLabelText('Your note'));
    await user.type(within(dialog).getByLabelText('Your note'), 'Check the spelling');
    await user.click(within(dialog).getByRole('button', { name: 'Save note' }));
    expect(await within(sidebar).findByText('Check the spelling')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toBe('{"note":"Check the spelling"}');
    await user.click(within(sidebar).getByRole('button', { name: 'Add a note' }));
    dialog = await screen.findByRole('dialog', { name: 'Note' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(within(sidebar).getByRole('button', { name: 'Add a note' }));
    await screen.findByRole('dialog', { name: 'Note' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const saved: Blob[] = [];
    vi.mocked(URL.createObjectURL).mockImplementationOnce((blob) => {
      saved.push(blob as Blob);
      return 'blob:notes';
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await user.click(within(sidebar).getByRole('button', { name: 'Export notes' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(await saved[0]?.text()).toContain('> Sentence 4.\n\nCheck the spelling');

    const [first] = within(sidebar).getAllByRole('button', { name: 'Remove bookmark' });
    await user.click(first as HTMLElement);
    expect(await within(sidebar).findByText('1 bookmark')).toBeInTheDocument();
  });

  it('explains an empty list and requests that fail', async () => {
    bookmarkApi([], {
      [`PATCH ${base}/`]: json({ error: { code: 'x', message: 'Note not saved.' } }, 500),
      [`DELETE ${base}/`]: json({ error: { code: 'x', message: 'Could not remove.' } }, 500),
    });
    const { user, sidebar } = await openReader();
    await user.click(within(sidebar).getByRole('tab', { name: 'Bookmarks' }));
    expect(within(sidebar).getByText(/No bookmarks yet/)).toBeInTheDocument();
    vi.unstubAllGlobals();

    bookmarkApi([mark(1, 'Old')], {
      [`PATCH ${base}/`]: () => json({ error: { code: 'x', message: 'Note not saved.' } }, 500),
      [`DELETE ${base}/`]: () => json({ error: { code: 'x', message: 'Could not remove.' } }, 500),
    });
    const second = await openReaderAgain();
    await second.user.click(within(second.sidebar).getByRole('tab', { name: 'Bookmarks' }));
    await second.user.click(
      within(second.sidebar).getByRole('button', { name: 'Remove bookmark' }),
    );
    expect(await within(second.sidebar).findByText('Could not remove.')).toBeInTheDocument();
    await second.user.click(within(second.sidebar).getByRole('button', { name: 'Edit note' }));
    const dialog = await screen.findByRole('dialog', { name: 'Note' });
    await second.user.click(within(dialog).getByRole('button', { name: 'Save note' }));
    expect(await within(dialog).findByText('Note not saved.')).toBeInTheDocument();
  });

  it('shows why the bookmarks could not be loaded', async () => {
    bookmarkApi([], {
      [`GET ${base}`]: () => json({ error: { code: 'x', message: 'Bookmarks unavailable.' } }, 500),
    });
    const { user, sidebar } = await openReader();
    await user.click(within(sidebar).getByRole('tab', { name: 'Bookmarks' }));
    expect(await within(sidebar).findByText('Bookmarks unavailable.')).toBeInTheDocument();
  });
});

/** A second reader in the same test, after the first one's view was replaced. */
async function openReaderAgain() {
  document.body.innerHTML = '';
  return openReader();
}

/** Opens the reader with the player bar and presses the player's bookmark button. */
async function bookmarkFromPlayer() {
  const { user } = await openReader(true);
  const player = screen.getByRole('region', { name: 'Audio player' });
  const [add] = await within(player).findAllByRole('button', { name: 'Bookmark this sentence' });
  await user.click(add as HTMLElement);
  return { user, player };
}

describe('Bookmarking from the player', () => {
  it('bookmarks the sentence being read with the button or B, and removes it again', async () => {
    const { calls } = bookmarkApi([]);
    const { user, player } = await bookmarkFromPlayer();
    expect(await screen.findByText('Bookmarked this sentence')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toBe('{"segmentIndex":0}');
    const [remove] = await within(player).findAllByRole('button', { name: 'Remove the bookmark' });
    await user.click(remove as HTMLElement);
    expect(await screen.findByText('Bookmark removed')).toBeInTheDocument();
    await within(player).findAllByRole('button', { name: 'Bookmark this sentence' });
    (document.activeElement as HTMLElement).blur(); // shortcuts are ignored on buttons
    await user.keyboard('b');
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2));
  });

  it('says when a bookmark could not be saved', async () => {
    bookmarkApi([], {
      [`POST ${base}`]: () =>
        json({ error: { code: 'bookmark_limit', message: 'Too many.' } }, 409),
    });
    await bookmarkFromPlayer();
    expect(await screen.findByText('Bookmark not saved')).toBeInTheDocument();
    expect(screen.getByText('Too many.')).toBeInTheDocument();
  });
});

describe('Notes as Markdown', () => {
  it('groups notes by section and names the file after the document', () => {
    const text = notesMarkdown(
      'Wardens',
      [{ index: 0, title: 'Opening' }],
      [mark(0, 'First note'), mark(1), { ...mark(2), sectionIndex: 4 }],
    );
    expect(text).toBe(
      [
        '# Wardens',
        '',
        'Bookmarks and notes (3)',
        '',
        '## Opening',
        '',
        '> Sentence 1.',
        '',
        'First note',
        '',
        '> Sentence 2.',
        '',
        '## Section 5',
        '',
        '> Sentence 3.',
        '',
      ].join('\n'),
    );
    expect(notesFilename('Wardens: of/Time?')).toBe('Wardens ofTime - notes.md');
    expect(notesFilename('???')).toBe('Document - notes.md');
  });
});
