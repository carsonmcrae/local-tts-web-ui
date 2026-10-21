// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: How the reader's text looks on this device: size, line spacing, letter spacing and typeface.
 * Scope: Reads and saves the choice in localStorage (per device, like the theme), and turns it into
 *   the style and attributes the reading text uses.
 * Does NOT belong: The controls (Settings → Appearance) or the text itself (DocumentText).
 */
import type { CSSProperties } from 'react';
import { useCallback, useState } from 'react';

export type TextSize = 'small' | 'medium' | 'large' | 'xlarge';
export type LineSpacing = 'compact' | 'normal' | 'relaxed';
export type Typeface = 'serif' | 'sans';
export type LetterSpacing = 'normal' | 'wide';

export interface ReadingText {
  size: TextSize;
  spacing: LineSpacing;
  typeface: Typeface;
  letters: LetterSpacing; // wider letter and word spacing helps some readers, including many with dyslexia
}

export const DEFAULT_READING_TEXT: ReadingText = {
  size: 'medium',
  spacing: 'normal',
  typeface: 'serif',
  letters: 'normal',
};
const STORAGE_KEY = 'ltts.readingText';
const SCALES: Record<TextSize, number> = { small: 0.9, medium: 1, large: 1.15, xlarge: 1.32 };
const LEADING: Record<LineSpacing, number> = { compact: 1.55, normal: 1.8, relaxed: 2.05 };
// Tracking and word spacing in em, within what readability guidance (WCAG 1.4.12) allows for.
const LETTERS: Record<LetterSpacing, readonly [number, number]> = {
  normal: [0, 0],
  wide: [0.06, 0.16],
};

function pick<T extends string>(value: unknown, allowed: Record<T, unknown>, fallback: T): T {
  return typeof value === 'string' && value in allowed ? (value as T) : fallback;
}

export function readReadingText(): ReadingText {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return {
      size: pick(saved.size, SCALES, DEFAULT_READING_TEXT.size),
      spacing: pick(saved.spacing, LEADING, DEFAULT_READING_TEXT.spacing),
      typeface: pick(saved.typeface, { serif: 1, sans: 1 }, DEFAULT_READING_TEXT.typeface),
      letters: pick(saved.letters, LETTERS, DEFAULT_READING_TEXT.letters),
    };
  } catch {
    return DEFAULT_READING_TEXT;
  }
}

/** The reading-text choice and a setter that saves it on this device. */
export function useReadingText(): [ReadingText, (change: Partial<ReadingText>) => void] {
  const [text, setText] = useState(readReadingText);
  const update = useCallback((change: Partial<ReadingText>) => {
    setText((current) => {
      const next = { ...current, ...change };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable (private window): the change still applies until the page closes.
      }
      return next;
    });
  }, []);
  return [text, update];
}

/** Style for `.reader-text`: the scale and line height it reads from CSS variables. */
export function readingTextStyle(text: ReadingText): CSSProperties {
  return {
    '--reader-scale': SCALES[text.size],
    '--reader-leading': LEADING[text.spacing],
    '--reader-tracking': `${LETTERS[text.letters][0]}em`,
    '--reader-word-spacing': `${LETTERS[text.letters][1]}em`,
  } as CSSProperties;
}
