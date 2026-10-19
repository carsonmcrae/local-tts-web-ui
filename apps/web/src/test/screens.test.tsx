/**
 * Purpose: Component tests for the main screens against a mocked local API.
 * Scope: Library empty/list/error states and upload validation, reader read-along highlighting and
 *   click-to-play, player keyboard shortcuts and error recovery, voice filtering, Voice Studio
 *   wizard gating, settings (theme, engines) and the not-found route.
 * Does NOT belong: Real browser/audio behaviour (Playwright e2e).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LibraryPage from '@/features/library/LibraryPage';
import { precheck } from '@/features/library/UploadArea';
import { groupVoices } from '@/features/player/VoicePicker';
import ReaderPage from '@/features/reader/ReaderPage';
import { toBlocks } from '@/features/reader/DocumentText';
import SettingsPage from '@/features/settings/SettingsPage';
import { diagnosticsReport } from '@/features/settings/SystemSections';
import VoiceStudioPage from '@/features/studio/VoiceStudioPage';
import VoiceLibraryPage, { filterVoices } from '@/features/voices/VoiceLibraryPage';
import { PlayerBar } from '@/features/player/PlayerBar';
import { documentDetail, json, kokoro, mockApi, preferences, renderWithApp, voice } from './render';

afterEach(() => vi.unstubAllGlobals());

const base = {
  'GET /api/engines': [kokoro()],
  'GET /api/preferences': preferences,
  'GET /api/voices': [
    voice(),
    voice({
      id: 'kokoro:bm_george',
      name: 'George',
      language: 'English (UK)',
      gender: 'male',
      qualityGrade: 'C',
    }),
  ],
  'PUT /api/documents': {},
};

describe('Library', () => {
  it('shows an inviting empty state with a sample', async () => {
    mockApi({ ...base, 'GET /api/documents': [] });
    renderWithApp(<LibraryPage />);
    expect(await screen.findByText('Drop a document here to start listening')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try a sample' })).toBeInTheDocument();
  });

  it('lists documents with facts and progress, and offers to continue', async () => {
    const doc = documentDetail({
      progress: {
        segmentIndex: 1,
        voiceId: null,
        updatedAt: '2026-10-19T11:00:00+00:00',
        percent: 33.3,
      },
    });
    mockApi({ ...base, 'GET /api/documents': [doc] });
    renderWithApp(<LibraryPage />);
    expect(await screen.findByRole('region', { name: 'Continue listening' })).toHaveTextContent(
      'The Lighthouse',
    );
    const list = screen.getByRole('list');
    expect(within(list).getByText(/PDF · 2.3 MB · 12 pages · ~10 min listen/)).toBeInTheDocument();
    expect(within(list).getByRole('progressbar', { name: '33.3% listened' })).toBeInTheDocument();
  });

  it('explains server-side upload failures in plain language', async () => {
    mockApi({
      ...base,
      'GET /api/documents': [],
      'POST /api/documents/upload': json(
        { error: { code: 'scanned_pdf', message: 'This PDF has no text layer.' } },
        422,
      ),
    });
    const user = userEvent.setup();
    renderWithApp(<LibraryPage />);
    const input = await screen.findAllByTestId('file-input');
    await user.upload(
      input[0] as HTMLInputElement,
      new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('This PDF has no text layer.');
  });

  it('pre-checks type and size before uploading', () => {
    expect(precheck(new File(['x'], 'a.exe'))).toMatch(/isn't a supported format/);
    expect(precheck(new File([], 'empty.txt'))).toMatch(/empty/);
    expect(precheck(new File(['abc'], 'big.pdf'), 2)).toMatch(/larger than/);
    expect(precheck(new File(['ok'], 'fine.EPUB'))).toBeNull();
  });
});

describe('Reader', () => {
  const doc = documentDetail();
  const sections = {
    'GET /api/documents/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/sections/0': {
      sectionIndex: 0,
      segments: [
        {
          index: 0,
          sectionIndex: 0,
          paragraphIndex: 0,
          kind: 'heading',
          boundary: 'paragraph',
          text: 'Chapter One',
        },
        {
          index: 1,
          sectionIndex: 0,
          paragraphIndex: 1,
          kind: 'paragraph',
          boundary: 'section',
          text: 'The keeper climbed.',
        },
      ],
    },
  };

  it('renders headings and sentences, and starts playback from a clicked sentence', async () => {
    const { calls } = mockApi({
      ...base,
      ...sections,
      [`GET /api/documents/${doc.id}`]: doc,
      'GET /api/documents/': doc,
      [`GET /api/documents/${doc.id}/segments`]: new Response(new Blob(['wav']), {
        headers: { 'X-Audio-Duration': '1' },
      }),
    });
    const user = userEvent.setup();
    renderWithApp(<ReaderPage />, { path: '/read/:documentId', route: `/read/${doc.id}` });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'The Lighthouse' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Chapter One' }),
    ).toBeInTheDocument();
    await user.click(screen.getByText('The keeper climbed.'));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/segments/1/audio'))).toBe(true));
    await waitFor(() =>
      expect(screen.getByText('The keeper climbed.')).toHaveAttribute('data-active', 'true'),
    );
    expect(screen.getByRole('navigation', { name: 'Contents' })).toBeInTheDocument();
  });

  it('follows the narration into the next section', async () => {
    mockApi({
      ...base,
      ...sections,
      'GET /api/documents/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/sections/1': {
        sectionIndex: 1,
        segments: [
          {
            index: 2,
            sectionIndex: 1,
            paragraphIndex: 0,
            kind: 'heading',
            boundary: 'paragraph',
            text: 'Chapter Two',
          },
          {
            index: 3,
            sectionIndex: 1,
            paragraphIndex: 1,
            kind: 'paragraph',
            boundary: 'section',
            text: 'Dawn came.',
          },
        ],
      },
      [`GET /api/documents/${doc.id}`]: doc,
      'GET /api/documents/': doc,
      [`GET /api/documents/${doc.id}/segments`]: new Response(new Blob(['wav']), {
        headers: { 'X-Audio-Duration': '1' },
      }),
    });
    const user = userEvent.setup();
    const { media } = renderWithApp(<ReaderPage />, {
      path: '/read/:documentId',
      route: `/read/${doc.id}`,
    });
    await user.click(await screen.findByText('The keeper climbed.'));
    await waitFor(() =>
      expect(screen.getByText('The keeper climbed.')).toHaveAttribute('data-active', 'true'),
    );
    act(() => media.emit('ended'));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Chapter Two' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('The keeper climbed.')).not.toBeInTheDocument();
  });

  it('groups segments into blocks by paragraph', () => {
    const blocks = toBlocks([
      {
        index: 0,
        sectionIndex: 0,
        paragraphIndex: 0,
        kind: 'paragraph',
        boundary: 'sentence',
        text: 'A.',
      },
      {
        index: 1,
        sectionIndex: 0,
        paragraphIndex: 0,
        kind: 'paragraph',
        boundary: 'paragraph',
        text: 'B.',
      },
      {
        index: 2,
        sectionIndex: 0,
        paragraphIndex: 1,
        kind: 'heading',
        boundary: 'paragraph',
        text: 'H',
      },
    ]);
    expect(blocks.map((b) => [b.kind, b.segments.length])).toEqual([
      ['paragraph', 2],
      ['heading', 1],
    ]);
  });

  it('shows a friendly message for a deleted document', async () => {
    mockApi({
      ...base,
      'GET /api/documents/': json({ error: { code: 'document_not_found', message: 'Gone.' } }, 404),
    });
    renderWithApp(<ReaderPage />, { path: '/read/:documentId', route: `/read/${'b'.repeat(32)}` });
    expect(
      await screen.findByText('This document is no longer in your library'),
    ).toBeInTheDocument();
  });
});

describe('Player', () => {
  it('appears once a document is loaded and responds to keyboard shortcuts', async () => {
    const doc = documentDetail();
    mockApi({
      ...base,
      [`GET /api/documents/${doc.id}`]: doc,
      [`GET /api/documents/${doc.id}/sections/0`]: { sectionIndex: 0, segments: [] },
      [`GET /api/documents/${doc.id}/segments`]: json(
        { error: { code: 'engine_not_installed', message: 'Install the voice model first.' } },
        503,
      ),
    });
    const user = userEvent.setup();
    renderWithApp(
      <>
        <ReaderPage />
        <PlayerBar />
      </>,
      { path: '/read/:documentId', route: `/read/${doc.id}` },
    );
    const player = await screen.findByRole('region', { name: 'Audio player' });
    expect(within(player).getByText('Chapter One')).toBeInTheDocument();
    await user.keyboard(' ');
    expect(await within(player).findByRole('alert')).toHaveTextContent(
      'Install the voice model first.',
    );
    expect(within(player).getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
      'href',
      '/settings#engines',
    );
    await user.keyboard(']');
    expect(within(player).getByRole('button', { name: 'Playback speed 1.1×' })).toBeInTheDocument();
    await user.keyboard('?');
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});

describe('Voices', () => {
  const voices = [
    voice(),
    voice({ id: 'kokoro:bm_george', name: 'George', language: 'English (UK)', gender: 'male' }),
    voice({
      id: 'custom:x',
      name: 'My voice',
      category: 'custom',
      engineId: 'chatterbox',
      gender: 'unspecified',
      language: 'English',
      available: false,
    }),
  ];

  it('filters and groups voices', () => {
    expect(
      filterVoices(voices, { query: 'geo', language: 'all', gender: 'all', source: 'all' }).map(
        (v) => v.name,
      ),
    ).toEqual(['George']);
    expect(
      filterVoices(voices, { query: '', language: 'all', gender: 'all', source: 'custom' }),
    ).toHaveLength(1);
    expect(groupVoices(voices, '').map(([group]) => group)).toEqual([
      'Your voices',
      'English (UK)',
      'English (US)',
    ]);
  });

  it('renders voice cards and disables unavailable voices', async () => {
    mockApi({ ...base, 'GET /api/voices': voices });
    renderWithApp(<VoiceLibraryPage />);
    expect(await screen.findByRole('button', { name: 'Preview George' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Preview My voice' })).toBeDisabled();
    expect(screen.getByText('Reading voice')).toBeInTheDocument();
  });
});

describe('Voice Studio', () => {
  it('requires the steps in order and explains the approach first', async () => {
    mockApi({
      ...base,
      'GET /api/voice-profiles': [],
      'GET /api/engines': [
        kokoro(),
        kokoro({
          id: 'chatterbox',
          name: 'Chatterbox Turbo',
          supportsCloning: true,
          optional: true,
          status: 'not_installed',
          installedBytes: 0,
        }),
      ],
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    expect(await screen.findByText('No custom voices yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Install Chatterbox Turbo/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create your first voice' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a voice' });
    expect(within(dialog).getByText('A short reference is all this app needs')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    expect(within(dialog).getByRole('button', { name: 'Start recording' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Continue/ })).toBeDisabled();
  });
});

describe('Settings', () => {
  it('switches theme and lists engines with sizes', async () => {
    mockApi({ ...base, 'GET /api/system': json({ error: { code: 'x', message: 'x' } }, 500) });
    const user = userEvent.setup();
    renderWithApp(<SettingsPage />);
    await user.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveClass('dark');
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(await screen.findByText(/Using 337 MB/)).toBeInTheDocument();
  });

  it('builds a privacy-safe diagnostics report', () => {
    const report = diagnosticsReport(
      {
        version: '2.0.0', python: '3.12.10', platform: 'Windows 11', machine: 'AMD64', cpuCores: 16,
        memoryTotalBytes: 64 * 1024 ** 3, memoryAvailableBytes: 32 * 1024 ** 3, gpus: [{ vendor: 'NVIDIA', name: 'RTX', memoryMb: 10240 }],
        onnxProviders: ['CPUExecutionProvider'], networkExposed: false, telemetry: false, limits: {},
        storage: { dataDir: 'C:/data', freeBytes: 1, totalBytes: 2, modelsBytes: 3, audioCacheBytes: 4, audioCacheLimitBytes: 5, voicesBytes: 6, exportsBytes: 7, databaseBytes: 8 },
      },
      '2.0.0',
    ); // prettier-ignore
    expect(report).toContain('NVIDIA RTX');
    expect(report).not.toContain('C:/data');
  });
});
