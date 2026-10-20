// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Tests for the docked player: transport, position, speed, voice, dialogs and shortcuts.
 * Scope: PlayerBar wired to a document opened in the reader against the mocked API, keyboard
 *   shortcuts, error recovery, missing voices/preferences, and the ErrorStrip fallback message.
 * Does NOT belong: The playback state machine (controller.test.ts) or media-session and progress
 *   wiring (session.test.tsx).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentDetail } from '@/api/types';
import ReaderPage from '@/features/reader/ReaderPage';
import {
  documentDetail,
  json,
  kokoro,
  mockApi,
  preferences,
  readerRoutes,
  renderWithApp,
  voice,
} from '@/test/render';
import { PlayerBar } from './PlayerBar';
import { ErrorStrip } from './PlayerParts';

afterEach(() => vi.unstubAllGlobals());

const failure = (status = 500) =>
  json({ error: { code: 'unavailable', message: 'Down.' } }, status);

function api(doc: DocumentDetail = documentDetail(), overrides: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/engines': [kokoro()],
    'GET /api/preferences': preferences,
    'GET /api/voices': [
      voice(),
      voice({ id: 'kokoro:bm_george', name: 'George', language: 'English (UK)', gender: 'male' }),
      voice({
        id: 'custom:mine',
        name: 'Mine',
        category: 'custom',
        engineId: 'chatterbox',
        gender: 'unspecified',
        qualityGrade: null,
        available: false,
      }),
    ],
    'PUT /api/preferences': (_url: URL, init: RequestInit) => JSON.parse(String(init.body)),
    'PUT /api/documents/': {},
    ...readerRoutes(doc),
    ...overrides,
  });
}

async function openPlayer(doc: DocumentDetail = documentDetail()) {
  const user = userEvent.setup();
  renderWithApp(
    <>
      <ReaderPage />
      <PlayerBar />
    </>,
    { path: '/read/:documentId', route: `/read/${doc.id}` },
  );
  const player = await screen.findByRole('region', { name: 'Audio player' });
  const position = within(player).getByRole('slider', { name: 'Position in document' });
  const at = (sentence: number) =>
    waitFor(() => expect(position).toHaveAttribute('aria-valuetext', `Sentence ${sentence} of 4`));
  return { user, player, position, at };
}

const savedPreferences = (calls: { method: string; path: string; body: unknown }[]) =>
  calls
    .filter((call) => call.method === 'PUT' && call.path === '/api/preferences')
    .map((call) => JSON.parse(String(call.body)) as typeof preferences);

