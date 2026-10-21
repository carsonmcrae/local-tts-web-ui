// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for exporting a document as audio, an M4B audiobook or a read-along EPUB.
 * Scope: Format, file layout and range choices (and the request they produce), the hints and the
 *   options shown for each format, pausing, resuming and cancelling (after a confirmation that says
 *   saved work is discarded), starting only once on a double click, and the errors shown when
 *   starting or resuming fails or when M4B needs ffmpeg.
 * Does NOT belong: The happy-path download flow (src/test/flows.test.tsx), the audiobook details
 *   (exportDetails.test.tsx), the Exports page (features/exports) or export assembly (server).
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
  it('exports the current section as chapter files, pauses, resumes and cancels', async () => {
    let state: JobOut = job({});
    const { calls } = mockApi({
      'GET /api/preferences': { ...preferences, exportFormat: 'wav' },
      'POST /api/exports': () => state,
      'GET /api/jobs/': () => state,
      'GET /api/exports/': () => ({ job: state, title: 'Book', format: 'mp3', sentences: 8, savedSentences: 3, workingBytes: 4096 }), // prettier-ignore
      'POST /api/exports/': (url: URL) => {
        const action = url.pathname.split('/').pop();
        if (action === 'pause') state = job({ status: 'paused', message: 'Paused' });
        if (action === 'resume') state = job({ message: 'Generated 4 of 8 sentences (3 kept from before)' }); // prettier-ignore
        if (action === 'cancel') state = job({ status: 'canceled', message: 'Canceled' });
        return state;
      },
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
      useCover: true,
    });
    expect(screen.getByRole('button', { name: 'Keep running in background' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start export' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    const paused = await screen.findByRole('status');
    expect(paused).toHaveTextContent('Export paused');
    expect(await within(paused).findByText('3 of 8 sentences saved.')).toBeInTheDocument();
    await user.click(within(paused).getByRole('button', { name: 'Resume' }));
    expect(await screen.findByText(/Generated 4 of 8 sentences/)).toBeInTheDocument();
    expect(calls.some((call) => call.path === `/api/exports/${'f'.repeat(32)}/resume`)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Cancel export' }));
    let confirm = await screen.findByRole('dialog', { name: 'Cancel this export?' });
    expect(confirm).toHaveTextContent('This discards the sentences saved so far.');
    await user.click(within(confirm).getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(confirm).not.toBeInTheDocument());
    expect(calls.some((call) => call.path.endsWith('/cancel'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Cancel export' }));
    confirm = await screen.findByRole('dialog', { name: 'Cancel this export?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel export' }));
    expect(await screen.findByText('Export canceled')).toBeInTheDocument();
    expect(calls.some((call) => call.path === `/api/exports/${'f'.repeat(32)}/cancel`)).toBe(true);
    expect(screen.getByRole('button', { name: 'Start export' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'the Exports page' })).toHaveAttribute(
      'href',
      '/exports',
    );
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

  it('offers an M4B audiobook and a read-along EPUB with only the options that apply', async () => {
    const { calls } = mockApi({
      'GET /api/preferences': preferences,
      'POST /api/exports': job({ status: 'queued' }),
      'GET /api/jobs/': job({}),
    });
    const { user } = renderDialog();
    const format = await screen.findByLabelText('Format');
    expect(within(format).getByRole('option', { name: 'M4B audiobook (chapters and cover)' })).toBeInTheDocument(); // prettier-ignore
    await user.selectOptions(screen.getByLabelText('Files'), 'chapters');
    await user.selectOptions(format, 'm4b');
    expect(screen.getByText('One file with chapters, for audiobook apps. Needs ffmpeg.')).toBeInTheDocument(); // prettier-ignore
    expect(screen.queryByLabelText('Files')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Subtitles' })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Subtitles' }));
    await user.selectOptions(format, 'epub');
    expect(screen.getByText('An e-book that highlights each sentence as it is read aloud.')).toBeInTheDocument(); // prettier-ignore
    expect(screen.queryByRole('switch', { name: 'Subtitles' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start export' }));
    await waitFor(() =>
      expect(exportBody(calls)).toMatchObject({
        format: 'epub',
        layout: 'single',
        captions: false,
      }),
    );
  });

  it('starts one export however quickly Start is pressed twice', async () => {
    let release: (value: unknown) => void = () => undefined;
    const { calls } = mockApi({
      'GET /api/preferences': preferences,
      'POST /api/exports': () => new Promise((resolve) => (release = resolve)),
      'GET /api/jobs/': job({}),
    });
    const { user } = renderDialog();
    const startButton = await screen.findByRole('button', { name: 'Start export' });
    await user.dblClick(startButton);
    expect(startButton).toBeDisabled();
    release(json(job({ status: 'queued' })));
    expect(await screen.findByRole('progressbar', { name: 'Export progress' })).toBeInTheDocument();
    expect(calls.filter((call) => call.path === '/api/exports')).toHaveLength(1);
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

  it('explains kindly that an M4B needs ffmpeg and keeps the saved sentences', async () => {
    const stopped = job({ status: 'failed', errorCode: 'ffmpeg_missing', message: 'M4B export needs ffmpeg.' }); // prettier-ignore
    mockApi({
      'GET /api/preferences': preferences,
      'POST /api/exports': job({ status: 'queued' }),
      'GET /api/jobs/': stopped,
      'GET /api/exports/': { job: stopped, title: 'Book', format: 'm4b', sentences: 8, savedSentences: 8, workingBytes: 1 }, // prettier-ignore
    });
    const { user } = renderDialog();
    await user.selectOptions(await screen.findByLabelText('Format'), 'm4b');
    await user.click(screen.getByRole('button', { name: 'Start export' }));
    const help = await screen.findByRole('status');
    expect(help).toHaveTextContent('M4B needs ffmpeg');
    expect(help).toHaveTextContent('Your sentences are saved');
    expect(await within(help).findByText('8 of 8 sentences saved.')).toBeInTheDocument();
    expect(within(help).getByRole('link', { name: /How to install ffmpeg/ })).toHaveAttribute(
      'href',
      'https://github.com/carsonmcrae/ttsnative/wiki/Exporting-Audio',
    );
    expect(within(help).getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains ffmpeg when an M4B export is refused at the start', async () => {
    mockApi({
      'GET /api/preferences': preferences,
      'POST /api/exports': json({ error: { code: 'ffmpeg_missing', message: 'No ffmpeg.' } }, 409),
    });
    const { user } = renderDialog();
    await user.click(await screen.findByRole('button', { name: 'Start export' }));
    expect(await screen.findByText('M4B needs ffmpeg')).toBeInTheDocument();
    expect(screen.getByText(/Install ffmpeg, restart TTSNative and try again/)).toBeInTheDocument();
  });
});
