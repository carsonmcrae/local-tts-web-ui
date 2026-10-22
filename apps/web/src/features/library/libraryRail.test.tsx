// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the library rail and its dialogs.
 * Scope: The fixed views with counts and the current one marked, collections and the folder tree
 *   (collapsing, subfolders), creating, renaming, moving and deleting folders and collections
 *   through their dialogs (and leaving a deleted view), dropping a dragged document on a folder or
 *   on All documents, the phone select, and the library page wiring views to the list.
 * Does NOT belong: Filtering within a view (libraryList.test.tsx) or document dialogs (organize.test.tsx).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Collection, DocumentSummary, Folder } from '@/api/types';
import { documentDetail, json, kokoro, mockApi, preferences, renderWithApp } from '@/test/render';
import LibraryPage from './LibraryPage';
import { LibraryRail, RailSelect } from './LibraryRail';
import type { LibraryView } from './views';
import { ALL, DOCUMENT_DRAG_TYPE } from './views';

afterEach(() => vi.unstubAllGlobals());

const F1 = '1'.repeat(32);
const F2 = '2'.repeat(32);
const C1 = 'c'.repeat(32);
const folder = (id: string, name: string, parentId: string | null = null, documentCount = 0): Folder => ({
  id, parentId, name, position: 1, documentCount, createdAt: '2026-10-01T00:00:00+00:00',
}); // prettier-ignore
const folders = [folder(F1, 'Fiction', null, 1), folder(F2, 'Fantasy', F1, 2)];
const collections: Collection[] = [
  { id: C1, name: 'Evening', description: '', position: 1, documentCount: 1, createdAt: '2026-10-01T00:00:00+00:00' },
]; // prettier-ignore
const docs: DocumentSummary[] = [
  documentDetail({
    id: 'a'.repeat(32),
    title: 'Favourite',
    shelf: {
      folderId: F1,
      favorite: true,
      documentType: null,
      genres: [],
      tags: [],
      collectionIds: [C1],
    },
    progress: {
      segmentIndex: 1,
      voiceId: null,
      updatedAt: '2026-10-02T00:00:00+00:00',
      percent: 20,
    },
  }),
  documentDetail({ id: 'b'.repeat(32), title: 'Plain', createdAt: '2000-01-01T00:00:00+00:00' }),
];

function renderRail(view: LibraryView = ALL, route = '/library') {
  const utils = renderWithApp(
    <LibraryRail view={view} documents={docs} folders={folders} collections={collections} />,
    { path: '/library', route },
  );
  return { user: userEvent.setup(), ...utils };
}

const link = (name: string | RegExp) => screen.getByRole('link', { name });

