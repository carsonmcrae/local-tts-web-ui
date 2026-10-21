// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for settings kept on this device and the narration channel's saved level.
 * Scope: Reading and saving JSON values, unreadable or blocked storage, whole-percent volumes, the
 *   narration volume's default and range, and detecting browsers that fix an audio element's volume.
 * Does NOT belong: Music choices (music/preferences.test.ts) or the mixer's controls (music.test.tsx).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  narrationVolumeAdjustable,
  readNarrationVolume,
  saveNarrationVolume,
} from '@/features/mixer/narration';
import { clampVolume, readDeviceSetting, saveDeviceSetting } from './deviceSettings';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('device settings', () => {
  it('reads back what was saved, and nothing when it is missing or unreadable', () => {
    saveDeviceSetting('ltts.test', { level: 3 });
    expect(readDeviceSetting('ltts.test')).toEqual({ level: 3 });
    expect(readDeviceSetting('ltts.missing')).toBeUndefined();
    localStorage.setItem('ltts.test', '{broken');
    expect(readDeviceSetting('ltts.test')).toBeUndefined();
  });

  it('works without storage (private windows, full disks)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(readDeviceSetting('ltts.test')).toBeUndefined();
    expect(() => saveDeviceSetting('ltts.test', 1)).not.toThrow();
  });

  it('keeps volumes to whole percentages from 0 to 100', () => {
    expect([clampVolume(-1), clampVolume(12.6), clampVolume(101), clampVolume(Infinity)]).toEqual([
      0, 13, 100, 0,
    ]);
  });
});

describe('narration level', () => {
  it('is 100 % until changed, then the saved whole percentage', () => {
    expect(readNarrationVolume()).toBe(100);
    saveNarrationVolume(72.4);
    expect(readNarrationVolume()).toBe(72);
    localStorage.setItem('ltts.narrationVolume', '"loud"');
    expect(readNarrationVolume()).toBe(100);
  });

  it('knows whether this browser lets a page set an audio element’s volume', () => {
    expect(narrationVolumeAdjustable()).toBe(true);
    vi.stubGlobal(
      'Audio',
      class {
        constructor() {
          throw new Error('no audio here');
        }
      },
    );
    expect(narrationVolumeAdjustable()).toBe(false);
  });
});
