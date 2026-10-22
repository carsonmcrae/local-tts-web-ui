// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the Web Audio engine that plays sound effects beside the narration.
 * Scope: The graph (limiter, master volume), fetching and decoding once per sound with a bounded
 *   cache, one-shots and trimmed loops, the room for two one-shots and one loop, fades on stop,
 *   release of every node when a sound ends or is stopped, stopping while a sound still loads,
 *   failures (no Web Audio, a sound that won't load), idle suspension and disposal.
 * Does NOT belong: When effects play (session.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loopBounds } from '@/lib/audio/webAudio';
import { FakeAudioContext, fakeBuffer } from '@/test/audio';
import type { Cue, EngineDeps } from './engine';
import { KEEP_DECODED, MAX_GAIN, MAX_ONE_SHOTS, SfxEngine } from './engine';

const cue = (soundId: string, overrides: Partial<Cue> = {}): Cue => ({
  soundId,
  url: `/sfx/${soundId}.mp3`,
  loop: false,
  gain: 0.7,
  fade: 0.02,
  ...overrides,
});

function harness(overrides: Partial<EngineDeps> = {}, withLoading = true) {
  const context = new FakeAudioContext();
  const fetchSound = vi.fn(async () => new ArrayBuffer(8));
  const onError = vi.fn();
  const onLoading = vi.fn();
  const deps: EngineDeps = { createContext: () => context, fetchSound, onError, ...overrides };
  const engine = new SfxEngine(withLoading ? { ...deps, onLoading } : deps);
  return { context, engine, fetchSound, onError, onLoading };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sound-effects engine', () => {
  it('builds a limited graph on first use and plays a one-shot through it', async () => {
    const { context, engine, fetchSound, onLoading } = harness();
    engine.setVolume(0.4);
    engine.play('e1', cue('thud', { gain: 9 }));
    expect(engine.isPlaying('e1')).toBe(true);
    expect(onLoading).toHaveBeenLastCalledWith('e1');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSound).toHaveBeenCalledWith('/sfx/thud.mp3');
    expect(onLoading).toHaveBeenLastCalledWith(null);
    const [limiter] = context.compressors;
    expect(limiter?.threshold.target).toBe(-10);
    expect(limiter?.ratio.target).toBe(12);
    expect(context.gains[0]?.gain.target).toBe(0.4); // the master, at the volume set before
    const [source] = context.playing;
    expect(source?.loop).toBe(false);
    expect(source?.started).toEqual({ when: 0, offset: 0 });
    expect(context.gains[1]?.gain.target).toBe(MAX_GAIN); // the effect's gain, capped
    engine.setVolume(0.8);
    expect(context.gains[0]?.gain.target).toBe(0.8);
    source?.end();
    expect(engine.isPlaying('e1')).toBe(false);
    expect(context.connected.size).toBe(2); // only the limiter and master stay connected
  });

  it('decodes each sound once, keeps the recent ones and trims a loop to its audible part', async () => {
    const { context, engine, fetchSound } = harness();
    context.decode = () => Promise.resolve(fakeBuffer(4, 10));
    engine.play('rain', cue('rain-light', { loop: true }));
    await vi.advanceTimersByTimeAsync(0);
    const [source] = context.playing;
    expect(source?.loop).toBe(true);
    expect(source?.loopStart).toBe(0.01);
    expect(source?.loopEnd).toBe(3.99);
    expect(source?.started?.offset).toBe(0.01);
    engine.stop('rain', 0.5);
    engine.play('rain2', cue('rain-light', { loop: true }));
    expect(fetchSound).toHaveBeenCalledTimes(1); // decoded already
    expect(context.playing).toHaveLength(1);
    for (let n = 0; n < KEEP_DECODED + 2; n += 1) {
      engine.play(`s${n}`, cue(`sound-${n}`));
      await vi.advanceTimersByTimeAsync(0);
      engine.stop(`s${n}`, 0);
    }
    engine.play('again', cue('sound-0'));
    expect(fetchSound).toHaveBeenCalledTimes(KEEP_DECODED + 4); // sound-0 was evicted and fetched again
    expect(loopBounds(fakeBuffer(0.01, 10))).toEqual({ start: 0, end: 0.01 }); // silent throughout: whole length
  });

  it('allows two one-shots and one loop at a time, skipping the rest', async () => {
    const { context, engine } = harness();
    engine.play('a', cue('thud'));
    engine.play('b', cue('thud'));
    engine.play('c', cue('thud'));
    await vi.advanceTimersByTimeAsync(0);
    expect(context.playing).toHaveLength(MAX_ONE_SHOTS);
    expect(engine.isPlaying('c')).toBe(false);
    engine.play('l1', cue('rain-light', { loop: true }));
    engine.play('l2', cue('wind-howl', { loop: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(context.playing.filter((source) => source.loop)).toHaveLength(1);
    engine.play('a', cue('thud')); // already playing: nothing happens
    expect(context.playing).toHaveLength(3);
    engine.stop('a', 0.25);
    expect(context.playing).toHaveLength(2);
    engine.play('c', cue('thud'));
    await vi.advanceTimersByTimeAsync(0);
    expect(context.playing).toHaveLength(3);
    engine.stopAll(0.1);
    expect(context.playing).toHaveLength(0);
    context.advance(1);
    expect(context.connected.size).toBe(2);
  });

  it('never starts a sound that was stopped while loading, and reports one that fails', async () => {
    let resolveDecode: (buffer: ReturnType<typeof fakeBuffer>) => void = () => undefined;
    const { context, engine, onError, onLoading } = harness();
    context.decode = () => new Promise((resolve) => (resolveDecode = resolve));
    engine.play('e1', cue('thud'));
    engine.stop('e1', 0);
    expect(onLoading).toHaveBeenLastCalledWith(null);
    resolveDecode(fakeBuffer(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(context.playing).toHaveLength(0);
    context.decode = () => Promise.reject(new Error('bad file'));
    engine.play('e2', cue('broken'));
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith('broken', 'failed');
    expect(engine.isPlaying('e2')).toBe(false);
    engine.play('e3', cue('broken'));
    engine.stop('e3', 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1); // a stopped load fails silently
  });

  it('carries on when the browser refuses to resume, suspend or close the context', async () => {
    const { context, engine } = harness();
    context.state = 'suspended';
    context.resume = vi.fn(() => Promise.reject(new Error('blocked')));
    context.suspend = vi.fn(() => Promise.reject(new Error('blocked')));
    context.close = vi.fn(() => Promise.reject(new Error('blocked')));
    engine.play('a', cue('thud'));
    engine.play('b', cue('thud'));
    await flush();
    expect(context.resume).toHaveBeenCalled();
    context.playing[0]?.end(); // one ends while the other plays: no idle yet
    expect(context.playing).toHaveLength(1);
    context.playing[0]?.end();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(context.suspend).toHaveBeenCalled();
    engine.dispose();
    expect(context.close).toHaveBeenCalled();
  });

  it('reports a browser without Web Audio', () => {
    const { engine, onError } = harness({
      createContext: () => {
        throw new Error('no AudioContext');
      },
    });
    engine.play('e1', cue('thud'));
    expect(onError).toHaveBeenCalledWith('thud', 'unavailable');
    expect(engine.isPlaying('e1')).toBe(false);
  });

  it('sleeps when idle, wakes to play, and lets go of everything on dispose', async () => {
    const { context, engine } = harness({}, false);
    engine.play('e1', cue('thud'));
    await flush();
    context.playing[0]?.end();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(context.suspend).toHaveBeenCalled();
    engine.play('e2', cue('thud'));
    expect(context.resume).toHaveBeenCalled();
    await flush();
    engine.stop('e2', 0.1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(context.suspend).toHaveBeenCalledTimes(2);
    engine.play('e3', cue('fresh'));
    engine.dispose();
    expect(context.close).toHaveBeenCalled();
    expect(context.connected.size).toBe(0);
    await flush();
    expect(context.playing).toHaveLength(0); // the load that was in flight never starts
    engine.play('e4', cue('thud'));
    await flush();
    expect(context.playing).toHaveLength(1); // a fresh graph on the same fake context
  });
});
