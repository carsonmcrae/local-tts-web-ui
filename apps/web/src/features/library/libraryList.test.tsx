// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the library list: the toolbar, selection and bulk actions, and the cards.
 * Scope: Title and counts, searching and the filter selects, an empty search or filter and clearing
 *   it, an empty view, Select mode with checkboxes and the bulk bar (favourite all, open each dialog,
 *   done), cards with cover or icon, author and type, tags and their overflow, the favourite star,
 *   the card menu and dragging a card.
 * Does NOT belong: The dialogs themselves (organize.test.tsx) or the rail (libraryRail.test.tsx).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '@/api/types';
import { documentDetail, mockApi, renderWithApp } from '@/test/render';
import { describeDocument } from './DocumentCard';
import { LibraryList } from './LibraryList';
import { ALL, DOCUMENT_DRAG_TYPE } from './views';

afterEach(() => vi.unstubAllGlobals());

const summary = (
  title: string,
  overrides: Partial<DocumentSummary> = {},
  shelf: Partial<DocumentSummary['shelf']> = {},
): DocumentSummary => ({
  ...documentDetail({
    id: title.length.toString(16).padStart(32, '0'),
    title,
    createdAt: '2026-10-01T00:00:00+00:00',
    ...overrides,
  }),
  shelf: { ...documentDetail().shelf, ...shelf },
});

const books = [
  summary('Wardens of Time', { author: 'Mira Vale', filename: 'wardens.pdf' }, {
    favorite: true,
    documentType: 'novel',
    genres: ['fantasy'],
    tags: ['Evening', 'Long', 'Epic', 'Dragons'],
  }),
  summary('Atlas 10', { filename: null, progress: null }, { genres: ['science'] }),
  summary('Atlas 9', { filename: 'notes-on-maps.docx', hasCover: true, progress: { segmentIndex: 1, voiceId: null, updatedAt: '2026-10-02T00:00:00+00:00', percent: 100 } }, { tags: ['Maps'] }),
]; // prettier-ignore

function renderList(documents: DocumentSummary[] = books, total = documents.length) {
  const view = renderWithApp(
    <LibraryList documents={documents} view={ALL} folders={[]} collections={[]} total={total} />,
    { path: '/library', route: '/library' },
  );
  return { user: userEvent.setup(), ...view };
}

const titles = () =>
  within(screen.getByRole('list'))
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent);

