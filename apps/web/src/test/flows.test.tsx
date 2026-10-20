// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Multi-step user flows rendered against the mocked API.
 * Scope: Creating a custom voice from an imported recording (decode mocked: jsdom has no Web Audio),
 *   renaming/deleting a profile, exporting audio through to the download link, installing and
 *   updating an engine with progress, previewing voices, pasting text, and the app shell /
 *   not-found route.
 * Does NOT belong: Unit tests of pure helpers (lib.test.ts).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobOut } from '@/api/types';
import type * as WavModule from '@/lib/audio/wav';
import { App } from '@/app/App';
import { EnginePanel } from '@/features/engines/EngineSetup';
import LibraryPage from '@/features/library/LibraryPage';
import { ExportDialog } from '@/features/reader/ExportDialog';
import VoiceStudioPage from '@/features/studio/VoiceStudioPage';
import VoiceLibraryPage from '@/features/voices/VoiceLibraryPage';
import {
  documentDetail,
  json,
  kokoro,
  mockApi,
  preferences,
  renderWithApp,
  voice,
  voiceProfile,
  chooseQuickVoice,
} from './render';

vi.mock('@/lib/audio/wav', async (importOriginal) => {
  const actual = await importOriginal<typeof WavModule>();
  const rate = 24_000;
  const samples = Float32Array.from({ length: 12 * rate }, (_, i) => {
    const t = i / rate;
    return (Math.sin(2 * Math.PI * 3 * t) > -0.6 ? 0.3 : 0) * Math.sin(2 * Math.PI * 180 * t);
  });
  return {
    ...actual,
    decodeToClip: vi.fn(async () => ({ samples, sampleRate: rate, trimmed: false })),
  };
});

afterEach(() => vi.unstubAllGlobals());

const job = (overrides: Partial<JobOut>): JobOut => ({
  id: 'f'.repeat(32), kind: 'export', status: 'running', progress: 0.5, message: 'Generated 2 of 4 passages',
  payload: {}, result: null, errorCode: null, createdAt: '', updatedAt: '', ...overrides,
}); // prettier-ignore

const profile = voiceProfile();

const base = {
  'GET /api/preferences': preferences,
  'GET /api/voices': [voice()],
  'GET /api/engines': [
    kokoro(),
    kokoro({ id: 'chatterbox', name: 'Chatterbox Turbo', supportsCloning: true, status: 'ready' }),
  ],
};

