// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Small settings kept on this device only (the audio mixer's levels and music choice).
 * Scope: Reads a JSON value from localStorage and saves one, treating unreadable, missing or blocked
 *   storage (private windows, full disks) as "nothing saved" so the caller's defaults apply, and
 *   whole-percent volumes clamped to 0–100.
 * Does NOT belong: What each setting means or its defaults (the features that own them), or settings
 *   shared by every device (server preferences).
 */

/** The saved value for `key`, or undefined when there is none or it can't be read. */
export function readDeviceSetting(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

export function saveDeviceSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the setting still applies until the page closes.
  }
}

/** A volume as a whole percentage from 0 to 100 (anything unusable counts as 0). */
export function clampVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.round(Math.min(Math.max(volume, 0), 100)) : 0;
}
