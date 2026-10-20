// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: The passages a studio voice session asks the speaker to read.
 * Scope: 48 original passages (no third-party text) of about 10–15 seconds each, in six styles —
 *   narration, storytelling, conversation, questions and surprise, numbers and names, calm — so the
 *   voice is heard with varied pitch, pace and emotion. The text lives in passages.json and mirrors
 *   docs/guides/studio-recording.md.
 * Does NOT belong: Recording logic.
 */
import passages from './passages.json';

export interface Passage {
  id: string;
  style: string;
  text: string;
}

export const PASSAGES: readonly Passage[] = passages;
