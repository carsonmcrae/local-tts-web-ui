// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the loop helpers the sound effects share.
 * Scope: A loop's audible bounds (skipping a decoder's digital silence at the edges, at most 0.2 s) and
 *   a loop whose seam is crossfaded so it joins without a jump whatever the decoder did there.
 * Does NOT belong: The engines that use them (features/music, features/sfx).
 */
import { describe, expect, it } from 'vitest';
import { fakeBuffer } from '@/test/audio';
import type { BufferLike } from './webAudio';
import { loopBounds, seamlessLoop } from './webAudio';

const RATE = 48_000;

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

describe('seamlessLoop', () => {
  /** One second of a 480 Hz tone: a whole number of periods, so it loops perfectly. */
  const tone = () =>
    Float32Array.from({ length: RATE }, (_, i) => Math.sin((2 * Math.PI * i) / 100));
  const bufferOf = (samples: Float32Array): BufferLike => ({
    duration: samples.length / RATE,
    length: samples.length,
    sampleRate: RATE,
    numberOfChannels: 1,
    getChannelData: () => samples,
  });
  const largestStep = (samples: Float32Array, from: number, to: number) => {
    let largest = 0;
    for (let i = from + 1; i < to; i += 1)
      largest = Math.max(largest, Math.abs(Number(samples[i]) - Number(samples[i - 1])));
    return largest;
  };

  it('joins without a jump where a decoder dropped the first samples (Chromium 156 drops 24)', () => {
    const samples = tone().slice(24);
    const normal = largestStep(samples, 0, samples.length);
    // Played sample-exactly, the loop would jump from its last sample straight to its first.
    expect(Math.abs(Number(samples[0]) - Number(samples.at(-1)))).toBeGreaterThan(10 * normal);
    const { start, end } = seamlessLoop(bufferOf(samples));
    expect(start).toBe(0);
    const last = Math.round(end * RATE);
    expect(last).toBe(samples.length - 1440);
    expect(Math.abs(Number(samples[0]) - Number(samples[last - 1]))).toBeLessThanOrEqual(normal);
    // Inside the 30 ms crossfade the wave stays as smooth as anywhere else in the track.
    expect(largestStep(samples, 0, 1441)).toBeLessThan(1.2 * normal);
  });

  it('crossfades a buffer once, however often it is looped', () => {
    const samples = tone().slice(24);
    const buffer = bufferOf(samples);
    const first = seamlessLoop(buffer);
    const blended = samples.slice();
    expect(seamlessLoop(buffer)).toBe(first);
    expect(samples).toEqual(blended);
  });

  it('stays inside the audible edges, and blends at most a quarter of a very short loop', () => {
    expect(seamlessLoop(fakeBuffer(10, 25))).toEqual({ start: 0.025, end: 9.945 });
    expect(seamlessLoop(fakeBuffer(0.1))).toEqual({ start: 0, end: 0.075 });
  });
});
