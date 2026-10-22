// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the loop helpers the sound effects share.
 * Scope: A loop's audible bounds (skipping a decoder's digital silence at the edges, at most 0.2 s).
 * Does NOT belong: The engines that use them (features/music, features/sfx).
 */
import { describe, expect, it } from 'vitest';
import { fakeBuffer } from '@/test/audio';
import { loopBounds } from './webAudio';

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
