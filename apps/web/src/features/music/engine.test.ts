// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the background-music engine against a fake Web Audio context.
 * Scope: Lazy context creation, fades and crossfades, one track at a time, sample-accurate loops
 *   that skip codec padding, pausing and resuming in place, superseded and failed loads, missing Web
 *   Audio, the decoded-track cache, idle suspension, disposal, and that faded-out nodes are released
 *   even after many on/off cycles.
 * Does NOT belong: When music plays (session.test.ts) or the controls (music.test.tsx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, fakeBuffer } from '@/test/audio';
import type { BufferLike, MusicTarget } from './engine';
import { loopBounds, MusicEngine } from './engine';

const A: MusicTarget = { id: 'a', url: '/music/a.webm', resume: true };
const B: MusicTarget = { id: 'b', url: '/music/b.webm', resume: true };
const C: MusicTarget = { id: 'c', url: '/music/c.webm', resume: true };

function setup(create?: () => FakeAudioContext) {
  const contexts: FakeAudioContext[] = [];
  const onLoading = vi.fn();
  const onError = vi.fn();
  const fetchTrack = vi.fn((url: string) => Promise.resolve(new TextEncoder().encode(url).buffer));
  const engine = new MusicEngine({
    onLoading,
    onError,
    fetchTrack,
    createContext: () => {
      const context = create?.() ?? new FakeAudioContext();
      contexts.push(context);
      return context;
    },
  });
  const context = () => contexts.at(-1) as FakeAudioContext;
  return { engine, contexts, context, onLoading, onError, fetchTrack };
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => vi.useRealTimers());

/** Let fetch and decode promises settle (microtasks only; timers are fake). */
async function flush() {
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
}

