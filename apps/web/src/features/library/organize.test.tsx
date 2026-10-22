// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the dialogs that organise documents.
 * Scope: Moving to a folder (one or several documents, the current folder preselected, no folders
 *   yet, a failure), collections (what starts checked, adding and removing, making a new collection
 *   with the button or Enter), editing details (type, genres up to six, tags; one document replaces,
 *   several documents set and add), and deleting (one, several, the one being played, a failure).
 * Does NOT belong: Opening the dialogs from cards or the bulk bar (libraryList.test.tsx).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Collection, DocumentSummary, Folder } from '@/api/types';
import type { usePlayer } from '@/features/player/PlayerProvider';
import { documentDetail, json, mockApi, PlayerSpy, renderWithApp } from '@/test/render';
import type { OrganizeAction } from './OrganizeDialogs';
import { OrganizeDialog } from './OrganizeDialogs';

afterEach(() => vi.unstubAllGlobals());

/** The first (or last) request that changed something; reads by the providers are skipped. */
const sent = (calls: ReturnType<typeof mockApi>['calls'], which: 0 | -1 = 0) =>
  calls.filter((call) => call.method !== 'GET').at(which);

const F1 = '1'.repeat(32);
const F2 = '2'.repeat(32);
const C1 = 'c'.repeat(32);
const C2 = 'd'.repeat(32);
const folders: Folder[] = [
  { id: F1, parentId: null, name: 'Fiction', position: 1, documentCount: 0, createdAt: '' },
  { id: F2, parentId: F1, name: 'Fantasy', position: 1, documentCount: 0, createdAt: '' },
];
const collections: Collection[] = [
  { id: C1, name: 'Evening', description: '', position: 1, documentCount: 1, createdAt: '' },
  { id: C2, name: 'Book club', description: '', position: 2, documentCount: 0, createdAt: '' },
];
const one = documentDetail({
  id: 'a'.repeat(32),
  title: 'Wardens',
  shelf: { folderId: F2, favorite: false, documentType: 'novel', genres: ['fantasy'], tags: ['Epic'], collectionIds: [C1] },
}); // prettier-ignore
const two = documentDetail({ id: 'b'.repeat(32), title: 'Atlas' });

function renderDialog(
  action: OrganizeAction,
  documents: DocumentSummary[],
  extra: { folders?: Folder[]; collections?: Collection[] } = {},
) {
  const onClose = vi.fn();
  const latest: { player: ReturnType<typeof usePlayer> | null } = { player: null };
  renderWithApp(
    <>
      <OrganizeDialog
        action={action}
        documents={documents}
        folders={extra.folders ?? folders}
        collections={extra.collections ?? collections}
        onClose={onClose}
      />
      <PlayerSpy onPlayer={(player) => (latest.player = player)} />
    </>,
  );
  return { user: userEvent.setup(), onClose, latest };
}

