/**
 * Purpose: Describe a studio session's tone correction in plain words.
 * Scope: "treble lowered by 4.5 dB and low end raised by 3 dB", from a correction's two settings.
 * Does NOT belong: Measuring or applying the correction (the server).
 */
import type { ToneCorrection } from '@/api/types';

export function describeTone(tone: ToneCorrection): string {
  const parts = [
    tone.trebleDb < 0 ? `treble lowered by ${Math.abs(tone.trebleDb)} dB` : null,
    tone.bassDb > 0 ? `low end raised by ${tone.bassDb} dB` : null,
  ];
  return parts.filter(Boolean).join(' and ');
}
