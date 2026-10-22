// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for how the background-music engine plays a track as chunks, against a fake Web Audio context.
 * Scope: Lazy context creation; a track played as its chunks on one frame-exact timeline, each join
 *   crossfaded over 10 ms of the music the next chunk carries, and the last chunk leading into the
 *   first; a chunk's music found whatever a decoder trimmed from its start; late chunks; at most two
 *   chunks held per track; pausing and resuming in place across chunks, and previews from the start.
 * Does NOT belong: When music plays (session.test.ts) or the controls (music.test.tsx).
 */
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { BufferLike } from '@/lib/audio/webAudio';
import { FakeAudioContext } from '@/test/audio';
import { A, B, chunk, finishChunk, flush, heard, setup, track } from '@/test/musicEngine';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => vi.useRealTimers());

/**
 * Play track A and let its first two chunks end (at 20 s and 40 s) while its third is still
 * decoding; `arrive` delivers the third at `at` seconds.
 */
async function stallThird() {
  const env = setup();
  env.engine.play(A, 1);
  await flush();
  let release: (buffer: BufferLike) => void = () => undefined;
  env.context().decode = () => new Promise((resolve) => (release = resolve));
  await finishChunk(env.context()); // the first ends at 20 s; the third is asked for
  await finishChunk(env.context()); // the second ends at 40 s while the third still decodes
  const arrive = async (at: number) => {
    env.context().currentTime = at;
    release(chunk());
    await flush();
  };
  return { ...env, arrive };
}