describe('Voice creation', () => {
  it('imports a recording, checks it, requires consent, creates and tests the voice', async () => {
    const { calls, fetchMock } = mockApi({
      ...base,
      'GET /api/voice-profiles/consent': { statement: 'I have permission to use this voice.' },
      'GET /api/voice-profiles': [],
      'POST /api/voice-profiles/analyze': {
        report: profile.quality,
        suggested: { noiseReduction: 0.5, lowCut: true, trebleDb: 0, bassDb: 0 },
      },
      'POST /api/voice-profiles': profile,
      'POST /api/voices/': new Response(new Blob(['wav'])),
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    await user.click(await screen.findByRole('button', { name: 'Create voice' }));
    const dialog = await chooseQuickVoice(user);
    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    await user.upload(
      within(dialog).getByTestId('voice-file-input'),
      new File(['RIFF'], 'me.wav', { type: 'audio/wav' }),
    );
    expect(await within(dialog).findByText('verified by the local server')).toBeInTheDocument();
    expect(within(dialog).getByText(/Clear, well-levelled speech/)).toBeInTheDocument();
    // The suggested cleanup is on; raising the low end a little is remembered for next time.
    expect(within(dialog).getByRole('button', { name: 'Using the suggestion' })).toBeDisabled();
    within(dialog).getByRole('slider', { name: 'Low end' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('+0.5 dB')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    const create = within(dialog).getByRole('button', { name: 'Create voice' });
    await user.type(within(dialog).getByLabelText('Voice name'), 'My voice');
    expect(create).toBeDisabled();
    await user.click(within(dialog).getByLabelText('I have permission to use this voice.'));
    await user.click(create);
    expect(await within(dialog).findByText('“My voice” is saved')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Generate sample' }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === `/api/voices/${profile.voiceId}/preview`)).toBe(true),
    );
    const createCall = calls.find((c) => c.method === 'POST' && c.path === '/api/voice-profiles');
    expect(createCall?.body).toBeInstanceOf(Blob);
    const createUrl = fetchMock.mock.calls
      .map(([input]) => new URL(String(input), 'http://127.0.0.1'))
      .find((url) => url.pathname === '/api/voice-profiles' && url.searchParams.has('name'));
    expect(Object.fromEntries(createUrl?.searchParams ?? [])).toMatchObject({
      noiseReduction: '0.5',
      lowCut: 'true',
      trebleDb: '0',
      bassDb: '0.5',
    });
    expect(JSON.parse(localStorage.getItem('ltts.cleanup') ?? '{}')).toMatchObject({ bassDb: 0.5 });
  });

  it('renames and permanently deletes a profile', async () => {
    const { calls } = mockApi({
      ...base,
      'GET /api/voice-profiles': [profile],
      'PATCH /api/voice-profiles/': profile,
      'DELETE /api/voice-profiles/': new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceStudioPage />);
    await user.click(await screen.findByRole('button', { name: 'Rename My voice' }));
    const rename = await screen.findByRole('dialog', { name: 'Rename voice' });
    await user.clear(within(rename).getByLabelText('Voice name'));
    await user.type(within(rename).getByLabelText('Voice name'), 'Narrator');
    await user.click(within(rename).getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Delete My voice' }));
    const confirm = await screen.findByRole('dialog', { name: /Permanently delete/ });
    await user.click(within(confirm).getByRole('button', { name: 'Delete voice' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toBe('{"name":"Narrator"}');
  });
});

describe('Export', () => {
  it('starts an export, shows progress and offers the download', async () => {
    let polls = 0;
    mockApi({
      ...base,
      'POST /api/exports': job({ status: 'queued', progress: 0 }),
      'GET /api/jobs/': () =>
        ++polls < 2
          ? job({})
          : job({
              status: 'succeeded',
              progress: 1,
              result: { filename: 'Book.mp3', sizeBytes: 1_200_000, durationS: 600 },
            }),
    });
    const user = userEvent.setup();
    const sections = documentDetail().sections;
    renderWithApp(
      <ExportDialog
        open
        onOpenChange={() => undefined}
        documentId={'a'.repeat(32)}
        sections={sections}
        currentSection={0}
        voiceId="kokoro:af_heart"
        pace={1}
      />,
    );
    await user.selectOptions(await screen.findByLabelText('What to export'), 'custom');
    await user.click(screen.getByRole('button', { name: 'Start export' }));
    expect(await screen.findByRole('progressbar', { name: 'Export progress' })).toBeInTheDocument();
    const download = await screen.findByRole('link', { name: /Download/ }, { timeout: 4000 });
    expect(download).toHaveAttribute('href', `/api/exports/${'f'.repeat(32)}/download`);
    expect(screen.getByText(/Book.mp3 · 1.1 MB · 10 min/)).toBeInTheDocument();
  });
});

/** Renders Chatterbox with an update on offer, checks the notice and presses Update. */
async function startChatterboxUpdate() {
  const user = userEvent.setup();
  const engine = kokoro({ id: 'chatterbox', name: 'Chatterbox Turbo', supportsCloning: true, updateAvailable: true }); // prettier-ignore
  renderWithApp(<EnginePanel engine={engine} />);
  expect(screen.getAllByText('Update available')).toHaveLength(2); // badge + notice
  await user.click(screen.getByRole('button', { name: 'Update Chatterbox Turbo' }));
}

describe('Engines', () => {
  it('installs an engine and shows progress until ready', async () => {
    let state = 0;
    mockApi({
      ...base,
      'POST /api/engines/': job({
        kind: 'install',
        status: 'running',
        progress: 0.3,
        message: 'Downloading…',
      }),
      'GET /api/jobs/': () =>
        ++state < 2
          ? job({ kind: 'install', message: 'Downloading…' })
          : job({ kind: 'install', status: 'succeeded', progress: 1 }),
    });
    const user = userEvent.setup();
    const engine = kokoro({ id: 'chatterbox', name: 'Chatterbox Turbo', status: 'not_installed', installedBytes: 0, installOptions: [
      { id: 'cuda', label: 'NVIDIA GPU (CUDA)', description: 'Fast', downloadBytes: 5e9, diskBytes: 8e9, recommended: true },
      { id: 'cpu', label: 'CPU only', description: 'Slow', downloadBytes: 3e9, diskBytes: 4e9, recommended: false },
    ] }); // prettier-ignore
    renderWithApp(<EnginePanel engine={engine} />);
    await user.click(await screen.findByLabelText(/CPU only/));
    await user.click(screen.getByRole('button', { name: /Install Chatterbox Turbo \(2.8 GB\)/ }));
    expect(
      await screen.findByRole('progressbar', { name: 'Installing Chatterbox Turbo' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Chatterbox Turbo is ready', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it('offers a one-click runtime update for an installed engine', async () => {
    let state = 0;
    const updateJob = (overrides: Partial<JobOut>) =>
      job({ kind: 'install', payload: { engineId: 'chatterbox', update: true }, ...overrides });
    const { calls } = mockApi({
      ...base,
      'POST /api/engines/': updateJob({ progress: 0.05, message: 'Updating runtime: Prepared 2' }),
      'GET /api/jobs/': () =>
        ++state < 2
          ? updateJob({ progress: 0.05, message: 'Updating runtime: Installed 2 packages' })
          : updateJob({ status: 'succeeded', progress: 1, message: 'Done' }),
    });
    await startChatterboxUpdate();
    expect(
      await screen.findByRole('progressbar', { name: 'Updating Chatterbox Turbo' }),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/engines/chatterbox/update')).toBe(true); // prettier-ignore
    expect(
      await screen.findByText('Chatterbox Turbo is up to date', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it('keeps the update on offer and explains a failed update', async () => {
    mockApi({
      ...base,
      'POST /api/engines/': job({ kind: 'install', payload: { update: true } }),
      'GET /api/jobs/': job({
        kind: 'install', payload: { update: true }, status: 'failed', errorCode: 'update_failed',
        message: 'Updating the Chatterbox runtime failed. Your installation was not removed.',
      }), // prettier-ignore
    });
    await startChatterboxUpdate();
    // The card's notice and the toast are both alerts, so find the card's by its title.
    const notice = await screen.findByText('Update failed');
    expect(notice.closest('[role="alert"]')).toHaveTextContent(/installation was not removed/);
    expect(screen.getByRole('button', { name: 'Update Chatterbox Turbo' })).toBeInTheDocument();
  });
});

describe('Voices and library flows', () => {
  it('previews a voice', async () => {
    const { calls } = mockApi({
      ...base,
      'POST /api/voices/': new Response(new Blob(['wav']), {
        headers: { 'X-Audio-Duration': '3' },
      }),
    });
    const user = userEvent.setup();
    renderWithApp(<VoiceLibraryPage />);
    await user.type(await screen.findByLabelText('Comparison passage'), 'Same words for everyone.');
    await user.click(await screen.findByRole('button', { name: 'Preview Heart' }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/voices/kokoro:af_heart/preview')).toBe(true),
    );
    expect(JSON.parse(String(calls.find((c) => c.method === 'POST')?.body))).toMatchObject({
      text: 'Same words for everyone.',
    });
  });

  it('pastes text into the library', async () => {
    const { calls } = mockApi({
      ...base,
      'GET /api/documents': [],
      'POST /api/documents/text': documentDetail({ fileType: 'paste' }),
    });
    const user = userEvent.setup();
    const { router } = renderWithApp(<LibraryPage />);
    await user.click(
      (await screen.findAllByRole('button', { name: 'Paste text' }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Paste text' });
    await user.type(within(dialog).getByLabelText('Text'), 'Hello world.');
    await user.click(within(dialog).getByRole('button', { name: 'Add to library' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/read/${'a'.repeat(32)}`));
    expect(calls.find((c) => c.method === 'POST')?.body).toBe('{"text":"Hello world."}');
  });
});

describe('App shell', () => {
  it('renders navigation, engine status and a not-found page', async () => {
    mockApi({ ...base, 'GET /api/documents': [] });
    window.history.pushState({}, '', '/missing/page');
    render(<App />);
    expect(await screen.findByText("This page doesn't exist")).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Voice Studio|Studio/ }).length).toBeGreaterThan(0);
    expect(await screen.findByText('Voices ready')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });

  it('reports an offline server', async () => {
    mockApi({
      'GET /api/engines': json({ error: { code: 'network_error', message: 'offline' } }, 500),
      'GET /api/preferences': preferences,
      'GET /api/documents': [],
    });
    window.history.pushState({}, '', '/library');
    render(<App />);
    expect(await screen.findByText('Server offline', {}, { timeout: 4000 })).toBeInTheDocument();
  });
});
