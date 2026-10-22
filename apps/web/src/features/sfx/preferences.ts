// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Remember the sound-effects volume and intensity on this device.
 * Scope: Reads and writes them in localStorage (per device, like the theme and the music choice),
 *   falling back to 40 % and "balanced" when nothing valid is saved. Whether effects are on is
 *   deliberately never stored: every narration starts without them. Also the intensity presets
 *   the interface offers and the gain each applies on top of the volume.
 * Does NOT belong: Applying the choice (session.ts) or the controls (SoundPanel).
 */

export type Intensity = 'minimal' | 'balanced' | 'immersive';

export interface SfxChoice {
  /** 0–100 %. */
  volume: number;
  intensity: Intensity;
}

export const DEFAULT_SFX_VOLUME = 40;
export const INTENSITIES: readonly { id: Intensity; label: string; hint: string }[] = [
  { id: 'minimal', label: 'Minimal', hint: 'A few effects, only the surest' },
  { id: 'balanced', label: 'Balanced', hint: 'Some effects, well spaced' },
  { id: 'immersive', label: 'Immersive', hint: 'More effects, a little louder' },
];
/** How much louder or softer an intensity plays effects, on top of the volume. */
export const INTENSITY_GAIN: Readonly<Record<Intensity, number>> = {
  minimal: 0.8,
  balanced: 1,
  immersive: 1.15,
};
/** The longest an ambience plays from one start, in seconds, by intensity (matches the server). */
export const AMBIENCE_SECONDS: Readonly<Record<Intensity, number>> = {
  minimal: 90,
  balanced: 150,
  immersive: 240,
};
const STORAGE_KEY = 'ltts.sfx';

export function clampVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.round(Math.min(Math.max(volume, 0), 100)) : 0;
}

export function isIntensity(value: unknown): value is Intensity {
  return INTENSITIES.some((intensity) => intensity.id === value);
}

/** The saved choice, keeping only a usable volume and a known intensity. */
export function readSfxChoice(): SfxChoice {
  let saved: Partial<Record<keyof SfxChoice, unknown>> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as typeof saved;
  } catch {
    // Unreadable or unavailable storage: start from the defaults.
  }
  return {
    volume: typeof saved.volume === 'number' ? clampVolume(saved.volume) : DEFAULT_SFX_VOLUME,
    intensity: isIntensity(saved.intensity) ? saved.intensity : 'balanced',
  };
}

export function saveSfxChoice(choice: SfxChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Private window or full storage: the choice still applies until the page closes.
  }
}
