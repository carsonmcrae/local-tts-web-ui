// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the background-music controls inside the real player and reader.
 * Scope: Off by default; turning it on and off without touching the narration; following pause and
 *   resume; the separate music volume; the library (categories, preview, choosing a track, credits);
 *   tracks that fail to load and browsers without Web Audio; the choice remembered while "on" is
 *   not; and no control when the build has no tracks. Web Audio is a fake (test/audio.ts).
 * Does NOT belong: Engine or session rules in isolation (engine.test.ts, session.test.ts).
 */
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerBar } from '@/features/player/PlayerBar';
import ReaderPage from '@/features/reader/ReaderPage';
import { FakeAudioContext } from '@/test/audio';
import { documentDetail, json, mockReaderApi, renderWithApp } from '@/test/render';
import type * as LibraryModule from './library';
import type { MusicTrack } from './library';
import { useMusic } from './MusicProvider';

const tracks = vi.hoisted(() => [] as MusicTrack[]);
vi.mock('./library', async (importOriginal) => ({
  ...(await importOriginal<typeof LibraryModule>()),
  TRACKS: tracks,
}));

const track = (id: string, title: string, category: MusicTrack['category']): MusicTrack => ({
  id,
  title,
  creator: 'A. Composer',
  category,
  file: `${id}.webm`,
  durationSeconds: 150,
  licence: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  attribution: null,
});

let contexts: FakeAudioContext[] = [];

