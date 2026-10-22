// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Decide, from the narration player's state alone, which effects should sound now.
 * Scope: Pure functions over a document's effects and a snapshot of the player (sentence, time
 *   inside its clip, the clip's length, status). A one-shot is due once the player is playing its
 *   sentence and the clip's time has passed its trigger (a fraction of the clip plus an offset; the
 *   end of a sentence is a quarter second before the clip ends), and only within a grace window
 *   after it, so a sentence entered late skips the effect rather than playing it behind the words.
 *   An ambience is active while the narration is on a sentence inside its span and its own start
 *   has been reached. Only enabled, accepted, up-to-date effects count; a visit of a sentence is
 *   fresh when the sentence changes or the clip's time jumps back, so a replayed sentence fires
 *   its effects again while a pause and resume does not.
 * Does NOT belong: Audio (engine.ts) or state (session.ts).
 */
import type { SfxEffect } from '@/api/types';

export interface Playback {
  documentId: string | null;
  segmentIndex: number;
  currentTime: number;
  duration: number;
  status: string;
}

export const GRACE_SECONDS = 1.5;
export const END_LEAD_SECONDS = 0.25;
/** The clip's time jumped back by more than this: the sentence is being played again. */
const REPLAY_SECONDS = 0.5;

/** An effect the player may sound: enabled, accepted (or placed by hand) and still matching its sentence. */
export function playable(effect: SfxEffect): boolean {
  return effect.enabled && effect.status === 'accepted' && !effect.stale;
}

/** Seconds into the sentence's clip at which `effect` fires. */
export function triggerTime(effect: SfxEffect, duration: number): number {
  const base =
    effect.position >= 1
      ? Math.max(duration - END_LEAD_SECONDS, 0)
      : effect.position * Math.max(duration, 0);
  return Math.max(base + effect.offsetMs / 1000, 0);
}

export function isAmbience(effect: SfxEffect): boolean {
  return effect.untilSegment !== null && effect.untilSegment !== undefined;
}

/** The one-shots anchored to the current sentence whose moment has come (and not long passed). */
export function dueOneShots(
  effects: readonly SfxEffect[],
  playback: Playback,
  fired: ReadonlySet<string>,
): SfxEffect[] {
  if (playback.status !== 'playing') return [];
  return effects.filter((effect) => {
    if (!playable(effect) || isAmbience(effect) || fired.has(effect.id)) return false;
    if (effect.segmentIndex !== playback.segmentIndex) return false;
    const at = triggerTime(effect, playback.duration);
    return playback.currentTime >= at && playback.currentTime <= at + GRACE_SECONDS;
  });
}

/** The ambience that should be heard now: the latest-starting span the narration is inside. */
export function activeAmbience(
  effects: readonly SfxEffect[],
  playback: Playback,
): SfxEffect | null {
  if (playback.status !== 'playing' && playback.status !== 'loading') return null;
  let chosen: SfxEffect | null = null;
  for (const effect of effects) {
    if (!playable(effect) || !isAmbience(effect)) continue;
    const until = effect.untilSegment as number;
    if (playback.segmentIndex < effect.segmentIndex || playback.segmentIndex > until) continue;
    // On its first sentence it waits for its moment; later sentences are inside it from the start.
    if (
      effect.segmentIndex === playback.segmentIndex &&
      playback.status === 'playing' &&
      playback.currentTime < triggerTime(effect, playback.duration)
    )
      continue;
    if (!chosen || effect.segmentIndex > chosen.segmentIndex) chosen = effect;
  }
  return chosen;
}

/** Whether `next` begins a fresh visit of a sentence compared with `previous`. */
export function isFreshVisit(previous: Playback | null, next: Playback): boolean {
  if (!previous) return true;
  return (
    previous.documentId !== next.documentId ||
    previous.segmentIndex !== next.segmentIndex ||
    next.currentTime < previous.currentTime - REPLAY_SECONDS
  );
}
