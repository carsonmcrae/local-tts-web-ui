// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the background-music choice remembered on this device.
 * Scope: Defaults, a saved track and volume, unknown tracks and bad values, unreadable or missing
 *   storage, and that turning music on is never part of what is saved.
 * Does NOT belong: Applying the choice (session.test.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampVolume, readMusicChoice, saveMusicChoice } from './preferences';

const IDS = ['rain', 'dusk'];

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('music preferences', () => {
  it('defaults to the first track at 10 %', () => {
    expect(readMusicChoice(IDS)).toEqual({ trackId: 'rain', volume: 10 });
    expect(readMusicChoice([])).toEqual({ trackId: '', volume: 10 });
  });

  it('remembers the track and volume, and nothing else', () => {
    saveMusicChoice({ trackId: 'dusk', volume: 35 });
    expect(JSON.parse(localStorage.getItem('ltts.music') ?? '')).toEqual({
      trackId: 'dusk',
      volume: 35,
    });
    expect(readMusicChoice(IDS)).toEqual({ trackId: 'dusk', volume: 35 });
  });

  it('ignores a track that no longer exists and bad volumes', () => {
    localStorage.setItem('ltts.music', JSON.stringify({ trackId: 'gone', volume: 250 }));
    expect(readMusicChoice(IDS)).toEqual({ trackId: 'rain', volume: 100 });
    localStorage.setItem('ltts.music', JSON.stringify({ trackId: 3, volume: '50', enabled: true }));
    expect(readMusicChoice(IDS)).toEqual({ trackId: 'rain', volume: 10 });
    localStorage.setItem('ltts.music', '{not json');
    expect(readMusicChoice(IDS)).toEqual({ trackId: 'rain', volume: 10 });
  });

  it('works without storage (private windows)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(readMusicChoice(IDS)).toEqual({ trackId: 'rain', volume: 10 });
    expect(() => saveMusicChoice({ trackId: 'dusk', volume: 20 })).not.toThrow();
  });

  it('clamps volumes to whole percentages', () => {
    expect([clampVolume(-1), clampVolume(12.6), clampVolume(101), clampVolume(Infinity)]).toEqual([
      0, 13, 100, 0,
    ]);
  });
});