describe('PlayerBar', () => {
  it('plays, pauses and moves by sentence and by section', async () => {
    api();
    const { user, player, at } = await openPlayer();
    const press = (name: string) => user.click(within(player).getByRole('button', { name }));
    await press('Play');
    expect(await within(player).findByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await press('Next sentence');
    await at(2);
    await press('Next section');
    await at(3);
    expect(within(player).getByText('Chapter Two')).toBeInTheDocument();
    await press('Previous section');
    await at(1);
    await press('Next sentence');
    await at(2);
    await press('Previous sentence');
    await at(1);
    await user.click(await within(player).findByRole('button', { name: 'Pause' }));
    expect(await within(player).findByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('changes speed from the compact button and the speed menu, and saves it', async () => {
    const { calls } = api(undefined, {
      'GET /api/preferences': { ...preferences, playbackRate: 2 },
    });
    const { user, player } = await openPlayer();
    await user.click(
      await within(player).findByRole('button', { name: 'Playback speed 2×. Change speed' }),
    );
    await user.click(within(player).getByRole('button', { name: 'Playback speed 0.75×' }));
    const menu = await screen.findByRole('group', { name: 'Playback speed' });
    await user.click(within(menu).getByRole('radio', { name: '1.25×' }));
    expect(
      within(player).getByRole('button', { name: 'Playback speed 1.25×' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(savedPreferences(calls).map((saved) => saved.playbackRate)).toEqual([0.75, 1.25]),
    );
  });

  it('switches the narration voice from the searchable picker', async () => {
    const { calls } = api();
    const { user, player } = await openPlayer();
    const [picker] = within(player).getAllByRole('button', { name: 'Voice: Heart. Change voice' });
    await user.click(picker as HTMLElement);
    const list = await screen.findByRole('listbox', { name: 'Voices' });
    expect(within(list).getByRole('group', { name: 'English (UK)' })).toBeInTheDocument();
    expect(within(list).getByRole('option', { name: /^Mine/ })).toBeDisabled();
    const search = screen.getByRole('textbox', { name: 'Search voices' });
    await user.type(search, 'zzz');
    expect(within(list).getByText('No voices match “zzz”.')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'geo');
    await user.click(within(list).getByRole('option', { name: /George/ }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(
      within(player).getAllByRole('button', { name: 'Voice: George. Change voice' }),
    ).toHaveLength(2);
    await waitFor(() =>
      expect(savedPreferences(calls).at(-1)?.defaultVoiceId).toBe('kokoro:bm_george'),
    );
  });

  it('opens the export dialog from either layout and the shortcut sheet', async () => {
    api();
    const { user, player } = await openPlayer();
    const [desktop, compact] = within(player).getAllByRole('button', { name: 'Export audio' });
    for (const button of [compact, desktop]) {
      await user.click(button as HTMLElement);
      expect(await screen.findByRole('dialog', { name: 'Export audio' })).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
    await user.click(within(player).getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveTextContent(
      'Previous or next section',
    );
  });

  it('jumps to a sentence with the position slider', async () => {
    api();
    const { user, player, position, at } = await openPlayer();
    act(() => position.focus());
    await user.keyboard('{End}');
    await at(4);
    expect(within(player).getByText('Chapter Two')).toBeInTheDocument();
  });

  it('explains a failed sentence and retries it', async () => {
    let fail = true;
    const doc = documentDetail();
    api(doc, {
      [`GET /api/documents/${doc.id}/segments`]: () =>
        fail
          ? json({ error: { code: 'synthesis_failed', message: 'Generation failed.' } }, 500)
          : new Response(new Blob(['wav']), { headers: { 'X-Audio-Duration': '2' } }),
    });
    const { user, player } = await openPlayer(doc);
    await user.click(within(player).getByRole('button', { name: 'Play' }));
    const alert = await within(player).findByRole('alert');
    expect(alert).toHaveTextContent('Generation failed.');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await within(player).findByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('copes with a flat document and with voices and preferences unavailable', async () => {
    const doc = documentDetail({ sections: [], sectionCount: 0 });
    const { calls } = api(doc, {
      'GET /api/voices': failure(),
      'GET /api/preferences': failure(),
    });
    const { user, player } = await openPlayer(doc);
    expect(await screen.findByText('Sentence 4.')).toBeInTheDocument();
    expect(
      within(player).getAllByRole('button', { name: 'Voice: none selected. Change voice' }),
    ).toHaveLength(2);
    expect(within(player).getByText('Choose voice')).toBeInTheDocument();
    await user.click(
      within(player).getByRole('button', { name: 'Playback speed 1×. Change speed' }),
    );
    expect(within(player).getByRole('button', { name: 'Playback speed 1.1×' })).toBeInTheDocument();
    expect(savedPreferences(calls)).toEqual([]);
  });
});

describe('keyboard shortcuts', () => {
  it('moves, toggles and changes speed unless a control has focus or a modifier is held', async () => {
    api();
    const { user, player, at } = await openPlayer();
    await user.keyboard('{ArrowRight}');
    await at(2);
    await user.keyboard('{ArrowLeft}');
    await at(1);
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    await at(3);
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    await at(1);
    await user.keyboard('[[x'); // "[[" types a literal "["
    expect(within(player).getByRole('button', { name: 'Playback speed 0.9×' })).toBeInTheDocument();
    await user.keyboard('{Control>}k{/Control}');
    act(() => within(player).getByRole('button', { name: 'Next sentence' }).focus());
    await user.keyboard('k');
    expect(within(player).getByRole('button', { name: 'Play' })).toBeInTheDocument();
    act(() => (document.activeElement as HTMLElement).blur());
    await user.keyboard('k');
    expect(await within(player).findByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });
});

describe('ErrorStrip', () => {
  it('falls back to a generic message and offers a retry', async () => {
    const onRetry = vi.fn();
    render(<ErrorStrip error={null} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Playback failed.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
