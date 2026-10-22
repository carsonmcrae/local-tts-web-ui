// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the saved sound-effects choice: volume and intensity on this device.
 * Scope: Defaults, a saved choice, unreadable storage, clamping, unknown intensities, and saving
 *   when storage refuses. Whether effects are on is never saved (session.test.ts covers that).
 * Does NOT belong: Playing effects.
 */
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SFX_VOLUME, isIntensity, readSfxChoice, saveSfxChoice } from './preferences';
import { clampVolume } from '@/lib/deviceSettings';

describe('sound-effects choice', () => {
  it('starts from the defaults and keeps what was saved', () => {
    expect(readSfxChoice()).toEqual({ volume: DEFAULT_SFX_VOLUME, intensity: 'balanced' });
    saveSfxChoice({ volume: 55, intensity: 'immersive' });
    expect(readSfxChoice()).toEqual({ volume: 55, intensity: 'immersive' });
  });

  it('ignores unreadable or unknown values', () => {
    localStorage.setItem('ltts.sfx', 'not json');
    expect(readSfxChoice()).toEqual({ volume: DEFAULT_SFX_VOLUME, intensity: 'balanced' });
    localStorage.setItem('ltts.sfx', JSON.stringify({ volume: 900, intensity: 'deafening' }));
    expect(readSfxChoice()).toEqual({ volume: 100, intensity: 'balanced' });
    localStorage.setItem('ltts.sfx', JSON.stringify({ volume: 'loud', intensity: 'minimal' }));
    expect(readSfxChoice()).toEqual({ volume: DEFAULT_SFX_VOLUME, intensity: 'minimal' });
  });

  it('clamps volumes and knows the intensities', () => {
    expect(clampVolume(-5)).toBe(0);
    expect(clampVolume(33.6)).toBe(34);
    expect(clampVolume(Number.NaN)).toBe(0);
    expect(isIntensity('balanced')).toBe(true);
    expect(isIntensity('loud')).toBe(false);
  });

  it('carries on when storage refuses to save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => saveSfxChoice({ volume: 10, intensity: 'minimal' })).not.toThrow();
  });
});
