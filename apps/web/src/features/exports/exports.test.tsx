// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the Exports page.
 * Scope: Stopped exports (interrupted when the app closed, or paused) listed first with what they
 *   saved and Resume; refreshing while one runs; the empty state; cancelling after a confirmation;
 *   deleting a finished file; and when "Send to Audiobookshelf" is offered (set up, and one M4B,
 *   MP3 or WAV file) and what it reports.
 * Does NOT belong: The export dialog (features/reader/export.test.tsx).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportKeys } from '@/api/exportQueries';
import type { ExportOut, JobOut, ShelfSettings } from '@/api/types';
import { mockApi, renderWithApp } from '@/test/render';
import ExportsPage from './ExportsPage';

afterEach(() => vi.unstubAllGlobals());

const [A, B, C, D] = ['a', 'b', 'c', 'd'].map((letter) => letter.repeat(32)) as [string, string, string, string]; // prettier-ignore

const job = (overrides: Partial<JobOut>): JobOut => ({
  id: A, kind: 'export', status: 'succeeded', progress: 1, message: 'Done', payload: {}, result: null,
  errorCode: null, createdAt: '2026-10-20T10:00:00+00:00', updatedAt: '', ...overrides,
}); // prettier-ignore

const item = (overrides: Partial<ExportOut> & { job: JobOut }): ExportOut => ({
  title: 'The Lighthouse', format: 'm4b', sentences: 400, savedSentences: 0, workingBytes: 0, ...overrides,
}); // prettier-ignore

const finished = (id: string, filename: string, title: string): ExportOut =>
  item({ job: job({ id, result: { filename, sizeBytes: 3e7, durationS: 3600 } }), title, workingBytes: 3e7 }); // prettier-ignore

const notSetUp: ShelfSettings = { configured: false, hasKey: false };
const lists = (calls: { method: string; path: string }[]) =>
  calls.filter((call) => call.method === 'GET' && call.path === '/api/exports').length;

