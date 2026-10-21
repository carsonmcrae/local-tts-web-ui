// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the library screen: adding documents, the document list and deleting.
 * Scope: File picker and drag-and-drop uploads (pre-checks, progress, success, dismissable errors),
 *   pasting text with a title, the sample, loading-error retry, document cards (facts, progress,
 *   delete with confirmation, unloading the player) and the "continue listening" rule.
 * Does NOT belong: Server-side extraction errors (src/test/screens.test.tsx covers one).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '@/api/types';
import type { usePlayer } from '@/features/player/PlayerProvider';
import {
  documentDetail,
  json,
  kokoro,
  mockApi,
  PlayerSpy,
  preferences,
  renderWithApp,
} from '@/test/render';
import LibraryPage from './LibraryPage';

afterEach(() => vi.unstubAllGlobals());

const base = {
  'GET /api/engines': [kokoro()],
  'GET /api/preferences': preferences,
  'GET /api/voices': [],
};

const progress = (percent: number) => ({
  segmentIndex: 1,
  voiceId: null,
  updatedAt: '2026-10-19T11:00:00+00:00',
  percent,
});

function renderLibrary() {
  const latest: { player: ReturnType<typeof usePlayer> | null } = { player: null };
  const view = renderWithApp(
    <>
      <LibraryPage />
      <PlayerSpy onPlayer={(player) => (latest.player = player)} />
    </>,
  );
  return { user: userEvent.setup(), latest, ...view };
}

const pdf = (name = 'notes.pdf', content = '%PDF-1.4') =>
  new File([content], name, { type: 'application/pdf' });

/** An empty library with pasting mocked; returns the empty state's Paste text button. */
async function openEmptyLibraryPaste() {
  const { calls } = mockApi({
    ...base,
    'GET /api/documents': [],
    'POST /api/documents/text': documentDetail({ fileType: 'paste' }),
  });
  const { user } = renderLibrary();
  await screen.findByText('Drop a document here to start listening');
  const [, emptyStatePaste] = screen.getAllByRole('button', { name: 'Paste text' });
  return { calls, user, emptyStatePaste: emptyStatePaste as HTMLElement };
}

