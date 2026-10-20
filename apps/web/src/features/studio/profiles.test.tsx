/**
 * Purpose: Tests for managing custom voices in Voice Studio and the less common wizard paths.
 * Scope: Reference playback, renaming (cancel), using a profile for reading, deleting the reading
 *   voice (falls back to the default voice), engine-not-ready states, wizard navigation and reset,
 *   creation and preview failures, and the profile list error state.
 * Does NOT belong: The main creation flow (src/test/flows.test.tsx) or capture details
 *   (capture.test.tsx).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EngineInfo } from '@/api/types';
import type { usePlayer } from '@/features/player/PlayerProvider';
import type * as WavModule from '@/lib/audio/wav';
import {
  json,
  kokoro,
  mockApi,
  PlayerSpy,
  preferences,
  renderWithApp,
  voice,
  voiceProfile,
  chooseQuickVoice,
  nameAndConsent,
  pressDone,
} from '@/test/render';
import VoiceStudioPage from './VoiceStudioPage';

vi.mock('@/lib/audio/wav', async (importOriginal) => {
  const actual = await importOriginal<typeof WavModule>();
  const samples = Float32Array.from({ length: 12 * 24_000 }, (_, i) => 0.3 * Math.sin(i / 20));
  return { ...actual, decodeToClip: async () => ({ samples, sampleRate: 24_000, trimmed: false }) };
});

afterEach(() => vi.unstubAllGlobals());

const profile = voiceProfile({ source: 'recording' });

const cloning = (overrides: Partial<EngineInfo> = {}) =>
  kokoro({ id: 'chatterbox', name: 'Chatterbox Turbo', supportsCloning: true, ...overrides });

function api(overrides: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/engines': [kokoro(), cloning()],
    'GET /api/preferences': preferences,
    'GET /api/voices': [voice()],
    'GET /api/voice-profiles': [profile],
    'GET /api/voice-profiles/consent': { statement: 'I have permission to use this voice.' },
    'POST /api/voice-profiles/analyze': { report: profile.quality, suggested: null },
    'POST /api/voice-profiles': profile,
    'PUT /api/preferences': (_url: URL, init: RequestInit) => JSON.parse(String(init.body)),
    'POST /api/voices/': () => new Response(new Blob(['wav'])),
    ...overrides,
  });
}

function renderStudio() {
  const latest: { player: ReturnType<typeof usePlayer> | null } = { player: null };
  renderWithApp(
    <>
      <VoiceStudioPage />
      <PlayerSpy onPlayer={(player) => (latest.player = player)} />
    </>,
  );
  return { user: userEvent.setup(), player: () => latest.player };
}

const lastAudio = () =>
  vi.mocked(HTMLMediaElement.prototype.play).mock.contexts.at(-1) as HTMLAudioElement;

/** Walks the wizard from the first step to "Create voice" with an imported recording. */
async function createThroughWizard(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Create voice' }));
  const dialog = await chooseQuickVoice(user);
  await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
  await user.upload(within(dialog).getByTestId('voice-file-input'), new File(['RIFF'], 'me.wav'));
  await within(dialog).findByText('verified by the local server');
  await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
  await nameAndConsent(user, dialog, 'My voice');
  return dialog;
}

