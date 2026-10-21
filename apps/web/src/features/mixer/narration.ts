// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The narration channel of the audio mixer: its level, kept on this device.
 * Scope: Reads and saves the narration volume (0–100 %, 100 when nothing is saved) and tells whether
 *   this browser lets a page change an audio element's volume at all (iPhone and iPad leave it to the
 *   device's buttons).
 * Does NOT belong: Applying it to the audio element (PlaybackController.setVolume) or the controls
 *   (MixerMenu).
 */
import { clampVolume, readDeviceSetting, saveDeviceSetting } from '@/lib/deviceSettings';

const STORAGE_KEY = 'ltts.narrationVolume';

export function readNarrationVolume(): number {
  const saved = readDeviceSetting(STORAGE_KEY);
  return typeof saved === 'number' ? clampVolume(saved) : 100;
}

export function saveNarrationVolume(volume: number): void {
  saveDeviceSetting(STORAGE_KEY, clampVolume(volume));
}

/** False where the browser keeps every audio element at full volume (the device sets the level). */
export function narrationVolumeAdjustable(): boolean {
  try {
    const probe = new Audio();
    probe.volume = 0.5;
    return probe.volume === 0.5;
  } catch {
    return false;
  }
}