describe('MusicEngine', () => {
  it('creates the audio graph on first use and fades a looping track in', async () => {
    const { engine, contexts, context, onLoading } = setup();
    engine.setVolume(0.1);
    expect(contexts).toHaveLength(0);
    engine.play(A, 1.5);
    expect(onLoading).toHaveBeenLastCalledWith('a');
    await flush();
    expect(onLoading).toHaveBeenLastCalledWith(null);
    const [master, fade] = context().gains;
    expect(master?.gain.events[0]).toEqual({ type: 'set', value: 0.1, time: 0 });
    expect(master?.outputs.has(context().destination)).toBe(true);
    const source = context().sources[0];
    expect(source).toMatchObject({ loop: true, loopStart: 0, loopEnd: 60 });
    expect(source?.started).toEqual({ when: 0, offset: 0 });
    expect(source?.outputs.has(fade as never)).toBe(true);
    expect(fade?.gain.events).toEqual([
      { type: 'set', value: 0, time: 0 },
      { type: 'ramp', value: 1, time: 1.5 },
    ]);
  });

  it('has nothing to stop before anything played', async () => {
    const { engine, contexts } = setup();
    engine.play(null, 1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(contexts).toHaveLength(0);
  });

  it('ignores a request for the track that is already playing', async () => {
    const { engine, context, fetchTrack } = setup();
    engine.play(A, 1);
    await flush();
    engine.play(A, 1);
    await flush();
    expect(context().sources).toHaveLength(1);
    expect(fetchTrack).toHaveBeenCalledTimes(1);
  });

  it('ramps the volume without touching the track fades', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    context().currentTime = 4;
    engine.setVolume(0.35);
    const master = context().gains[0];
    expect(master?.gain.events.slice(-3)).toEqual([
      { type: 'cancel', value: Number.NaN, time: 4 },
      { type: 'set', value: 1, time: 4 },
      { type: 'ramp', value: 0.35, time: 4.08 },
    ]);
    expect(context().gains[1]?.gain.target).toBe(1);
  });

  it('crossfades between tracks and releases the old one once it is silent', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    context().currentTime = 10;
    engine.play(B, 2);
    await flush();
    const [first, second] = context().sources;
    const [, fadeA, fadeB] = context().gains;
    expect(fadeA?.gain.target).toBe(0);
    expect(first?.stoppedAt).toBe(12);
    expect(second?.started).toEqual({ when: 10, offset: 0 });
    expect(fadeB?.gain.events.at(-1)).toEqual({ type: 'ramp', value: 1, time: 12 });
    expect(context().playing).toEqual([second]);
    expect(context().connected.has(first as never)).toBe(true);
    context().advance(2);
    expect(context().connected.has(first as never)).toBe(false);
    expect(context().connected.has(fadeA as never)).toBe(false);
  });

  it('carries on from where a paused track stopped, and starts previews at the beginning', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    context().currentTime = 75; // 75 s into a 60 s loop: 15 s into the second time round
    engine.play(null, 0.5);
    context().advance(1);
    engine.play({ id: 'b', url: '/music/b.webm', resume: false }, 0.5);
    await flush();
    expect(context().sources[1]?.started?.offset).toBe(0);
    engine.play(null, 0.5);
    engine.play(A, 1);
    await flush();
    expect(context().sources[2]?.started?.offset).toBeCloseTo(15.5);
  });

  it('starts a track from its beginning when it was not the one paused', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    context().currentTime = 20;
    engine.play(null, 0.5);
    engine.play(B, 1);
    await flush();
    expect(context().sources[1]?.started?.offset).toBe(0);
  });

  it('never starts a track that was replaced or stopped while it loaded', async () => {
    const { engine, context, onLoading } = setup();
    engine.play(A, 1);
    engine.play(B, 1);
    await flush();
    expect(context().sources.map((source) => source.buffer !== null)).toEqual([true]);
    expect(context().playing).toHaveLength(1);
    engine.play(C, 1);
    engine.play(null, 1);
    await flush();
    expect(context().playing).toHaveLength(0);
    expect(onLoading).toHaveBeenLastCalledWith(null);
  });

  it('keeps the current track when asked for it again while another loads', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    engine.play(B, 1);
    engine.play(A, 1);
    await flush();
    expect(context().sources).toHaveLength(1);
    expect(context().playing).toHaveLength(1);
  });

  it('reports a track that fails to download or decode, and keeps what was playing', async () => {
    const { engine, context, fetchTrack, onError } = setup();
    engine.play(A, 1);
    await flush();
    fetchTrack.mockRejectedValueOnce(new Error('404'));
    engine.play(B, 1);
    await flush();
    expect(onError).toHaveBeenCalledWith('b', 'failed');
    context().decode = () => Promise.reject(new Error('corrupt'));
    engine.play(C, 1);
    await flush();
    expect(onError).toHaveBeenCalledWith('c', 'failed');
    expect(context().playing).toHaveLength(1);
    expect(context().sources[0]?.stoppedAt).toBeNull();
  });

  it('ignores a failure of a load that was already replaced', async () => {
    const { engine, fetchTrack, onError } = setup();
    fetchTrack.mockRejectedValueOnce(new Error('404'));
    engine.play(A, 1);
    engine.play(null, 1);
    await flush();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a browser without Web Audio', () => {
    const { engine, onError } = setup(() => {
      throw new ReferenceError('AudioContext is not defined');
    });
    engine.play(A, 1);
    expect(onError).toHaveBeenCalledWith('a', 'unavailable');
  });

  it('keeps the two most recent decoded tracks and fetches older ones again', async () => {
    const { engine, fetchTrack } = setup();
    for (const target of [A, B, C, B, A]) {
      engine.play(target, 1);
      await flush();
    }
    expect(fetchTrack.mock.calls.map(([url]) => url)).toEqual([
      '/music/a.webm',
      '/music/b.webm',
      '/music/c.webm',
      '/music/a.webm',
    ]);
  });

  it('never drops the playing track from the cache', async () => {
    const { engine, fetchTrack } = setup();
    engine.play(A, 1);
    await flush();
    engine.play(B, 1);
    engine.play(A, 1); // back to A while B loads: B is decoded but never played
    await flush();
    engine.play(C, 1);
    await flush(); // C arrives while A still plays: B goes, A stays
    engine.play(A, 1);
    engine.play(B, 1);
    await flush();
    expect(fetchTrack.mock.calls.map(([url]) => url)).toEqual([
      '/music/a.webm',
      '/music/b.webm',
      '/music/c.webm',
      '/music/b.webm',
    ]);
  });

  it('carries on when the browser refuses to suspend, resume or close the audio', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    const refuse = () => Promise.reject(new DOMException('refused', 'InvalidStateError'));
    context().suspend.mockImplementation(refuse);
    context().resume.mockImplementation(refuse);
    context().close.mockImplementation(refuse);
    engine.play(null, 1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(context().suspend).toHaveBeenCalled();
    context().state = 'suspended';
    engine.play(B, 1);
    expect(context().resume).toHaveBeenCalled();
    engine.dispose();
    await flush();
    expect(context().close).toHaveBeenCalled();
  });

  it('shares one download between requests for the same track', async () => {
    const { engine, fetchTrack } = setup();
    engine.play(A, 1);
    engine.play(null, 1);
    engine.play(A, 1);
    await flush();
    expect(fetchTrack).toHaveBeenCalledTimes(1);
  });

  it('lets the audio device sleep when nothing plays, and wakes it for the next track', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    engine.play(null, 1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(context().suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(context().suspend).toHaveBeenCalledTimes(1);
    engine.play(A, 1);
    expect(context().resume).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(context().suspend).toHaveBeenCalledTimes(1);
  });

  it('does not suspend while a track is loading', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    engine.play(null, 1);
    let release: (buffer: BufferLike) => void = () => undefined;
    context().decode = () => new Promise((resolve) => (release = resolve));
    engine.play(B, 1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(context().suspend).not.toHaveBeenCalled();
    release(fakeBuffer(30));
    await flush();
    expect(context().playing).toHaveLength(1);
  });

  it('releases everything on dispose and builds a new graph when played again', async () => {
    const { engine, contexts, context } = setup();
    engine.play(A, 1);
    await flush();
    engine.play(B, 1);
    await flush();
    engine.dispose();
    expect(contexts[0]?.close).toHaveBeenCalled();
    expect(contexts[0]?.connected.size).toBe(1); // only the old master gain, closed with its context
    engine.play(A, 1);
    await flush();
    expect(contexts).toHaveLength(2);
    expect(context().playing).toHaveLength(1);
  });

  it('drops a load that finishes after dispose', async () => {
    const { engine, contexts } = setup();
    engine.play(A, 1);
    engine.dispose();
    await flush();
    expect(contexts[0]?.sources).toHaveLength(0);
    engine.dispose();
  });

  it('does not grow the graph over many on/off cycles', async () => {
    const { engine, context } = setup();
    for (let cycle = 0; cycle < 50; cycle += 1) {
      engine.play(cycle % 2 ? B : A, 0.5);
      await flush();
      engine.play(null, 0.5);
      context().advance(1);
    }
    expect(context().playing).toHaveLength(0);
    expect(context().connected.size).toBe(1); // the master gain only
  });
});

describe('loopBounds', () => {
  it('skips digital silence a decoder left at the edges', () => {
    expect(loopBounds(fakeBuffer(10, 25))).toEqual({ start: 0.025, end: 9.975 });
  });

  it('never trims more than 0.2 s from either edge', () => {
    expect(loopBounds(fakeBuffer(10, 500, 1))).toEqual({ start: 0.2, end: 9.8 });
  });

  it('keeps the whole track when it is silent throughout', () => {
    const silent = fakeBuffer(0.2, 100);
    expect(loopBounds(silent)).toEqual({ start: 0, end: 0.2 });
  });
});