describe('Library list', () => {
  it('searches and filters, and clears an empty result', async () => {
    mockApi({});
    const { user } = renderList();
    expect(screen.getByRole('heading', { level: 2, name: 'All documents' })).toBeInTheDocument();
    expect(screen.getByText('3 total · drag files anywhere to add')).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: 'Search your library' });
    await user.type(search, 'maps');
    expect(titles()).toEqual(['Atlas 9']);
    await user.clear(search);
    await user.type(search, 'dragons');
    expect(titles()).toEqual(['Wardens of Time']); // a tag
    await user.clear(search);
    await user.type(search, 'nothing');
    expect(screen.getByText('No documents match “nothing”.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(titles()).toHaveLength(3);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Genre' }), 'science');
    expect(titles()).toEqual(['Atlas 10']);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'novel');
    expect(screen.getByText('No documents match these filters.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Progress' }), 'finished');
    expect(titles()).toEqual(['Atlas 9']);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'title');
    expect(localStorage.getItem('ltts.librarySort')).toBe('title');
  });

  it('shows a view count against the total and an empty view', () => {
    mockApi({});
    renderList(books.slice(0, 1), 3);
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    renderList([], 3);
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
  });

  it('offers no search, filters or selection for a single document', () => {
    mockApi({});
    renderList(books.slice(0, 1));
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
  });

  it('describes each card: cover or icon, author, type, tags, progress', () => {
    mockApi({});
    renderList();
    const list = screen.getByRole('list');
    expect(within(list).getByText(/Mira Vale · Novel · PDF/)).toBeInTheDocument();
    expect(describeDocument(books[1] as DocumentSummary)).toMatch(/^PDF · /);
    const tags = within(list).getAllByLabelText('Tags')[0] as HTMLElement;
    expect(
      within(tags)
        .getAllByText(/./)
        .map((badge) => badge.textContent),
    ).toEqual(['Evening', 'Long', 'Epic', '+1']);
    expect(within(list).getAllByText('New')).toHaveLength(2); // no progress yet
    expect(within(list).getByText('100%')).toBeInTheDocument();
    const [cover] = within(list)
      .getAllByRole('presentation', { hidden: true })
      .filter((e) => e.tagName === 'IMG');
    expect(cover).toHaveAttribute('src', `/api/documents/${books[2]?.id}/cover`);
  });

  it('toggles a favourite from the star and drags a card', async () => {
    const { calls } = mockApi({
      'PUT /api/documents/': (url: URL) => ({
        ...books[1],
        shelf: { ...books[1]?.shelf, favorite: !url.pathname.includes('nothing') },
      }),
    });
    const { user } = renderList();
    await user.click(
      screen.getByRole('button', { name: 'Remove Wardens of Time from favourites' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add Atlas 10 to favourites' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2));
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([
      '{"favorite":false}',
      '{"favorite":true}',
    ]);
    const setData = vi.fn();
    const [card] = screen.getAllByRole('listitem');
    fireEvent.dragStart(card as HTMLElement, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith(DOCUMENT_DRAG_TYPE, books[0]?.id);
  });

  it('selects documents and acts on them together', async () => {
    const { calls } = mockApi({
      'POST /api/library/organize': () =>
        books.map((doc) => ({ ...doc, shelf: { ...doc.shelf, favorite: true } })),
    });
    const { user } = renderList();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    const toolbar = screen.getByRole('toolbar', { name: 'Selected documents' });
    expect(toolbar).toHaveTextContent('0 selected');
    expect(within(toolbar).getByRole('button', { name: 'Move to folder…' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Select Wardens of Time' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Atlas 10' }));
    expect(toolbar).toHaveTextContent('2 selected');
    await user.click(screen.getByRole('checkbox', { name: 'Select Atlas 10' }));
    expect(toolbar).toHaveTextContent('1 selected');
    expect(within(toolbar).getByRole('button', { name: 'Remove favourite' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select Atlas 10' }));
    await user.click(within(toolbar).getByRole('button', { name: 'Favourite' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === '/api/library/organize')?.body).toBe(
        `{"documentIds":["${books[0]?.id}","${books[1]?.id}"],"favorite":true}`,
      ),
    );
    await user.click(within(toolbar).getByRole('button', { name: 'Move to folder…' }));
    expect(
      await screen.findByRole('dialog', { name: 'Move these 2 documents' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(within(toolbar).getByRole('button', { name: 'Collections…' }));
    expect(
      await screen.findByRole('dialog', { name: 'Collections for these 2 documents' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(within(toolbar).getByRole('button', { name: 'Edit details…' }));
    expect(
      await screen.findByRole('dialog', { name: 'Details of 2 documents' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(toolbar).toHaveTextContent('2 selected'); // cancelling keeps the selection
    await user.click(within(toolbar).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select' })); // the button toggles too
    expect(screen.getByRole('toolbar', { name: 'Selected documents' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('deletes the selected documents together, which ends selecting', async () => {
    const { calls } = mockApi({ 'DELETE /api/documents/': new Response(null, { status: 204 }) });
    const { user } = renderList();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Wardens of Time' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Atlas 10' }));
    const toolbar = screen.getByRole('toolbar', { name: 'Selected documents' });
    await user.click(within(toolbar).getByRole('button', { name: 'Delete…' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete 2 documents?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(2);
  });

  it('opens a card’s menu actions', async () => {
    mockApi({ 'DELETE /api/documents/': new Response(null, { status: 204 }) });
    const { user } = renderList();
    await user.click(screen.getByRole('button', { name: 'Options for Atlas 10' }));
    await user.click(await screen.findByRole('button', { name: 'Move to folder…' }));
    const move = await screen.findByRole('dialog', { name: 'Move this document' });
    expect(within(move).getByRole('radio', { name: 'No folder' })).toBeChecked(); // it has none yet
    await user.click(within(move).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Options for Atlas 10' }));
    await user.click(await screen.findByRole('button', { name: 'Edit details…' }));
    expect(
      await screen.findByRole('dialog', { name: 'Details of “Atlas 10”' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Options for Atlas 10' }));
    await user.click(await screen.findByRole('button', { name: 'Delete…' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete this document?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