describe('MusicEngine chunks', () => {
  it('creates the audio graph on first use and fades the first chunk in', async () => {
    const { engine, contexts, context, onLoading, fetched } = setup();
    engine.setVolume(0.1);
    expect(contexts).toHaveLength(0);
    engine.play(A, 1.5);
    expect(onLoading).toHaveBeenLastCalledWith('a');
    await flush();
    expect(onLoading).toHaveBeenLastCalledWith(null);
    const [master, fade, join] = context().gains;
    expect(master?.gain.events[0]).toEqual({ type: 'set', value: 0.1, time: 0 });
    expect(master?.outputs.has(context().destination)).toBe(true);
    expect(fade?.gain.events).toEqual([
      { type: 'set', value: 0, time: 0 },
      { type: 'ramp', value: 1, time: 1.5 },
    ]);
    const first = context().sources[0];
    // The music starts after the 20 ms of the last chunk it carries, and plays for its 20 s.
    expect(first?.started).toEqual({ when: 0, offset: 0.02, duration: 20 });
    expect(first?.loop).toBe(false);
    expect(first?.outputs.has(join as never)).toBe(true);
    expect(join?.outputs.has(fade as never)).toBe(true);
    // It fades out over its last 10 ms, under the next chunk's fade-in.
    expect(join?.gain.events).toEqual([
      { type: 'set', value: 1, time: 19.99 },
      { type: 'ramp', value: 0, time: 20 },
    ]);
    expect(fetched()).toEqual(['/music/a/1.webm', '/music/a/2.webm']);
  });

  it('crossfades each chunk into the next over the copy of its start the previous one carries', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    const second = context().sources[1];
    const join = context().gains[3];
    // 10 ms early, on the last 10 ms of the 20 ms it carries before its own music.
    expect(heard(second).from).toBeCloseTo(19.99);
    expect(heard(second).offset).toBeCloseTo(0.01);
    expect(heard(second).to).toBeCloseTo(40);
    expect(join?.gain.events.map(({ type, value }) => [type, value])).toEqual([
      ['set', 0],
      ['ramp', 1],
      ['set', 1],
      ['ramp', 0],
    ]);
    expect(join?.gain.events.map(({ time }) => time)).toEqual([
      expect.closeTo(19.99),
      20,
      expect.closeTo(39.99),
      40,
    ]);
  });

  it('holds two chunks at a time and loops from the last chunk to the first', async () => {
    const { engine, context, fetched } = setup();
    engine.play(A, 1);
    await flush();
    expect(context().playing).toHaveLength(2);
    await finishChunk(context());
    expect(context().playing).toHaveLength(2);
    expect(fetched()).toEqual(['/music/a/1.webm', '/music/a/2.webm', '/music/a/3.webm']);
    await finishChunk(context());
    // After the third chunk comes the first again, still decoded.
    expect(fetched()).toHaveLength(3);
    const again = context().sources[3];
    expect(again?.buffer).toBe(context().sources[0]?.buffer);
    expect(heard(again).from).toBeCloseTo(59.99);
    expect(heard(again).offset).toBeCloseTo(0.01);
    expect(context().playing).toHaveLength(2);
  });

  it('plays a single-chunk track round and round', async () => {
    const { engine, context, fetched } = setup();
    engine.play(track('one', 1), 1);
    await flush();
    await finishChunk(context());
    expect(fetched()).toEqual(['/music/one/1.webm']);
    expect(context().sources.map((source) => heard(source).from)).toEqual([
      0,
      expect.closeTo(19.99),
      expect.closeTo(39.99),
    ]);
  });

  it('finds the music in a chunk a decoder trimmed at the start (Chromium 156 drops 24 frames)', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    context().decode = () => Promise.resolve(chunk(0.005));
    await flush();
    expect(heard(context().sources[0]).offset).toBeCloseTo(0.015);
    expect(heard(context().sources[1]).offset).toBeCloseTo(0.005);
  });

  it('shortens the crossfade when a decoder left less than 10 ms before the music', async () => {
    const { engine, context } = setup(() => {
      const made = new FakeAudioContext();
      made.decode = () => Promise.resolve(chunk(0.015));
      return made;
    });
    engine.play(A, 1);
    await flush();
    const second = context().sources[1];
    expect(heard(second).from).toBeCloseTo(19.995);
    expect(heard(second).offset).toBe(0);
    expect(heard(second).to).toBeCloseTo(40);
  });

  it('ignores frames a decoder added: the music never starts past the edge it carries', async () => {
    const { engine, context } = setup(() => {
      const made = new FakeAudioContext();
      made.decode = () => Promise.resolve(chunk(-0.01));
      return made;
    });
    engine.play(A, 1);
    await flush();
    expect(heard(context().sources[0]).offset).toBeCloseTo(0.02);
  });

  it('starts a chunk that decoded late as soon as its join fits, asking for it only once', async () => {
    const { context, fetchTrack, arrive } = await stallThird();
    expect(fetchTrack).toHaveBeenCalledTimes(3);
    expect(context().playing).toHaveLength(0);
    await arrive(43);
    const late = context().sources[2];
    expect(heard(late).from).toBeCloseTo(43);
    expect(heard(late).offset).toBeCloseTo(0.01);
    expect(heard(late).to).toBeCloseTo(63.01);
    // Nothing else was queued, so the chunk after it (the first, still decoded) follows at once.
    expect(context().playing).toHaveLength(2);
    expect(fetchTrack).toHaveBeenCalledTimes(3);
  });

  it('carries on from where a paused track stopped, in the right chunk, and starts previews at the beginning', async () => {
    const { engine, context, fetched } = setup();
    engine.play(A, 1);
    await flush();
    context().currentTime = 105; // 105.5 s into a 60 s loop: 45.5 s, 5.5 s into the third chunk
    engine.play(null, 0.5);
    context().advance(1);
    engine.play(track('b', 3, 20, false), 0.5);
    await flush();
    expect(context().sources.at(-2)?.started?.offset).toBeCloseTo(0.02);
    engine.play(null, 0.5);
    engine.play(A, 1);
    await flush();
    const resumed = context().sources.at(-2);
    expect(fetched().at(-2)).toBe('/music/a/3.webm');
    expect(heard(resumed).offset).toBeCloseTo(0.02 + 5.5);
    expect(heard(resumed).to - heard(resumed).from).toBeCloseTo(14.5);
    // Its first chunk follows when the third ends.
    expect(fetched().at(-1)).toBe('/music/a/1.webm');
  });

  it('keeps the place after a late chunk moved the timeline', async () => {
    const { engine, context, arrive } = await stallThird();
    await arrive(42); // 2.01 s late: the third chunk is heard from 42.01 s, not 40 s
    context().currentTime = 50;
    engine.play(null, 0); // a 0.01 s fade: paused 48 s into the loop, 8 s into the third chunk
    engine.play(A, 1);
    await flush();
    expect(heard(context().sources.at(-2)).offset).toBeCloseTo(0.02 + 8);
  });

  it('starts a track from its beginning when it was not the one paused', async () => {
    const { engine, context } = setup();
    engine.play(A, 1);
    await flush();
    context().currentTime = 20;
    engine.play(null, 0.5);
    engine.play(B, 1);
    await flush();
    expect(context().sources.at(-2)?.started?.offset).toBeCloseTo(0.02);
  });
});