describe('Move to folder', () => {
  it('preselects the current folder and moves', async () => {
    const { calls } = mockApi({ 'POST /api/library/organize': [one] });
    const { user, onClose } = renderDialog('move', [one]);
    const dialog = screen.getByRole('dialog', { name: 'Move this document' });
    expect(within(dialog).getByRole('radio', { name: 'Fiction / Fantasy' })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: 'No folder' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent(calls)?.body).toBe(`{"documentIds":["${one.id}"],"folderId":null}`);
  });

  it('explains missing folders and a failure, and closes from the title bar', async () => {
    mockApi({
      'POST /api/library/organize': () => json({ error: { code: 'x', message: 'No.' } }, 409),
    });
    const { user, onClose } = renderDialog('move', [one, two], { folders: [] });
    const dialog = screen.getByRole('dialog', { name: 'Move these 2 documents' });
    expect(dialog).toHaveTextContent('There are no folders yet.');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No.');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Collections', () => {
  it('starts with the collections every document is in, then adds and removes', async () => {
    const { calls } = mockApi({ 'POST /api/library/organize': [one] });
    const { user, onClose } = renderDialog('collect', [one]);
    const dialog = screen.getByRole('dialog', { name: 'Collections for this document' });
    expect(within(dialog).getByRole('checkbox', { name: 'Evening' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Book club' })).not.toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Evening' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Book club' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent(calls)?.body).toBe(
      `{"documentIds":["${one.id}"],"addToCollections":["${C2}"],"removeFromCollections":["${C1}"]}`,
    );
  });

  it('makes a new collection on the spot, by button or Enter, and shows a failure', async () => {
    let created = 0;
    const { calls } = mockApi({
      'POST /api/library/collections': () => {
        created += 1;
        return { ...collections[1], id: `${created}`.repeat(32), name: `New ${created}` };
      },
      'POST /api/library/organize': () => json({ error: { code: 'x', message: 'Failed.' } }, 500),
    });
    const { user } = renderDialog('collect', [one, two]);
    const dialog = screen.getByRole('dialog', { name: 'Collections for these 2 documents' });
    expect(within(dialog).getByRole('checkbox', { name: 'Evening' })).not.toBeChecked(); // not in both
    const field = within(dialog).getByLabelText('New collection');
    await user.type(field, '{Enter}'); // nothing to add yet
    await user.type(field, 'Night');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(field).toHaveValue(''));
    await user.type(field, 'Day{Enter}');
    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/api/library/collections')).toHaveLength(2),
    );
    expect(sent(calls)?.body).toBe('{"name":"Night","description":""}');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Failed.');
    expect(sent(calls, -1)?.body).toBe(
      `{"documentIds":["${one.id}","${two.id}"],"addToCollections":["11111111111111111111111111111111","22222222222222222222222222222222"],"removeFromCollections":[]}`,
    );
  });
});

describe('Edit details', () => {
  it('replaces one document’s type, genres and tags', async () => {
    const { calls } = mockApi({
      'PUT /api/documents/': one,
      'GET /api/library/tags': [
        { tag: 'Epic', count: 1 },
        { tag: 'School', count: 2 },
      ],
    });
    const { user, onClose } = renderDialog('edit', [one]);
    expect(screen.getByLabelText('Tags')).toHaveValue('Epic');
    const yours = await screen.findByLabelText('Your tags');
    expect(within(yours).queryByRole('button', { name: 'Epic' })).not.toBeInTheDocument(); // already typed
    await user.click(within(yours).getByRole('button', { name: 'School' }));
    expect(screen.getByLabelText('Tags')).toHaveValue('Epic, School');
    expect(screen.queryByLabelText('Your tags')).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Details of “Wardens”' });
    expect(within(dialog).getByLabelText('Type')).toHaveValue('novel');
    expect(within(dialog).getByRole('checkbox', { name: 'Fantasy' })).toBeChecked();
    await user.selectOptions(within(dialog).getByLabelText('Type'), '');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Fantasy' }));
    for (const genre of [
      'Mystery',
      'Horror',
      'Adventure',
      'Romance',
      'Poetry',
      'History',
      'Science',
    ]) {
      await user.click(within(dialog).getByRole('checkbox', { name: genre }));
    }
    expect(within(dialog).getByRole('checkbox', { name: 'Science' })).not.toBeChecked(); // the seventh
    await user.clear(within(dialog).getByLabelText('Tags'));
    await user.type(within(dialog).getByLabelText('Tags'), 'quest, Quest, long');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent(calls)?.path).toBe(`/api/documents/${one.id}/shelf`);
    expect(sent(calls)?.body).toBe(
      '{"documentType":null,"genres":["mystery","horror","adventure","romance","poetry","history"],"tags":["quest","long"]}',
    );
  });

  it('sets several documents at once and adds tags, and shows a failure', async () => {
    const { calls } = mockApi({
      'POST /api/library/organize': () =>
        json({ error: { code: 'tag_limit', message: 'Too many tags.' } }, 409),
      'GET /api/library/tags': [{ tag: 'School', count: 2 }],
    });
    const { user } = renderDialog('edit', [one, two]);
    const dialog = screen.getByRole('dialog', { name: 'Details of 2 documents' });
    expect(within(dialog).getByLabelText('Type')).toHaveValue('');
    await user.click(
      within(await screen.findByLabelText('Your tags')).getByRole('button', { name: 'School' }),
    );
    expect(within(dialog).getByLabelText('Add tags')).toHaveValue('School'); // an empty field takes the tag alone
    await user.clear(within(dialog).getByLabelText('Add tags'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' })); // nothing chosen: tags only
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Too many tags.');
    expect(sent(calls)?.body).toBe(`{"documentIds":["${one.id}","${two.id}"],"addTags":[]}`);
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'essay');
    await user.click(within(dialog).getByRole('checkbox', { name: 'History' }));
    await user.type(within(dialog).getByLabelText('Add tags'), 'school');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(2));
    expect(sent(calls, -1)?.body).toBe(
      `{"documentIds":["${one.id}","${two.id}"],"documentType":"essay","genres":["history"],"addTags":["school"]}`,
    );
  });
});

describe('Delete', () => {
  it('deletes several documents and stops the one being played', async () => {
    const { calls } = mockApi({
      'DELETE /api/documents/': new Response(null, { status: 204 }),
      'PUT /api/documents/': {},
      ...{ [`GET /api/documents/${one.id}/sections/`]: { sectionIndex: 0, segments: [] } },
    });
    const { user, onClose, latest } = renderDialog('delete', [one, two]);
    await act(() =>
      latest.player?.controller.load({ ...one, sections: [], skipped: new Set() }, 0, false),
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete 2 documents?' });
    expect(dialog).toHaveTextContent('2 documents and their reading progress');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      `/api/documents/${one.id}`,
      `/api/documents/${two.id}`,
    ]);
    expect(latest.player?.state.document).toBeNull();
  });

  it('says that a bundled book stays in Explore', () => {
    mockApi({});
    renderDialog('delete', [{ ...one, bundledWorkId: 'alices-adventures-in-wonderland' }]);
    expect(screen.getByRole('dialog', { name: 'Delete this document?' })).toHaveTextContent(
      'The book stays in Explore, so you can open it again later.',
    );
  });

  it('explains a failure and keeps the dialog open', async () => {
    mockApi({
      'DELETE /api/documents/': () => json({ error: { code: 'x', message: 'Still in use.' } }, 409),
    });
    const { user, onClose } = renderDialog('delete', [one]);
    const dialog = screen.getByRole('dialog', { name: 'Delete this document?' });
    expect(dialog).toHaveTextContent('“Wardens” and its reading progress');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Still in use.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
