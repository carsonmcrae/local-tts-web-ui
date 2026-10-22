// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the background-music engine around its tracks: changes, failures, the cache and clean-up.
 * Scope: Fades and crossfades between tracks (never more than two), volume, superseded and failed loads,
 *   missing Web Audio, three decoded chunks kept, shared downloads, idle suspension and refusals,
 *   disposal (the master gain too), and that every faded-out node is released, even after many on/off
 *   cycles.
 * Does NOT belong: When music plays (session.test.ts) or the controls (music.test.tsx).
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BufferLike } from '@/lib/audio/webAudio';
import { A, B, C, chunk, finishChunk, flush, setup } from '@/test/musicEngine';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => vi.useRealTimers());

describe('MusicEngine lifecycle', () => {
  it('has nothing to stop before anything played', async () => {
    const { engine, contexts } = setup();
    engine.play(null, 1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(contexts).toHaveLength(0);
  });

  it('says nothing about a next chunk that fails after its track stopped', async () => {
    const { engine, fetchTrack, onError } = setup();
    let fail: (reason: Error) => void = () => undefined;
    fetchTrack.mockImplementation((url: string) =>
      url.endsWith('/2.webm')
        ? new Promise((_, reject) => (fail = reject))
        : Promise.resolve(new TextEncoder().encode(url).buffer),
    );
    engine.play(A, 1);
    await flush();
    engine.play(null, 1);
    fail(new Error('404'));
    await flush();
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignores a request for the track that is already playing', async () => {
    const { engine, context, fetchTrack } = setup();
    engine.play(A, 1);
    await flush();
    engine.play(A, 1);
    await flush();
    expect(context().sources).toHaveLength(2);
    expect(fetchTrack).toHaveBeenCalledTimes(2);
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

  it('crossfades between tracks and releases every node of the old one once it is silent', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    context().currentTime = 10;
    engine.play(B, 2);
    await flush();
    const [a1, a2, b1] = context().sources;
    const [, fadeA, joinA1, joinA2, fadeB] = context().gains;
    expect(fadeA?.gain.target).toBe(0);
    expect([a1?.stoppedAt, a2?.stoppedAt]).toEqual([12, 12]);
    expect(b1?.started).toEqual({ when: 10, offset: 0.02, duration: 20 });
    expect(fadeB?.gain.events.at(-1)).toEqual({ type: 'ramp', value: 1, time: 12 });
    context().advance(2);
    for (const node of [a1, a2, joinA1, joinA2, fadeA])
      expect(context().connected.has(node as never)).toBe(false);
    expect(context().playing).toHaveLength(2);
  });

  it('never overlaps more than two tracks, however fast they change', async () => {
    const { engine, context } = setup();
    for (const target of [A, B, C]) {
      engine.play(target, 1);
      await flush();
    }
    context().currentTime = 0.5;
    engine.play(null, 1);
    const [a1, a2, b1, b2, c1, c2] = context().sources;
    expect([c1?.stoppedAt, c2?.stoppedAt]).toEqual([1.5, 1.5]);
    expect([a1, a2, b1, b2].map((source) => source?.stoppedAt)).toEqual([0.55, 0.55, 0.55, 0.55]);
    expect(context().gains[1]?.gain.events.at(-1)).toEqual({ type: 'ramp', value: 0, time: 0.55 });
  });

  it('lets the first stop stand where a browser refuses a second one', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    context().strictStop = true;
    engine.play(null, 2);
    engine.play(A, 1);
    expect(() => engine.play(null, 1)).not.toThrow();
    expect(context().sources[0]?.stoppedAt).toBe(2);
  });

  it('never starts a track that was replaced or stopped while it loaded', async () => {
    const { engine, context, onLoading } = setup();
    engine.play(A, 1);
    engine.play(B, 1);
    await flush();
    expect(context().sources.every((source) => source.buffer !== null)).toBe(true);
    expect(context().playing).toHaveLength(2);
    expect(context().playing.every((source) => source.started?.when === 0)).toBe(false);
    engine.play(C, 1);
    engine.play(null, 1);
    await flush();
    context().advance(1);
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
    expect(context().sources).toHaveLength(2);
    expect(context().playing).toHaveLength(2);
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
    expect(context().playing).toHaveLength(2);
    expect(context().sources[0]?.stoppedAt).toBeNull();
  });

  it('reports a later chunk that fails, and stays quiet about one whose track is gone', async () => {
    const { engine, fetchTrack, onError } = setup();
    fetchTrack.mockImplementation((url: string) =>
      url.endsWith('/2.webm')
        ? Promise.reject(new Error('404'))
        : Promise.resolve(new TextEncoder().encode(url).buffer),
    );
    engine.play(A, 1);
    await flush();
    expect(onError).toHaveBeenCalledWith('a', 'failed');
    onError.mockClear();
    let fail: (reason: Error) => void = () => undefined;
    fetchTrack.mockImplementation(() => new Promise((_, reject) => (fail = reject)));
    engine.play(B, 1); // B's first chunk is still decoding when the track changes
    engine.play(C, 1);
    fail(new Error('404'));
    await flush();
    expect(onError).not.toHaveBeenCalledWith('b', 'failed');
  });

  it('drops a next chunk that arrives after its track was stopped', async () => {
    const { engine, context } = setup();
    let release: (buffer: BufferLike) => void = () => undefined;
    engine.play(A, 1);
    context().decode = () => Promise.resolve(chunk());
    await flush();
    context().decode = () => new Promise((resolve) => (release = resolve));
    await finishChunk(context()); // asks for the third
    engine.play(null, 1);
    release(chunk());
    await flush();
    expect(context().sources).toHaveLength(2);
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

  it('keeps the three most recently used chunks decoded and fetches older ones again', async () => {
    const { engine, fetched } = setup();
    for (const target of [A, B, A]) {
      engine.play(target, 1);
      await flush();
    }
    // Four chunks fetched, three kept: a1 went for b2, and a2 for a1 when A came back.
    expect(fetched()).toEqual([
      '/music/a/1.webm',
      '/music/a/2.webm',
      '/music/b/1.webm',
      '/music/b/2.webm',
      '/music/a/1.webm',
      '/music/a/2.webm',
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

  it('shares one download between requests for the same chunk', async () => {
    const { engine, fetchTrack } = setup();
    engine.play(A, 1);
    engine.play(null, 1);
    engine.play(A, 1);
    await flush();
    expect(fetchTrack.mock.calls.filter(([url]) => url === '/music/a/1.webm')).toHaveLength(1);
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
    release(chunk());
    await flush();
    expect(context().playing.length).toBeGreaterThan(0);
  });

  it('releases every node on dispose, the master gain too, and builds a new graph when played again', async () => {
    const { engine, contexts, context } = setup();
    engine.play(A, 1);
    await flush();
    engine.play(B, 1);
    await flush();
    engine.dispose();
    expect(contexts[0]?.close).toHaveBeenCalled();
    expect(contexts[0]?.connected.size).toBe(0);
    engine.play(A, 1);
    await flush();
    expect(contexts).toHaveLength(2);
    expect(context().playing).toHaveLength(2);
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

  it('releases a faded-out track only once its last chunk has ended', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    engine.play(null, 1);
    const [first, second] = context().sources;
    first?.end();
    expect(context().connected.has(context().gains[1] as never)).toBe(true);
    second?.end();
    expect(context().connected.has(context().gains[1] as never)).toBe(false);
  });
});
