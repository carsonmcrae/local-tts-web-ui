// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: A recording cleanup (noise reduction, rumble filter, tone) in plain words, and the one
 *   used last on this device.
 * Scope: "background noise reduced by 50% and treble lowered by 4.5 dB" from a cleanup's settings;
 *   whether a cleanup changes anything; remembering the last cleanup used so the next recording
 *   starts from it (the microphone and room are usually the same), falling back to the suggestion.
 * Does NOT belong: Measuring or applying the cleanup (the server) or its controls (CleanupPanel).
 */
import type { Cleanup } from '@/api/types';

export const NO_CLEANUP: Cleanup = { noiseReduction: 0, lowCut: false, trebleDb: 0, bassDb: 0 };
const STORAGE_KEY = 'ltts.cleanup';

export function isActive(cleanup: Cleanup): boolean {
  return cleanup.noiseReduction > 0 || cleanup.lowCut || cleanup.trebleDb < 0 || cleanup.bassDb > 0;
}

export function sameCleanup(a: Cleanup, b: Cleanup): boolean {
  return (
    a.noiseReduction === b.noiseReduction &&
    a.lowCut === b.lowCut &&
    a.trebleDb === b.trebleDb &&
    a.bassDb === b.bassDb
  );
}

export function describeCleanup(cleanup: Cleanup): string {
  const parts = [
    cleanup.noiseReduction > 0
      ? `background noise reduced by ${Math.round(cleanup.noiseReduction * 100)}%`
      : null,
    cleanup.lowCut ? 'low rumble filtered out' : null,
    cleanup.trebleDb < 0 ? `treble lowered by ${Math.abs(cleanup.trebleDb)} dB` : null,
    cleanup.bassDb > 0 ? `low end raised by ${cleanup.bassDb} dB` : null,
  ].filter((part): part is string => part !== null);
  const last = parts.pop();
  return parts.length > 0 ? `${parts.join(', ')} and ${last}` : (last ?? 'no changes');
}

const clamp = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : 0;

/** The cleanup used last on this device, or null if there is none (or storage is unavailable). */
export function rememberedCleanup(): Cleanup | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Record<keyof Cleanup, unknown>>;
    return {
      noiseReduction: clamp(saved.noiseReduction, 0, 1),
      lowCut: saved.lowCut === true,
      trebleDb: clamp(saved.trebleDb, -9, 0),
      bassDb: clamp(saved.bassDb, 0, 6),
    };
  } catch {
    return null;
  }
}

export function rememberCleanup(cleanup: Cleanup): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanup));
  } catch {
    // Private windows can refuse storage; the next recording then starts from its suggestion.
  }
}

/** Where a new recording's cleanup starts: the speaker's last choice, else the suggestion, else off. */
export function startingCleanup(suggested: Cleanup | null): Cleanup {
  return rememberedCleanup() ?? suggested ?? NO_CLEANUP;
}
