// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the background-music choice remembered on this device.
 * Scope: Defaults, a saved track and volume, unknown tracks and bad values, and that turning music on
 *   is never part of what is saved. Storage failures are covered by lib/deviceSettings.test.ts.
 * Does NOT belong: Applying the choice (session.test.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readMusicChoice, saveMusicChoice } from './preferences';

const IDS = ['rain', 'dusk'];

afterEach(() => localStorage.clear());

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

  it('ignores a track that no longer exists and bad values', () => {
    localStorage.setItem('ltts.music', JSON.stringify({ trackId: 'gone', volume: 250 }));
    expect(readMusicChoice(IDS)).toEqual({ trackId: 'rain', volume: 100 });
    localStorage.setItem('ltts.music', JSON.stringify({ trackId: 3, volume: '50', enabled: true }));
    expect(readMusicChoice(IDS)).toEqual({ trackId: 'rain', volume: 10 });
    localStorage.setItem('ltts.music', JSON.stringify('dusk'));
    expect(readMusicChoice(IDS)).toEqual({ trackId: 'rain', volume: 10 });
  });
});
