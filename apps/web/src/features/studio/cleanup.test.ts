// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for describing a recording cleanup and remembering the last one used.
 * Scope: Plain-language descriptions for one to four settings; whether a cleanup changes anything;
 *   the remembered cleanup (clamped, ignored when missing or unreadable, and storage that refuses);
 *   and where a new recording's cleanup starts.
 * Does NOT belong: The cleanup controls (studio session and flow tests).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeCleanup,
  isActive,
  NO_CLEANUP,
  rememberCleanup,
  rememberedCleanup,
  sameCleanup,
  startingCleanup,
} from './cleanup';

const noisy = { ...NO_CLEANUP, noiseReduction: 0.75 };

afterEach(() => vi.restoreAllMocks());

describe('Recording cleanup', () => {
  it('describes one, two or all of its settings in plain words', () => {
    expect(describeCleanup(NO_CLEANUP)).toBe('no changes');
    expect(describeCleanup(noisy)).toBe('background noise reduced by 75%');
    expect(describeCleanup({ ...NO_CLEANUP, lowCut: true, bassDb: 3 })).toBe(
      'low rumble filtered out and low end raised by 3 dB',
    );
    expect(describeCleanup({ noiseReduction: 0.5, lowCut: true, trebleDb: -4.5, bassDb: 1 })).toBe(
      'background noise reduced by 50%, low rumble filtered out, treble lowered by 4.5 dB and low end raised by 1 dB',
    );
  });

  it('knows when a cleanup changes anything', () => {
    expect(isActive(NO_CLEANUP)).toBe(false);
    for (const change of [
      { noiseReduction: 0.1 },
      { lowCut: true },
      { trebleDb: -1 },
      { bassDb: 1 },
    ])
      expect(isActive({ ...NO_CLEANUP, ...change })).toBe(true);
    expect(sameCleanup(noisy, { ...noisy })).toBe(true);
    expect(sameCleanup(noisy, NO_CLEANUP)).toBe(false);
  });

  it('starts from the last cleanup used, then the suggestion, then off', () => {
    expect(startingCleanup(null)).toEqual(NO_CLEANUP);
    expect(startingCleanup(noisy)).toEqual(noisy);
    rememberCleanup({ ...NO_CLEANUP, lowCut: true });
    expect(startingCleanup(noisy)).toEqual({ ...NO_CLEANUP, lowCut: true });
  });

  it('reads only sensible remembered values', () => {
    localStorage.setItem(
      'ltts.cleanup',
      JSON.stringify({ noiseReduction: 4, lowCut: 'yes', trebleDb: -20, bassDb: 'loud' }),
    );
    expect(rememberedCleanup()).toEqual({
      noiseReduction: 1,
      lowCut: false,
      trebleDb: -9,
      bassDb: 0,
    });
    localStorage.setItem('ltts.cleanup', '{not json');
    expect(rememberedCleanup()).toBeNull();
  });

  it('carries on without storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => rememberCleanup(noisy)).not.toThrow();
    expect(rememberedCleanup()).toBeNull();
  });
});
