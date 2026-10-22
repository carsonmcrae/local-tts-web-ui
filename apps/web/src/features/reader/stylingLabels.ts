// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Plain names for the ways a sentence can be styled.
 * Scope: The effects and sounds a reader can choose (in menu order) and a short description of a
 *   sentence's styling, read by screen readers and shown on hover.
 * Does NOT belong: Choosing styles (SentenceStyling) or rendering sentences (DocumentText).
 */
import type { SentenceStyle, SoundEffect, SpeakingStyle, VoiceSound } from '@/api/types';

export const EFFECT_LABELS: Readonly<Record<SoundEffect, string>> = {
  loudspeaker: 'Loudspeaker announcement',
  telephone: 'Telephone call',
  radio: 'Radio',
  hall: 'Large hall',
  distant: 'Far away',
  robot: 'Robot',
  quiet: 'Quiet aside',
  memory: 'Memory or dream',
};

export const SOUND_LABELS: Readonly<Record<VoiceSound, string>> = {
  laugh: 'Laugh',
  chuckle: 'Chuckle',
  sigh: 'Sigh',
  gasp: 'Gasp',
  cough: 'Cough',
  'clear throat': 'Clear throat',
  sniff: 'Sniff',
  groan: 'Groan',
  shush: 'Shush',
};

export const STYLE_LABELS: Readonly<Record<SpeakingStyle, string>> = {
  narration: 'Narration',
  question: 'Question',
  lively: 'Lively',
  dialogue: 'Dialogue',
  calm: 'Calm',
};

export const PAUSE_LABELS: Readonly<Record<string, string>> = {
  '500': 'Half a second',
  '1000': '1 second',
  '2000': '2 seconds',
  '3000': '3 seconds',
  '5000': '5 seconds',
};

/** "Read by Sam · Telephone call · Sigh first", naming the voice when it's known. */
export function describeStyle(style: SentenceStyle, voiceName: (id: string) => string): string {
  const parts: string[] = [];
  if (style.voiceId) parts.push(`Read by ${voiceName(style.voiceId)}`);
  if (style.effect) parts.push(EFFECT_LABELS[style.effect]);
  if (style.sound) parts.push(`${SOUND_LABELS[style.sound]} first`);
  if (style.style) parts.push(`${STYLE_LABELS[style.style]} style`);
  if (style.pauseMs !== null && style.pauseMs !== undefined)
    parts.push(`${(style.pauseMs / 1000).toString()} s pause after`);
  if (style.take) parts.push(`take ${style.take + 1}`);
  return parts.join(' · ');
}
