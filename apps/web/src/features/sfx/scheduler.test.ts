// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the trigger rules that decide which effects sound at a moment of the narration.
 * Scope: Trigger times (start, inside, end, offsets), which effects are playable, one-shots due
 *   only while playing and only within the grace window, ambience active inside its span and after
 *   its own moment on the first sentence, the latest-starting ambience winning, and what counts
 *   as a fresh visit of a sentence.
 * Does NOT belong: Audio or state (engine.test.ts, session.test.ts).
 */
import { describe, expect, it } from 'vitest';
import type { SfxEffect } from '@/api/types';
import type { Playback } from './scheduler';
import {
  END_LEAD_SECONDS,
  GRACE_SECONDS,
  activeAmbience,
  dueOneShots,
  isAmbience,
  isFreshVisit,
  playable,
  triggerTime,
} from './scheduler';

export const effect = (overrides: Partial<SfxEffect> = {}): SfxEffect => ({
  id: 'e1',
  segmentIndex: 3,
  sectionIndex: 0,
  text: 'Thunder rumbled.',
  position: 0,
  offsetMs: 0,
  untilSegment: null,
  event: 'thunder-distant',
  soundId: 'thud',
  volume: 70,
  origin: 'suggested',
  status: 'accepted',
  enabled: true,
  confidence: 0.8,
  stale: false,
  createdAt: 'now',
  updatedAt: 'now',
  ...overrides,
});

const at = (overrides: Partial<Playback> = {}): Playback => ({
  documentId: 'doc',
  segmentIndex: 3,
  currentTime: 0,
  duration: 10,
  status: 'playing',
  ...overrides,
});

describe('trigger rules', () => {
  it('places an effect at the start, inside or at the end of its sentence', () => {
    expect(triggerTime(effect(), 10)).toBe(0);
    expect(triggerTime(effect({ position: 0.5 }), 10)).toBe(5);
    expect(triggerTime(effect({ position: 1 }), 10)).toBe(10 - END_LEAD_SECONDS);
    expect(triggerTime(effect({ position: 1 }), 0.1)).toBe(0);
    expect(triggerTime(effect({ position: 0.5, offsetMs: 1500 }), 10)).toBe(6.5);
    expect(triggerTime(effect({ offsetMs: -1500 }), 10)).toBe(0);
  });

  it('only plays enabled, accepted, up-to-date effects', () => {
    expect(playable(effect())).toBe(true);
    expect(playable(effect({ enabled: false }))).toBe(false);
    expect(playable(effect({ status: 'suggested' }))).toBe(false);
    expect(playable(effect({ status: 'dismissed' }))).toBe(false);
    expect(playable(effect({ stale: true }))).toBe(false);
    expect(isAmbience(effect({ untilSegment: 9 }))).toBe(true);
    expect(isAmbience(effect())).toBe(false);
  });

  it('fires one-shots once their moment has come, and never late', () => {
    const shots = [
      effect(),
      effect({ id: 'e2', position: 0.5 }),
      effect({ id: 'e3', segmentIndex: 4 }),
    ];
    expect(dueOneShots(shots, at({ currentTime: 0.1 }), new Set()).map((e) => e.id)).toEqual([
      'e1',
    ]);
    expect(dueOneShots(shots, at({ currentTime: 5.2 }), new Set(['e1'])).map((e) => e.id)).toEqual([
      'e2',
    ]);
    expect(
      dueOneShots(shots, at({ currentTime: 5 + GRACE_SECONDS + 0.1 }), new Set(['e1'])),
    ).toEqual([]);
    expect(dueOneShots(shots, at({ status: 'paused', currentTime: 0.1 }), new Set())).toEqual([]);
    expect(dueOneShots(shots, at({ status: 'loading' }), new Set())).toEqual([]);
    expect(dueOneShots([effect({ untilSegment: 9 })], at(), new Set())).toEqual([]);
    expect(dueOneShots([effect({ enabled: false })], at(), new Set())).toEqual([]);
  });

  it('keeps an ambience on while the narration is inside its span', () => {
    const rain = effect({ id: 'rain', segmentIndex: 2, untilSegment: 6, position: 0.5 });
    const fire = effect({ id: 'fire', segmentIndex: 4, untilSegment: 8 });
    expect(activeAmbience([rain], at({ segmentIndex: 1 }))).toBeNull();
    expect(activeAmbience([rain], at({ segmentIndex: 2, currentTime: 1 }))).toBeNull(); // before its moment
    expect(activeAmbience([rain], at({ segmentIndex: 2, currentTime: 6 }))?.id).toBe('rain');
    expect(activeAmbience([rain], at({ segmentIndex: 2, status: 'loading' }))?.id).toBe('rain');
    expect(activeAmbience([rain], at({ segmentIndex: 5 }))?.id).toBe('rain');
    expect(activeAmbience([rain], at({ segmentIndex: 7 }))).toBeNull();
    expect(activeAmbience([rain, fire], at({ segmentIndex: 5 }))?.id).toBe('fire');
    expect(activeAmbience([fire, rain], at({ segmentIndex: 5 }))?.id).toBe('fire');
    expect(activeAmbience([rain], at({ segmentIndex: 5, status: 'paused' }))).toBeNull();
    expect(activeAmbience([effect({ untilSegment: 9, enabled: false })], at())).toBeNull();
    expect(activeAmbience([effect()], at())).toBeNull();
  });

  it('knows when a sentence is visited afresh', () => {
    expect(isFreshVisit(null, at())).toBe(true);
    expect(isFreshVisit(at({ currentTime: 2 }), at({ currentTime: 2.3 }))).toBe(false);
    expect(isFreshVisit(at({ currentTime: 2 }), at({ currentTime: 0 }))).toBe(true);
    expect(isFreshVisit(at(), at({ segmentIndex: 4 }))).toBe(true);
    expect(isFreshVisit(at(), at({ documentId: 'other' }))).toBe(true);
  });
});