describe('Exports page', () => {
  it('lists an interrupted export first with Resume and refreshes while one runs', async () => {
    let interrupted = job({ status: 'interrupted', progress: 0.3, message: 'Stopped when the app shut down.' }); // prettier-ignore
    const running = job({ id: B, status: 'running', progress: 0.2, message: 'Generated 10 of 50 sentences' }); // prettier-ignore
    const { calls } = mockApi({
      'GET /api/exports': () => [
        item({ job: running, title: 'Second book', format: 'mp3', sentences: 50, savedSentences: 10, workingBytes: 2048 }), // prettier-ignore
        item({ job: interrupted, savedSentences: 120, workingBytes: 5_000_000 }),
      ],
      'POST /api/exports/': () => (interrupted = { ...interrupted, status: 'queued', message: 'Waiting to start…' }), // prettier-ignore
    });
    renderWithApp(<ExportsPage />);
    const user = userEvent.setup();
    const ready = await screen.findByRole('region', { name: 'Ready to resume' });
    const card = within(ready).getByRole('article', { name: 'The Lighthouse' });
    expect(card).toHaveTextContent('Interrupted');
    expect(card).toHaveTextContent('Export interrupted');
    expect(card).toHaveTextContent('120 of 400 sentences saved.');
    expect(card).toHaveTextContent('M4B audiobook');
    expect(card).toHaveTextContent('4.8 MB on disk');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Ready to resume', 'In progress']);
    const progress = within(screen.getByRole('region', { name: 'In progress' })).getByRole('article', { name: 'Second book' }); // prettier-ignore
    expect(progress).toHaveTextContent('10 of 50 sentences saved');
    expect(within(progress).getByRole('progressbar', { name: 'Export progress' })).toBeInTheDocument(); // prettier-ignore
    expect(within(progress).getByText('Generated 10 of 50 sentences')).toHaveAttribute('aria-live', 'polite'); // prettier-ignore
    await waitFor(() => expect(lists(calls)).toBeGreaterThan(1), { timeout: 3500 });
    await user.click(within(card).getByRole('button', { name: 'Resume' }));
    const nowRunning = await screen.findByRole('region', { name: 'In progress' });
    await waitFor(() =>
      expect(
        within(nowRunning).getByRole('article', { name: 'The Lighthouse' }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('region', { name: 'Ready to resume' })).not.toBeInTheDocument();
    expect(calls.some((call) => call.path === `/api/exports/${A}/resume`)).toBe(true);
  });

  it('explains how to make an export when there are none', async () => {
    mockApi({ 'GET /api/exports': [] });
    renderWithApp(<ExportsPage />);
    expect(await screen.findByRole('heading', { name: 'No exports yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your library' })).toHaveAttribute('href', '/library'); // prettier-ignore
  });

  it('cancels a paused export only after confirming its saved sentences are discarded', async () => {
    let paused = job({ status: 'paused', progress: 0.4, message: 'Paused' });
    const { calls } = mockApi({
      'GET /api/exports': () => [item({ job: paused, sentences: 8, savedSentences: paused.status === 'paused' ? 3 : 0, workingBytes: 4096 })], // prettier-ignore
      'POST /api/exports/': () => (paused = { ...paused, status: 'canceled', message: 'Canceled' }),
    });
    renderWithApp(<ExportsPage />);
    const user = userEvent.setup();
    const card = await screen.findByRole('article', { name: 'The Lighthouse' });
    expect(card).toHaveTextContent('Export paused');
    expect(card).toHaveTextContent('3 of 8 sentences saved.');
    await user.click(within(card).getByRole('button', { name: 'Cancel export' }));
    const confirm = await screen.findByRole('dialog', { name: 'Cancel this export?' });
    expect(confirm).toHaveTextContent("This discards 3 saved sentences. This can't be undone.");
    await user.click(within(confirm).getByRole('button', { name: 'Cancel export' }));
    const earlier = await screen.findByRole('region', { name: 'Earlier' });
    expect(await within(earlier).findByText('Export canceled')).toBeInTheDocument();
    expect(calls.some((call) => call.path === `/api/exports/${A}/cancel`)).toBe(true);
  });

  it('deletes a finished file after confirmation', async () => {
    let bytes = 3e7;
    const { calls } = mockApi({
      'GET /api/exports': () => [{ ...finished(A, 'Book.m4b', 'Book'), workingBytes: bytes }],
      'GET /api/integrations/audiobookshelf': notSetUp,
      'DELETE /api/exports/': () => {
        bytes = 0;
        return new Response(null, { status: 204 });
      },
    });
    renderWithApp(<ExportsPage />);
    const user = userEvent.setup();
    const card = await screen.findByRole('article', { name: 'Book' });
    expect(within(card).getByRole('link', { name: /Download/ })).toHaveAttribute('href', `/api/exports/${A}/download`); // prettier-ignore
    expect(card).toHaveTextContent('Book.m4b · 29 MB · 1 h');
    await user.click(within(card).getByRole('button', { name: 'Delete file' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete the exported file?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete file' }));
    expect(await within(card).findByText('File deleted')).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: /Download/ })).not.toBeInTheDocument();
    expect(calls.some((call) => call.method === 'DELETE' && call.path === `/api/exports/${A}`)).toBe(true); // prettier-ignore
  });
});

describe('Send to Audiobookshelf', () => {
  const exportsList = [
    finished(A, 'Book.m4b', 'Book'),
    finished(B, 'Book (MP3 chapters).zip', 'Zipped book'),
    finished(C, 'Book (read-along).epub', 'Read-along book'),
  ];

  it('is offered for one audio file when Audiobookshelf is set up, and reports the upload', async () => {
    const upload = job({ id: D, kind: 'audiobookshelf', status: 'queued', message: 'Waiting to start…' }); // prettier-ignore
    const { calls } = mockApi({
      'GET /api/exports': exportsList,
      'GET /api/integrations/audiobookshelf': { configured: true, url: 'http://shelf.local', libraryId: 'lib', folderId: 'fold', hasKey: true }, // prettier-ignore
      'POST /api/exports/': upload,
      'GET /api/jobs/': { ...upload, status: 'succeeded', message: 'Done' },
    });
    renderWithApp(<ExportsPage />);
    const user = userEvent.setup();
    const book = await screen.findByRole('article', { name: 'Book' });
    const send = await within(book).findByRole('button', { name: 'Send to Audiobookshelf' });
    expect(screen.getAllByRole('button', { name: 'Send to Audiobookshelf' })).toHaveLength(1);
    await user.click(send);
    expect(await within(book).findByText('Sent to Audiobookshelf.')).toBeInTheDocument();
    expect(within(book).queryByRole('button', { name: 'Send to Audiobookshelf' })).not.toBeInTheDocument(); // prettier-ignore
    expect(calls.some((call) => call.method === 'POST' && call.path === `/api/exports/${A}/audiobookshelf`)).toBe(true); // prettier-ignore
  });

  it.each([
    ['not set up', notSetUp],
    ['missing a folder', { configured: true, url: 'http://shelf.local', libraryId: 'lib', folderId: null, hasKey: true }], // prettier-ignore
    ['missing a key', { configured: true, url: 'http://shelf.local', libraryId: 'lib', folderId: 'fold', hasKey: false }], // prettier-ignore
  ])('is hidden when Audiobookshelf is %s', async (_name, settings) => {
    mockApi({ 'GET /api/exports': exportsList, 'GET /api/integrations/audiobookshelf': settings });
    const { queryClient } = renderWithApp(<ExportsPage />);
    expect(await screen.findAllByRole('link', { name: /Download/ })).toHaveLength(3);
    await waitFor(() =>
      expect(queryClient.getQueryState(exportKeys.shelf)?.status).toBe('success'),
    );
    expect(
      screen.queryByRole('button', { name: 'Send to Audiobookshelf' }),
    ).not.toBeInTheDocument();
  });

  it('explains why an upload could not start', async () => {
    mockApi({
      'GET /api/exports': [exportsList[0]],
      'GET /api/integrations/audiobookshelf': { configured: true, url: 'http://shelf.local', libraryId: 'lib', folderId: 'fold', hasKey: true }, // prettier-ignore
      'POST /api/exports/': new Response(JSON.stringify({ error: { code: 'audiobookshelf_error', message: "Couldn't reach Audiobookshelf." } }), { status: 502, headers: { 'Content-Type': 'application/json' } }), // prettier-ignore
    });
    renderWithApp(<ExportsPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Send to Audiobookshelf' }));
    expect(await screen.findByText("Couldn't reach Audiobookshelf.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to Audiobookshelf' })).toBeEnabled();
  });
});
