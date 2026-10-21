// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for when background music plays, against a fake narration player and engine.
 * Scope: Off by default for every narration; explicit on/off with fades; following pause, resume,
 *   sentence changes, seeking, speed and voice changes without restarting; a new document or the
 *   end of the narration turning music off; track choice and volume saved without "on"; previews;
 *   load failures and missing Web Audio; detaching.
 * Does NOT belong: Web Audio (engine.test.ts) or the controls (music.test.tsx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerDocument, PlayerState } from '@/features/player/controller';
import type { EngineEvents, MusicTarget } from './engine';
import type { MusicTrack } from './library';
import type { MusicChoice } from './preferences';
import { FADES, MusicSession, PAUSE_GRACE_MS, PREVIEW_SECONDS } from './session';

const track = (id: string, title = id): MusicTrack => ({
  id,
  title,
  creator: 'Someone',
  category: 'ambient',
  file: `${id}.webm`,
  durationSeconds: 120,
  licence: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  attribution: null,
});

const doc = (id: string): PlayerDocument => ({
  id,
  title: id,
  segmentCount: 10,
  estimatedSeconds: 60,
  sections: [],
});

class FakePlayer {
  state: PlayerState = {
    document: null,
    segmentIndex: 0,
    status: 'idle',
    error: null,
    voiceId: 'kokoro:af_heart',
    rate: 1,
    pace: 1,
    currentTime: 0,
    duration: 0,
    sleep: null,
  };
  private readonly listeners = new Set<(state: PlayerState) => void>();
  getState = () => this.state;
  subscribe = (listener: (state: PlayerState) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
}

function setup({
  tracks = [track('rain', 'Rain'), track('dusk', 'Dusk')],
  saved = { trackId: 'dusk', volume: 25 },
} = {}) {
  const player = new FakePlayer();
  const engine = {
    play: vi.fn<(target: MusicTarget | null, fade: number) => void>(),
    setVolume: vi.fn(),
    dispose: vi.fn(),
  };
  let events: EngineEvents = { onLoading: () => undefined, onError: () => undefined };
  const save = vi.fn<(choice: MusicChoice) => void>();
  const music = new MusicSession({
    player,
    tracks,
    url: (entry) => `/music/${entry.file}`,
    createEngine: (handlers) => {
      events = handlers;
      return engine;
    },
    choice: { read: () => saved, save },
  });
  const detach = music.attach();
  const lastPlay = () => engine.play.mock.calls.at(-1);
  return { player, engine, music, save, detach, lastPlay, events: () => events };
}

const bed = (id: string): MusicTarget => ({ id, url: `/music/${id}.webm`, resume: true });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('MusicSession', () => {
  it('starts off, with the saved track and volume, and stays silent while narration plays', () => {
    const { music, engine, player } = setup();
    expect(music.getState()).toEqual({
      enabled: false,
      trackId: 'dusk',
      volume: 25,
      previewId: null,
      loadingId: null,
      error: null,
    });
    expect(engine.setVolume).toHaveBeenCalledWith(0.25);
    player.set({ document: doc('one'), status: 'playing' });
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('plays only after being turned on, and fades out when turned off', () => {
    const { music, engine, player, lastPlay } = setup();
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    expect(lastPlay()).toEqual([bed('dusk'), FADES.on]);
    music.setEnabled(true);
    expect(engine.play).toHaveBeenCalledTimes(1);
    music.setEnabled(false);
    expect(lastPlay()).toEqual([null, FADES.off]);
    expect(player.state.status).toBe('playing');
  });

  it('waits for the narration when turned on while paused', () => {
    const { music, engine, player, lastPlay } = setup();
    player.set({ document: doc('one'), status: 'paused' });
    music.setEnabled(true);
    expect(engine.play).not.toHaveBeenCalled();
    player.set({ status: 'loading' });
    expect(lastPlay()).toEqual([bed('dusk'), FADES.resume]);
  });

  it('pauses and resumes with the narration, and carries on across sentences', () => {
    const { music, engine, player, lastPlay } = setup();
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    // Next sentence, seeking, speed, voice and pace changes: the narration keeps going.
    player.set({ status: 'loading', segmentIndex: 1 });
    player.set({ status: 'playing', currentTime: 0.5 });
    player.set({ segmentIndex: 7, status: 'loading' });
    player.set({ rate: 1.5, voiceId: 'custom:studio', pace: 1.2, status: 'playing' });
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.setVolume).toHaveBeenCalledTimes(1);
    player.set({ status: 'paused' });
    expect(engine.play).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(lastPlay()).toEqual([null, FADES.pause]);
    player.set({ status: 'playing' });
    expect(lastPlay()).toEqual([bed('dusk'), FADES.resume]);
    player.set({ status: 'error' });
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(lastPlay()).toEqual([null, FADES.pause]);
  });

  it('plays straight through the pause a browser reports as each sentence ends', () => {
    const { music, engine, player } = setup();
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    for (let sentence = 1; sentence < 20; sentence += 1) {
      player.set({ status: 'paused' }); // 'pause' fires just before 'ended'
      player.set({ status: 'loading', segmentIndex: sentence });
      vi.advanceTimersByTime(50);
      player.set({ status: 'playing' });
    }
    vi.advanceTimersByTime(PAUSE_GRACE_MS * 2);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('turns off for a different document, or when none is loaded', () => {
    const { music, player, lastPlay } = setup();
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    player.set({ document: doc('two'), status: 'paused' });
    expect(music.getState().enabled).toBe(false);
    expect(lastPlay()).toEqual([null, FADES.off]);
    player.set({ status: 'playing' });
    expect(lastPlay()).toEqual([null, FADES.off]);
    music.setEnabled(true);
    player.set({ document: null, status: 'idle' });
    expect(music.getState().enabled).toBe(false);
  });

  it('keeps music for the same document loaded again (playing from another sentence)', () => {
    const { music, player } = setup();
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    player.set({ document: doc('one'), status: 'loading', segmentIndex: 4 });
    expect(music.getState().enabled).toBe(true);
  });

  it('turns off when the narration ends, and a replay starts without music', () => {
    const { music, player, lastPlay } = setup();
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    player.set({ status: 'ended' });
    expect(music.getState().enabled).toBe(false);
    expect(lastPlay()).toEqual([null, FADES.end]);
    player.set({ status: 'loading', segmentIndex: 0 });
    expect(music.getState().enabled).toBe(false);
  });

  it('can be turned on after the end, before replaying', () => {
    const { music, player, lastPlay } = setup();
    player.set({ document: doc('one'), status: 'ended' });
    music.setEnabled(true);
    player.set({ rate: 2 });
    expect(music.getState().enabled).toBe(true);
    player.set({ status: 'loading' });
    expect(lastPlay()).toEqual([bed('dusk'), FADES.resume]);
  });

  it('saves the chosen track and crossfades to it while playing', () => {
    const { music, player, save, engine, lastPlay } = setup();
    music.selectTrack('rain');
    expect(save).toHaveBeenLastCalledWith({ trackId: 'rain', volume: 25 });
    expect(engine.play).not.toHaveBeenCalled();
    expect(music.getState().enabled).toBe(false);
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    music.selectTrack('dusk');
    expect(lastPlay()).toEqual([bed('dusk'), FADES.change]);
    music.selectTrack('dusk');
    music.selectTrack('missing');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('changes only the music volume, clamped, rounded and saved', () => {
    const { music, engine, save } = setup();
    music.setVolume(42.4);
    expect(engine.setVolume).toHaveBeenLastCalledWith(0.42);
    expect(save).toHaveBeenLastCalledWith({ trackId: 'dusk', volume: 42 });
    music.setVolume(150);
    expect(music.getState().volume).toBe(100);
    music.setVolume(-3);
    expect(music.getState().volume).toBe(0);
    music.setVolume(Number.NaN);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it('previews a track for a while without turning music on', () => {
    const { music, player, lastPlay } = setup();
    player.set({ document: doc('one'), status: 'paused' });
    music.preview('rain');
    expect(lastPlay()).toEqual([{ ...bed('rain'), resume: false }, FADES.preview]);
    expect(music.getState()).toMatchObject({ previewId: 'rain', enabled: false });
    vi.advanceTimersByTime(PREVIEW_SECONDS * 1000);
    expect(music.getState().previewId).toBeNull();
    expect(lastPlay()).toEqual([null, FADES.preview]);
    music.preview('missing');
    expect(music.getState().previewId).toBeNull();
  });

  it('returns to the chosen track after a preview while narrating', () => {
    const { music, player, engine, lastPlay } = setup();
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    music.preview('rain');
    music.preview(null);
    expect(lastPlay()).toEqual([bed('dusk'), FADES.preview]);
    music.preview('dusk'); // the track already playing simply carries on
    expect(engine.play).toHaveBeenCalledTimes(3);
  });

  it('shows what is loading', () => {
    const { music, events } = setup();
    events().onLoading('rain');
    expect(music.getState().loadingId).toBe('rain');
  });

  it('turns off and explains when the chosen track fails', () => {
    const { music, player, events, lastPlay } = setup();
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    events().onError('dusk', 'failed');
    expect(music.getState()).toMatchObject({
      enabled: false,
      error: { trackId: 'dusk', message: 'Couldn’t play “Dusk”. The narration carries on.' },
    });
    expect(lastPlay()).toEqual([null, FADES.off]);
    music.setEnabled(true);
    expect(music.getState().error).toBeNull();
  });

  it('goes back to the chosen track when a preview fails', () => {
    const { music, player, events, lastPlay } = setup();
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    music.preview('rain');
    events().onError('rain', 'failed');
    expect(music.getState()).toMatchObject({ enabled: true, previewId: null });
    expect(lastPlay()).toEqual([bed('dusk'), FADES.off]);
    vi.advanceTimersByTime(PREVIEW_SECONDS * 1000);
    expect(music.getState().error?.trackId).toBe('rain');
  });

  it('explains a browser without Web Audio, and names an unknown track generically', () => {
    const { music, events } = setup();
    music.preview('rain');
    events().onError('rain', 'unavailable');
    expect(music.getState().error?.message).toBe(
      'Background music isn’t available in this browser.',
    );
    events().onError('gone', 'failed');
    expect(music.getState().error?.message).toContain('“this track”');
  });

  it('plays nothing when the saved track is not in the library', () => {
    const { music, player, engine } = setup({ tracks: [], saved: { trackId: '', volume: 10 } });
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('stops following the player, silences music and releases the engine when detached', () => {
    const { music, player, engine, detach } = setup();
    player.set({ document: doc('one'), status: 'playing' });
    music.setEnabled(true);
    music.preview('rain');
    detach();
    expect(engine.dispose).toHaveBeenCalled();
    expect(music.getState()).toMatchObject({ enabled: false, previewId: null });
    player.set({ status: 'paused' });
    vi.advanceTimersByTime(PREVIEW_SECONDS * 1000);
    expect(engine.play).toHaveBeenCalledTimes(2);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const { music } = setup();
    const listener = vi.fn();
    const unsubscribe = music.subscribe(listener);
    music.setVolume(30);
    unsubscribe();
    music.setVolume(40);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