describe('Library rail', () => {
  it('lists the views with counts, marks the current one, and collapses folders', async () => {
    mockApi({});
    const { user, router } = renderRail({ kind: 'folder', id: F2 });
    expect(link(/All documents/)).toHaveTextContent('2');
    expect(link(/Continue reading/)).toHaveTextContent('1');
    expect(link(/Favourites/)).toHaveTextContent('1');
    expect(link(/Recently added/)).toHaveTextContent('1');
    expect(link(/Evening/)).toHaveTextContent('1');
    expect(link(/Fantasy/)).toHaveAttribute('aria-current', 'page');
    expect(link(/Fiction/)).not.toHaveAttribute('aria-current');
    await user.click(screen.getByRole('button', { name: 'Collapse Fiction' }));
    expect(screen.queryByRole('link', { name: /Fantasy/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand Fiction' }));
    expect(link(/Fantasy/)).toBeInTheDocument();
    await user.click(link(/Favourites/));
    expect(router.state.location.search).toBe('?view=favorites');
  });

  it('creates, renames, moves and deletes folders', async () => {
    const { calls } = mockApi({
      'POST /api/library/folders': folder('3'.repeat(32), 'New'),
      'PATCH /api/library/folders/': folder(F2, 'Renamed'),
      'DELETE /api/library/folders/': new Response(null, { status: 204 }),
    });
    const { user, router } = renderRail({ kind: 'folder', id: F2 }, `/library?folder=${F2}`);
    await user.click(screen.getByRole('button', { name: 'New folder' }));
    let dialog = await screen.findByRole('dialog', { name: 'New folder' });
    expect(within(dialog).getByRole('button', { name: 'Create folder' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Name'), '{Enter}'); // nothing to create yet
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await user.type(within(dialog).getByLabelText('Name'), 'Poetry{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'POST')?.body).toBe('{"name":"Poetry","parentId":null}');

    await user.click(screen.getByRole('button', { name: 'Options for Fiction' }));
    await user.click(await screen.findByRole('button', { name: 'New subfolder…' }));
    dialog = await screen.findByRole('dialog', { name: 'New folder' });
    expect(within(dialog).getByLabelText('Inside')).toHaveValue(F1);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    const renameFantasy = async () => {
      await user.click(screen.getByRole('button', { name: 'Options for Fantasy' }));
      await user.click(await screen.findByRole('button', { name: 'Rename or move…' }));
      return screen.findByRole('dialog', { name: 'Rename or move folder' });
    };
    dialog = await renameFantasy();
    const inside = within(dialog).getByLabelText('Inside');
    expect(
      within(inside)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Top level', 'Fiction']);
    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'Myth');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'PATCH')?.body).toBe('{"name":"Myth"}');

    dialog = await renameFantasy();
    await user.selectOptions(within(dialog).getByLabelText('Inside'), '');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toBe(
        '{"name":"Fantasy","parentId":null}',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Options for Fantasy' }));
    await user.click(await screen.findByRole('button', { name: 'Delete…' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete the folder “Fantasy”?' });
    expect(confirm).toHaveTextContent('Its 2 documents move to Fiction. No document is deleted.');
    await user.click(within(confirm).getByRole('button', { name: 'Delete folder' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(router.state.location.search).toBe('')); // the deleted view is left
  });

  it('explains deleting a folder with subfolders, and shows a failure', async () => {
    mockApi({
      'DELETE /api/library/folders/': () =>
        json({ error: { code: 'nope', message: 'Not now.' } }, 409),
      'POST /api/library/folders': () =>
        json({ error: { code: 'folder_limit', message: 'Too many.' } }, 409),
    });
    const { user } = renderRail();
    await user.click(screen.getByRole('button', { name: 'Options for Fiction' }));
    await user.click(await screen.findByRole('button', { name: 'Delete…' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete the folder “Fiction”?' });
    expect(confirm).toHaveTextContent('Its 1 document and 1 subfolder move to All documents.');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'New folder' }));
    const dialog = await screen.findByRole('dialog', { name: 'New folder' });
    await user.type(within(dialog).getByLabelText('Name'), 'Too many');
    await user.click(within(dialog).getByRole('button', { name: 'Create folder' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Too many.');
  });

  it('creates, edits and deletes collections', async () => {
    const { calls } = mockApi({
      'POST /api/library/collections': collections[0],
      'PATCH /api/library/collections/': collections[0],
      'DELETE /api/library/collections/': new Response(null, { status: 204 }),
    });
    const { user, router } = renderRail(
      { kind: 'collection', id: C1 },
      `/library?collection=${C1}`,
    );
    await user.click(screen.getByRole('button', { name: 'New collection' }));
    let dialog = await screen.findByRole('dialog', { name: 'New collection' });
    await user.type(within(dialog).getByLabelText('Description (optional)'), '{Enter}'); // no name yet
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await user.type(within(dialog).getByLabelText('Name'), 'Book club');
    await user.type(within(dialog).getByLabelText('Description (optional)'), 'Thursdays');
    await user.click(within(dialog).getByRole('button', { name: 'Create collection' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'POST')?.body).toBe(
      '{"name":"Book club","description":"Thursdays"}',
    );
    await user.click(screen.getByRole('button', { name: 'Options for Evening' }));
    await user.click(await screen.findByRole('button', { name: 'Edit…' }));
    dialog = await screen.findByRole('dialog', { name: 'Edit collection' });
    await user.type(within(dialog).getByLabelText('Name'), ' listening{Enter}');
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toBe(
        '{"name":"Evening listening","description":""}',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Options for Evening' }));
    await user.click(await screen.findByRole('button', { name: 'Delete…' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete the collection “Evening”?' });
    expect(confirm).toHaveTextContent('Its 1 document stay in your library.');
    await user.click(within(confirm).getByRole('button', { name: 'Delete collection' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('shows a failed collection create', async () => {
    mockApi({
      'POST /api/library/collections': () =>
        json({ error: { code: 'collection_limit', message: 'Too many.' } }, 409),
    });
    const { user } = renderRail();
    await user.click(screen.getByRole('button', { name: 'New collection' }));
    const dialog = await screen.findByRole('dialog', { name: 'New collection' });
    await user.type(within(dialog).getByLabelText('Name'), 'One more{Enter}');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Too many.');
  });

  it('moves a dropped document into a folder, or out of folders', async () => {
    const { calls } = mockApi({ 'POST /api/library/organize': docs });
    renderRail();
    const transfer = (data: string) => ({
      dataTransfer: { types: [DOCUMENT_DRAG_TYPE], getData: () => data },
    });
    // Documents are dropped on a view's link; its whole row shows that it will take them.
    const fantasy = link(/Fantasy/);
    const row = fantasy.parentElement as HTMLElement;
    fireEvent.dragOver(fantasy, { dataTransfer: { types: ['Files'], getData: () => '' } });
    expect(row).not.toHaveClass('bg-accent-soft');
    fireEvent.dragOver(fantasy, transfer(docs[1]?.id ?? ''));
    expect(row).toHaveClass('bg-accent-soft');
    fireEvent.dragLeave(fantasy, transfer(''));
    expect(row).not.toHaveClass('bg-accent-soft');
    fireEvent.drop(fantasy, transfer(''));
    fireEvent.drop(fantasy, transfer(docs[1]?.id ?? ''));
    await waitFor(() =>
      expect(calls.find((c) => c.path === '/api/library/organize')?.body).toBe(
        `{"documentIds":["${docs[1]?.id}"],"folderId":"${F2}"}`,
      ),
    );
    fireEvent.drop(link(/All documents/), transfer(docs[0]?.id ?? ''));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/api/library/organize').at(-1)?.body).toBe(
        `{"documentIds":["${docs[0]?.id}"],"folderId":null}`,
      ),
    );
  });

  it('offers the same choices as a select on phones', async () => {
    mockApi({});
    const { router } = renderWithApp(
      <RailSelect view={ALL} folders={folders} collections={collections} />,
      { path: '/library', route: '/library' },
    );
    const user = userEvent.setup();
    const select = screen.getByRole('combobox', { name: 'Show' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All documents', 'Continue reading', 'Favourites', 'Recently added', 'Evening', 'Fiction', 'Fiction / Fantasy',
    ]); // prettier-ignore
    await user.selectOptions(select, `?folder=${F2}`);
    expect(router.state.location.search).toBe(`?folder=${F2}`);
    renderWithApp(<RailSelect view={ALL} folders={[]} collections={[]} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('shows hints when there are no collections or folders', () => {
    mockApi({});
    renderWithApp(<LibraryRail view={ALL} documents={[]} folders={[]} collections={[]} />);
    expect(screen.getByText('Group documents any way you like.')).toBeInTheDocument();
    expect(screen.getByText('Give each document a place of its own.')).toBeInTheDocument();
  });
});

describe('Library page views', () => {
  it('shows the chosen view without the continue card, and the rail’s data', async () => {
    mockApi({
      'GET /api/engines': [kokoro()],
      'GET /api/preferences': preferences,
      'GET /api/voices': [],
      'GET /api/documents': docs,
      'GET /api/library/folders': folders,
      'GET /api/library/collections': collections,
      'PUT /api/documents/': { ...docs[1], shelf: { ...docs[1]?.shelf, favorite: true } },
    });
    renderWithApp(<LibraryPage />, { path: '/library', route: '/library?view=favorites' });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Favourites' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Continue listening' })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Fantasy/ })).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: /All documents/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Plain to favourites' }));
    expect(
      await screen.findByRole('button', { name: 'Remove Plain from favourites' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Favourites/ })).toHaveTextContent('2');
  });
});
