// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Tests for exporting a document as audio.
 * Scope: Format, file layout and range choices (and the request they produce), cancelling a running
 *   export, resuming a stopped or failed one, and the errors shown when starting or resuming fails.
 * Does NOT belong: The happy-path download flow (src/test/flows.test.tsx) or export assembly (server).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobOut } from '@/api/types';
import { documentDetail, json, mockApi, preferences, renderWithApp } from '@/test/render';
import { ExportDialog } from './ExportDialog';

afterEach(() => vi.unstubAllGlobals());

const job = (overrides: Partial<JobOut>): JobOut => ({
  id: 'f'.repeat(32), kind: 'export', status: 'running', progress: 0.4, message: 'Generated 2 of 5',
  payload: {}, result: null, errorCode: null, createdAt: '', updatedAt: '', ...overrides,
}); // prettier-ignore

const failure = (message: string) => json({ error: { code: 'export_failed', message } }, 500);

function renderDialog(onOpenChange = vi.fn()) {
  renderWithApp(
    <ExportDialog
      open
      onOpenChange={onOpenChange}
      documentId={'a'.repeat(32)}
      sections={documentDetail().sections}
      currentSection={1}
      voiceId="kokoro:af_heart"
      pace={1}
    />,
  );
  return { user: userEvent.setup(), onOpenChange };
}

const exportBody = (calls: { method: string; path: string; body: unknown }[]) =>
  JSON.parse(String(calls.find((call) => call.path === '/api/exports')?.body)) as Record<
    string,
    unknown
  >;

describe('ExportDialog', () => {
  it('exports the current section as chapter files, cancels and resumes', async () => {
    let state: JobOut = job({});
    const { calls } = mockApi({
      'GET /api/preferences': { ...preferences, exportFormat: 'wav' },
      'POST /api/exports': () => state,
      'GET /api/jobs/': () => state,
      'POST /api/jobs/': () => (state = job({ status: 'canceled', message: 'Canceled.' })),
      'POST /api/exports/': () =>
        (state = job({
          id: 'e'.repeat(32),
          status: 'succeeded',
          progress: 1,
          result: { filename: 'Book.zip', sizeBytes: 2048, durationS: 30 },
        })),
    });
    const { user, onOpenChange } = renderDialog();
    expect(await screen.findByText('Lossless, larger files.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Format'), 'mp3');
    expect(screen.getByText('Smaller files, plays everywhere.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Files'), 'chapters');
    expect(screen.getByText('A ZIP with one file per chapter and a playlist.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('What to export'), 'current');
    await user.click(screen.getByRole('button', { name: 'Start export' }));
    expect(await screen.findByRole('progressbar', { name: 'Export progress' })).toBeInTheDocument();
    expect(exportBody(calls)).toMatchObject({
      format: 'mp3',
      layout: 'chapters',
      firstSection: 1,
      lastSection: 1,
    });
    expect(screen.getByRole('button', { name: 'Keep running in background' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const stopped = await screen.findByRole('status');
    expect(stopped).toHaveTextContent('Export stopped');
    await user.click(within(stopped).getByRole('button', { name: 'Resume' }));
    expect(await screen.findByRole('link', { name: /Download/ })).toHaveAttribute(
      'href',
      `/api/exports/${'e'.repeat(32)}/download`,
    );
    expect(calls.some((call) => call.path === `/api/exports/${'f'.repeat(32)}/resume`)).toBe(true);
    const [, footerClose] = screen.getAllByRole('button', { name: 'Close' }); // the X, then the footer
    await user.click(footerClose as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('exports a range of sections in either order', async () => {
    const { calls } = mockApi({
      'GET /api/preferences': preferences,
      'POST /api/exports': job({ status: 'queued' }),
      'GET /api/jobs/': job({}),
    });
    const { user } = renderDialog();
    await user.selectOptions(await screen.findByLabelText('What to export'), 'custom');
    await user.selectOptions(screen.getByLabelText('From'), '1');
    await user.selectOptions(screen.getByLabelText('To'), '0');
    await user.click(screen.getByRole('switch', { name: 'Subtitles' }));
    await user.click(screen.getByRole('button', { name: 'Start export' }));
    await waitFor(() =>
      expect(exportBody(calls)).toMatchObject({ firstSection: 0, lastSection: 1, captions: true }),
    );
  });

  it('explains when an export cannot start, fails, or cannot resume', async () => {
    let start: () => unknown = () => failure('The voice model is missing.');
    mockApi({
      'GET /api/preferences': preferences,
      'POST /api/exports': () => start(),
      'GET /api/jobs/': job({ status: 'failed', message: 'Disk full.' }),
      'POST /api/exports/': failure('Nothing to resume.'),
    });
    const { user } = renderDialog();
    await user.click(await screen.findByRole('button', { name: 'Start export' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The voice model is missing.');
    start = () => job({ status: 'queued' });
    await user.click(screen.getByRole('button', { name: 'Start export' }));
    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent('Export failed');
    expect(failed).toHaveTextContent('Disk full.');
    await user.click(within(failed).getByRole('button', { name: 'Resume' }));
    expect(await screen.findByText('Nothing to resume.')).toBeInTheDocument();
  });
});