beforeEach(() => {
  tracks.splice(
    0,
    tracks.length,
    track('harbour', 'Harbour Lights', 'ambient'),
    track('forest', 'Forest Rain', 'nature'),
    track('study', 'Quiet Study', 'focus'),
  );
  contexts = [];
  vi.stubGlobal(
    'AudioContext',
    class extends FakeAudioContext {
      constructor() {
        super();
        contexts.push(this);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const doc = documentDetail();
const READER_WITH_PLAYER = (
  <>
    <ReaderPage />
    <PlayerBar />
  </>
);

/** The reader's API, with music files that load (or answer `status`, or never answer). */
const music = (status: number | 'pending' = 200) =>
  mockReaderApi(doc, {
    'GET /music/': () => {
      if (status === 'pending') return new Promise<Response>(() => undefined);
      return status === 200 ? new Response(new Uint8Array([1, 2, 3])) : json({}, status);
    },
  });

async function openReader() {
  const user = userEvent.setup();
  const view = renderWithApp(READER_WITH_PLAYER, {
    path: '/read/:documentId',
    route: `/read/${doc.id}`,
  });
  const player = await screen.findByRole('region', { name: 'Audio player' });
  const press = (name: string) => user.click(within(player).getByRole('button', { name }));
  const openMusic = async () => {
    const [button] = within(player).getAllByRole('button', { name: /^Background music/ });
    await user.click(button as HTMLElement);
    return screen.findByRole('dialog', { name: 'Background music' });
  };
  /** Opens the music panel and flips the switch; returns the panel. */
  const toggleMusic = async () => {
    const panel = await openMusic();
    await user.click(within(panel).getByRole('switch'));
    return panel;
  };
  const openLibrary = async () => {
    await user.click(within(await openMusic()).getByRole('button', { name: 'Browse' }));
    return screen.findByRole('dialog', { name: 'Music library' });
  };
  const playing = () => contexts.flatMap((context) => context.playing);
  const waitForPlaying = (count: number) => waitFor(() => expect(playing()).toHaveLength(count));
  return { ...view, user, player, press, openMusic, toggleMusic, openLibrary, waitForPlaying };
}

describe('Background music', () => {
  it('is off until turned on, and never interrupts the narration', async () => {
    music();
    const { user, player, press, openMusic, waitForPlaying, media } = await openReader();
    await press('Play');
    await within(player).findByRole('button', { name: 'Pause' });
    const panel = await openMusic();
    const toggle = within(panel).getByRole('switch', { name: 'Background music' });
    expect(toggle).not.toBeChecked();
    expect(within(panel).getByText(/Off again for the next one/)).toBeInTheDocument();
    expect(contexts).toHaveLength(0);
    const narration = { play: media.play.mock.calls.length, pause: media.pause.mock.calls.length };

    await user.click(toggle);
    await waitForPlaying(1);
    expect(within(panel).getByText('Playing under the narration.')).toBeInTheDocument();
    const highlighted = { name: 'Background music on: Harbour Lights. Change' };
    expect(within(player).getAllByRole('button', highlighted)).toHaveLength(2);
    await user.click(toggle);
    await waitForPlaying(0);
    expect(media.play.mock.calls.length).toBe(narration.play);
    expect(media.pause.mock.calls.length).toBe(narration.pause);
    expect(within(player).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('waits for the narration, then pauses and resumes with it', async () => {
    music();
    const { user, press, toggleMusic, waitForPlaying } = await openReader();
    await toggleMusic();
    expect(screen.getByText('Starts when the narration plays.')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitForPlaying(0);
    await press('Play');
    await waitForPlaying(1);
    await press('Pause');
    await waitForPlaying(0);
    await press('Play');
    await waitForPlaying(1);
    expect(contexts).toHaveLength(1);
  });

  it('has its own volume, saved on this device and never sent to the narration', async () => {
    const { calls } = music();
    const { user, openMusic } = await openReader();
    const panel = await openMusic();
    const slider = within(panel).getByRole('slider', { name: 'Music volume' });
    expect(slider).toHaveAttribute('aria-valuetext', '10%');
    act(() => slider.focus());
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(slider).toHaveAttribute('aria-valuenow', '13');
    expect(within(panel).getByText('13%')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('ltts.music') ?? '{}')).toMatchObject({ volume: 13 });
    const preferenceSaves = calls.filter((call) => call.path === '/api/preferences');
    expect(preferenceSaves.every((call) => call.method === 'GET')).toBe(true);
  });

  it('browses by category, previews and chooses a track without turning music on', async () => {
    music();
    const { user, openMusic, openLibrary, waitForPlaying } = await openReader();
    const library = await openLibrary();
    const button = (name: string) => within(library).getByRole('button', { name });
    expect(within(library).getByRole('radio', { name: /Harbour Lights/ })).toBeChecked();
    await user.click(within(library).getByRole('radio', { name: 'Nature' }));
    expect(within(library).queryByText('Harbour Lights')).not.toBeInTheDocument();
    await user.click(within(library).getByRole('radio', { name: 'All' }));

    await user.click(button('Preview Forest Rain'));
    await waitForPlaying(1);
    await user.click(button('Stop the preview of Forest Rain'));
    await waitForPlaying(0);
    await user.click(button('Preview Forest Rain'));
    await waitForPlaying(1);
    await user.click(within(library).getByRole('radio', { name: /Quiet Study/ }));
    expect(JSON.parse(localStorage.getItem('ltts.music') ?? '{}')).toMatchObject({
      trackId: 'study',
    });
    expect(within(library).getByRole('link', { name: 'Credits and licences' })).toHaveAttribute(
      'href',
      '/music/CREDITS.md',
    );
    await user.keyboard('{Escape}');
    await waitForPlaying(0);
    const panel = await openMusic();
    expect(within(panel).getByRole('switch')).not.toBeChecked();
    expect(within(panel).getByText('Quiet Study')).toBeInTheDocument();
  });

  it('explains a track that cannot be loaded, and the narration carries on', async () => {
    music(404);
    const { player, press, toggleMusic } = await openReader();
    await press('Play');
    const panel = await toggleMusic();
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'Couldn’t play “Harbour Lights”. The narration carries on.',
    );
    expect(within(panel).getByRole('switch')).not.toBeChecked();
    expect(within(player).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('shows a track loading on its preview button, and a failed preview next to its track', async () => {
    music('pending');
    const first = await openReader();
    let library = await first.openLibrary();
    await first.user.click(within(library).getByRole('button', { name: 'Preview Forest Rain' }));
    expect(
      within(library).getByRole('button', { name: 'Stop the preview of Forest Rain' }),
    ).toHaveAttribute('aria-busy', 'true');
    first.unmount();

    music(404);
    const second = await openReader();
    library = await second.openLibrary();
    await second.user.click(within(library).getByRole('button', { name: 'Preview Quiet Study' }));
    expect(await within(library).findByRole('alert')).toHaveTextContent(
      'Couldn’t play “Quiet Study”.',
    );
  });

  it('says so in a browser without Web Audio', async () => {
    vi.stubGlobal('AudioContext', undefined);
    music();
    const { press, toggleMusic } = await openReader();
    await press('Play');
    const panel = await toggleMusic();
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'Background music isn’t available in this browser.',
    );
  });

  it('remembers the track and volume but starts the next session without music', async () => {
    localStorage.setItem('ltts.music', JSON.stringify({ trackId: 'forest', volume: 30 }));
    music();
    const first = await openReader();
    await first.toggleMusic();
    first.unmount();
    const panel = await (await openReader()).openMusic();
    expect(within(panel).getByRole('switch')).not.toBeChecked();
    expect(within(panel).getByText('Forest Rain')).toBeInTheDocument();
    expect(within(panel).getByRole('slider', { name: 'Music volume' })).toHaveAttribute(
      'aria-valuenow',
      '30',
    );
  });

  it('offers no music control when the build has no tracks', async () => {
    tracks.length = 0;
    music();
    const { player } = await openReader();
    expect(within(player).queryByRole('button', { name: /Background music/ })).toBeNull();
  });

  it('must be used inside the player', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useMusic())).toThrow(
      'useMusic must be used inside <MusicProvider>',
    );
  });
});
