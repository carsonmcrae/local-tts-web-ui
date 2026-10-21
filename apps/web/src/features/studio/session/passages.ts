// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The passages a studio voice session asks the speaker to read, with how to read each one.
 * Scope: A longer foundation passage (about a minute, enough to build an early voice) followed by
 *   48 original passages (no third-party text) of about 10–15 seconds each, in six styles —
 *   narration, storytelling, conversation, questions and surprise, numbers and names, calm — so the
 *   voice is heard with varied pitch, pace and emotion. Each has a stable take number (the foundation
 *   passage is 49, so earlier sessions keep their takes) and a hint on the inflection and pauses it
 *   teaches the voice. The text lives in passages.json and mirrors docs/guides/studio-recording.md.
 * Does NOT belong: Recording logic.
 */
import passages from './passages.json';

export interface Passage {
  id: string;
  number: number;
  style: string;
  text: string;
  hint: string;
}

export const PASSAGES: readonly Passage[] = passages;
export const FOUNDATION_ID = 'foundation';

/** The longest a take of this passage may run before it stops itself, in seconds. */
export function maxTakeSeconds(passage: Passage): number {
  return passage.id === FOUNDATION_ID ? 100 : 45;
}