describe('Adding documents', () => {
  it('rejects unsupported files before uploading and lets the error be dismissed', async () => {
    const { calls } = mockApi({ ...base, 'GET /api/documents': [] });
    renderLibrary();
    const user = userEvent.setup({ applyAccept: false }); // pick a file the dialog would hide
    const [input] = await screen.findAllByTestId('file-input');
    await user.upload(input as HTMLInputElement, new File(['x'], 'tool.exe'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("“tool.exe” isn't a supported format.");
    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('shows progress while a document is read, then opens it', async () => {
    let finish: () => void = () => undefined;
    mockApi({
      ...base,
      'GET /api/documents': [],
      'POST /api/documents/upload': () =>
        new Promise((resolve) => {
          finish = () => resolve(documentDetail({ id: 'b'.repeat(32) }));
        }),
    });
    const { user, router } = renderLibrary();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    const [upload] = await screen.findAllByRole('button', { name: 'Upload document' });
    await user.click(upload as HTMLElement);
    expect(click).toHaveBeenCalled();
    const [input] = screen.getAllByTestId('file-input');
    fireEvent.change(input as HTMLInputElement, { target: { files: [] } }); // picker cancelled
    await user.upload(input as HTMLInputElement, pdf('Big Book.pdf'));
    expect(await screen.findByRole('status')).toHaveTextContent('Reading Big Book.pdf…');
    act(() => finish());
    await waitFor(() => expect(router.state.location.pathname).toBe(`/read/${'b'.repeat(32)}`));
  });

  it('accepts files dropped anywhere on the page and ignores other drags', async () => {
    const { calls } = mockApi({
      ...base,
      'GET /api/documents': [],
      'POST /api/documents/upload': documentDetail(),
    });
    renderLibrary();
    const page = await screen.findByRole('heading', { level: 1, name: 'Library' });
    const files = (list: File[]) => ({ dataTransfer: { types: ['Files'], files: list } });
    fireEvent.dragEnter(page, { dataTransfer: { types: ['text/plain'], files: [] } });
    fireEvent.dragEnter(page);
    expect(screen.queryByText('Drop to add to your library')).not.toBeInTheDocument();
    fireEvent.dragEnter(page, files([]));
    fireEvent.dragOver(page, files([]));
    expect(screen.getByText('Drop to add to your library')).toBeInTheDocument();
    fireEvent.dragLeave(page, files([]));
    expect(screen.queryByText('Drop to add to your library')).not.toBeInTheDocument();
    fireEvent.drop(page, { dataTransfer: { types: ['text/plain'], files: [] } });
    fireEvent.drop(page, files([]));
    fireEvent.dragEnter(page, files([]));
    fireEvent.drop(page, files([pdf('dropped.pdf')]));
    expect(screen.queryByText('Drop to add to your library')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST')?.path).toBe('/api/documents/upload'),
    );
  });

  it('pastes text with an optional title, and can be cancelled', async () => {
    const { calls, user, emptyStatePaste } = await openEmptyLibraryPaste();
    await user.click(emptyStatePaste);
    let dialog = await screen.findByRole('dialog', { name: 'Paste text' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(emptyStatePaste);
    dialog = await screen.findByRole('dialog', { name: 'Paste text' });
    await user.type(within(dialog).getByLabelText('Title (optional)'), '  Notes  ');
    await user.type(within(dialog).getByLabelText('Text'), 'Hello.');
    expect(within(dialog).getByText('6 characters')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add to library' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST')?.body).toBe(
        '{"text":"Hello.","speechMarks":false,"title":"Notes"}',
      ),
    );
  });

  it('can read speech marks in pasted text, explaining them when turned on', async () => {
    const { calls, user, emptyStatePaste } = await openEmptyLibraryPaste();
    await user.click(emptyStatePaste);
    const dialog = await screen.findByRole('dialog', { name: 'Paste text' });
    expect(within(dialog).queryByText('{sound laugh}')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: /Use speech marks/ }));
    expect(within(dialog).getByText('{sound laugh}')).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('Text'));
    await user.paste('Wait {pause 2s} now.');
    await user.click(within(dialog).getByRole('button', { name: 'Add to library' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST')?.body).toBe(
        '{"text":"Wait {pause 2s} now.","speechMarks":true}',
      ),
    );
  });

  it('explains when pasted text or the sample cannot be added', async () => {
    mockApi({
      ...base,
      'GET /api/documents': [],
      // A fresh response per request: a Response body can only be read once.
      'POST /api/documents/text': () =>
        json({ error: { code: 'empty', message: 'No words.' } }, 422),
    });
    const { user } = renderLibrary();
    await user.click(await screen.findByRole('button', { name: 'Try a sample' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No words.');
    const [headerPaste] = screen.getAllByRole('button', { name: 'Paste text' });
    await user.click(headerPaste as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: 'Paste text' });
    await user.type(within(dialog).getByLabelText('Text'), '…');
    await user.click(within(dialog).getByRole('button', { name: 'Add to library' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No words.');
  });

  it('opens the sample after adding it', async () => {
    mockApi({
      ...base,
      'GET /api/documents': [],
      'POST /api/documents/text': documentDetail({ id: 'c'.repeat(32) }),
    });
    const { user, router } = renderLibrary();
    await user.click(await screen.findByRole('button', { name: 'Try a sample' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/read/${'c'.repeat(32)}`));
  });
});

describe('Document list', () => {
  it('retries after the library fails to load', async () => {
    let fail = true;
    mockApi({
      ...base,
      'GET /api/documents': () =>
        fail ? json({ error: { code: 'db_locked', message: 'The library is busy.' } }, 503) : [],
    });
    const { user } = renderLibrary();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The library is busy.');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Drop a document here to start listening')).toBeInTheDocument();
  });

  it('describes each document and offers to continue only an unfinished one', async () => {
    const summary = (overrides: Partial<DocumentSummary>): DocumentSummary => ({
      ...documentDetail(),
      ...overrides,
    });
    mockApi({
      ...base,
      'GET /api/documents': [
        summary({ id: '1'.repeat(32), title: 'Finished', progress: progress(100) }),
        summary({
          id: '2'.repeat(32),
          title: 'Short note',
          fileType: 'txt',
          pageCount: null,
          sectionCount: 1,
          estimatedSeconds: 20,
        }),
      ],
    });
    renderLibrary();
    const list = await screen.findByRole('list');
    expect(screen.queryByRole('region', { name: 'Continue listening' })).not.toBeInTheDocument();
    expect(
      within(list).getByText(/Text · 2.3 MB · 1 section · < 1 min listen/),
    ).toBeInTheDocument();
    expect(within(list).getByText('New')).toBeInTheDocument();
    expect(screen.getByText('2 total · drag files anywhere to add')).toBeInTheDocument();
  });

  it('deletes a document after confirmation and stops it if it is playing', async () => {
    const doc = documentDetail();
    const other = documentDetail({ id: 'd'.repeat(32), title: 'Other' });
    const { calls } = mockApi({
      ...base,
      'GET /api/documents': [doc, other],
      'DELETE /api/documents/': new Response(null, { status: 204 }),
      'PUT /api/documents/': {},
    });
    const { user, latest } = renderLibrary();
    await screen.findByRole('list');
    await act(() => latest.player?.controller.load(doc, 0, false));
    await user.click(screen.getByRole('button', { name: 'Delete Other' }));
    let confirm = await screen.findByRole('dialog', { name: 'Delete this document?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(latest.player?.state.document?.id).toBe(doc.id);
    await user.click(screen.getByRole('button', { name: 'Delete The Lighthouse' }));
    confirm = await screen.findByRole('dialog', { name: 'Delete this document?' });
    expect(confirm).toHaveTextContent('“The Lighthouse” and its reading progress');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(latest.player?.state.document).toBeNull());
    expect(calls.filter((call) => call.method === 'DELETE').map((call) => call.path)).toEqual([
      `/api/documents/${other.id}`,
      `/api/documents/${doc.id}`,
    ]);
  });
});