describe('Profile cards', () => {
  it('plays and stops the stored reference recording', async () => {
    api();
    const { user } = renderStudio();
    await user.click(await screen.findByRole('button', { name: 'Play recording' }));
    expect(lastAudio()).toHaveAttribute('src', `/api/voice-profiles/${profile.id}/reference`);
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    act(() => {
      fireEvent(lastAudio(), new Event('pause'));
    });
    await user.click(await screen.findByRole('button', { name: 'Play recording' }));
    act(() => {
      fireEvent(lastAudio(), new Event('ended'));
    });
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('blocked'));
    await user.click(await screen.findByRole('button', { name: 'Play recording' }));
    expect(screen.getByRole('button', { name: 'Play recording' })).toBeInTheDocument();
  });

  it('cannot be used for reading until the cloning engine is installed', async () => {
    api({ 'GET /api/engines': [kokoro(), cloning({ status: 'not_installed' })] });
    const { user } = renderStudio();
    const use = await screen.findByRole('button', { name: 'Use for reading' });
    expect(use).toBeDisabled();
    expect(use).toHaveAttribute('title', 'Install the cloning engine to use this voice');
    expect(screen.getByText(/14 s recording · created/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rename My voice' }));
    const rename = await screen.findByRole('dialog', { name: 'Rename voice' });
    await user.click(within(rename).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('becomes the reading voice, and deleting it falls back to the default voice', async () => {
    let saved = preferences;
    const { calls } = api({
      'GET /api/preferences': () => saved,
      'PUT /api/preferences': (_url: URL, init: RequestInit) =>
        (saved = JSON.parse(String(init.body)) as typeof preferences),
      'DELETE /api/voice-profiles/': new Response(null, { status: 204 }),
    });
    const { user, player } = renderStudio();
    await user.click(await screen.findByRole('button', { name: 'Use for reading' }));
    expect(await screen.findByText('Reading voice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Used for reading' })).toBeDisabled();
    await waitFor(() => expect(player()?.state.voiceId).toBe(profile.voiceId));
    await user.click(screen.getByRole('button', { name: 'Delete My voice' }));
    const confirm = await screen.findByRole('dialog', { name: /Permanently delete/ });
    await user.click(within(confirm).getByRole('button', { name: 'Delete voice' }));
    expect(await screen.findByText('Deleted “My voice”')).toBeInTheDocument();
    await waitFor(() => expect(player()?.state.voiceId).toBe('kokoro:af_heart'));
    expect(saved.defaultVoiceId).toBe('kokoro:af_heart');
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(2);
  });

  it('explains when profiles cannot be loaded', async () => {
    api({ 'GET /api/voice-profiles': json({ error: { code: 'x', message: 'Disk error.' } }, 500) });
    renderStudio();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your voicesDisk error.");
  }); // prettier-ignore
});

describe('Create voice wizard', () => {
  it('moves back and forth and starts over after closing', async () => {
    api({ 'GET /api/voice-profiles': [] });
    const { user } = renderStudio();
    await user.click(await screen.findByRole('button', { name: 'Create voice' }));
    let dialog = await chooseQuickVoice(user);
    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    await user.upload(within(dialog).getByTestId('voice-file-input'), new File(['RIFF'], 'a.wav'));
    await user.click(await within(dialog).findByRole('button', { name: 'Record again' }));
    expect(within(dialog).getByRole('button', { name: 'Start recording' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(
      within(dialog).getByText('A short reference is all a quick voice needs'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Continue/ }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Create your first voice' }));
    dialog = await chooseQuickVoice(user);
    expect(
      within(dialog).getByText('A short reference is all a quick voice needs'),
    ).toBeInTheDocument();
  });

  it('explains a failed creation', async () => {
    api({
      'POST /api/voice-profiles': () =>
        json({ error: { code: 'storage_full', message: 'The disk is full.' } }, 507),
    });
    const { user } = renderStudio();
    const dialog = await createThroughWizard(user);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The disk is full.');
  });

  it('offers the engine install when the new voice cannot be heard yet', async () => {
    api({ 'GET /api/engines': [kokoro(), cloning({ status: 'not_installed' })] });
    const { user } = renderStudio();
    const dialog = await createThroughWizard(user);
    expect(await within(dialog).findByText('“My voice” is saved')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Install Chatterbox Turbo/ })).toBeInTheDocument();
    await pressDone(user, dialog);
  }); // prettier-ignore

  it('tests the new voice, explains a failed sample and sets it for reading', async () => {
    let saved = preferences;
    api({
      'GET /api/preferences': () => saved,
      'PUT /api/preferences': (_url: URL, init: RequestInit) =>
        (saved = JSON.parse(String(init.body)) as typeof preferences),
      'POST /api/voices/': () =>
        json({ error: { code: 'synthesis_failed', message: 'The model ran out of memory.' } }, 500),
    });
    const { user } = renderStudio();
    const dialog = await createThroughWizard(user);
    const sentence = await within(dialog).findByLabelText('Test sentence');
    await user.clear(sentence);
    await user.type(sentence, 'Testing.');
    await user.click(within(dialog).getByRole('button', { name: 'Generate sample' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The model ran out of memory.'); // prettier-ignore
    await user.click(within(dialog).getByRole('button', { name: 'Use for reading' }));
    expect(await within(dialog).findByRole('button', { name: 'Used for reading' })).toBeDisabled();
  });
});
