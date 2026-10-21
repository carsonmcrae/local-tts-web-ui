// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Remember the chosen background track and music volume on this device.
 * Scope: Reads and writes them in localStorage (per device, like the theme: speakers and headphones
 *   differ), falling back to the first track and 10 % when nothing valid is saved. Whether music is
 *   on is deliberately never stored: every narration starts without music.
 * Does NOT belong: Applying the choice (session.ts) or the controls (MusicMenu).
 */

export interface MusicChoice {
  trackId: string;
  /** 0–100 %. */
  volume: number;
}

const DEFAULT_MUSIC_VOLUME = 10;
const STORAGE_KEY = 'ltts.music';

export function clampVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.round(Math.min(Math.max(volume, 0), 100)) : 0;
}

/** The saved choice, keeping only a track that still exists and a usable volume. */
export function readMusicChoice(trackIds: readonly string[]): MusicChoice {
  let saved: Partial<Record<keyof MusicChoice, unknown>> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as typeof saved;
  } catch {
    // Unreadable or unavailable storage: start from the defaults.
  }
  const trackId = typeof saved.trackId === 'string' ? saved.trackId : '';
  return {
    trackId: trackIds.includes(trackId) ? trackId : (trackIds[0] ?? ''),
    volume: typeof saved.volume === 'number' ? clampVolume(saved.volume) : DEFAULT_MUSIC_VOLUME,
  };
}

export function saveMusicChoice(choice: MusicChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Private window or full storage: the choice still applies until the page closes.
  }
}
