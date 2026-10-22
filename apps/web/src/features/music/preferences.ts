// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Remember the chosen background track and music volume on this device.
 * Scope: Reads and writes them as a device setting (per device, like the theme: speakers and
 *   headphones differ), falling back to the first track and 10 % when nothing valid is saved. Whether
 *   music is on is deliberately never stored: every narration starts without music.
 * Does NOT belong: Applying the choice (session.ts) or the controls (MusicChannel).
 */
import { clampVolume, readDeviceSetting, saveDeviceSetting } from '@/lib/deviceSettings';

export interface MusicChoice {
  trackId: string;
  /** 0–100 %. */
  volume: number;
}

const DEFAULT_MUSIC_VOLUME = 10;
const STORAGE_KEY = 'ltts.music';

/** The saved choice, keeping only a track that still exists and a usable volume. */
export function readMusicChoice(trackIds: readonly string[]): MusicChoice {
  const saved = readDeviceSetting(STORAGE_KEY);
  const { trackId, volume } = (saved && typeof saved === 'object' ? saved : {}) as Partial<
    Record<keyof MusicChoice, unknown>
  >;
  return {
    trackId:
      typeof trackId === 'string' && trackIds.includes(trackId) ? trackId : (trackIds[0] ?? ''),
    volume: typeof volume === 'number' ? clampVolume(volume) : DEFAULT_MUSIC_VOLUME,
  };
}

export function saveMusicChoice(choice: MusicChoice): void {
  saveDeviceSetting(STORAGE_KEY, choice);
}
