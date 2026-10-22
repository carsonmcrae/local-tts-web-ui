// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The words and small rules shared by the export dialog and the Exports page.
 * Scope: Format names and hints, status labels, which statuses can be resumed, the saved-sentences
 *   line, reading a finished export's result, whether a file can go to Audiobookshelf, the help
 *   link and the larger touch size used for actions on phones.
 * Does NOT belong: Components or requests.
 */
import type { ExportFormat, JobOut } from '@/api/types';
import { HOMEPAGE } from '@/lib/provenance';

export const EXPORT_HELP_URL = `${HOMEPAGE}/wiki/Exporting-Audio`;

/** Small buttons grow to 44 px on phones so they are easy to tap. */
export const TOUCH = 'max-sm:h-11 max-sm:px-4';

export const FORMATS: Record<ExportFormat, { name: string; label: string; hint: string }> = {
  mp3: { name: 'MP3', label: 'MP3', hint: 'Smaller files, plays everywhere.' },
  wav: { name: 'WAV', label: 'WAV', hint: 'Lossless, larger files.' },
  m4b: {
    name: 'M4B audiobook',
    label: 'M4B audiobook (chapters and cover)',
    hint: 'One file with chapters, for audiobook apps. Needs ffmpeg.',
  },
  epub: {
    name: 'Read-along EPUB',
    label: 'Read-along EPUB',
    hint: 'An e-book that highlights each sentence as it is read aloud.',
  },
};

/** Formats where "one file per chapter" and subtitles apply. */
export const HAS_LAYOUT: ReadonlySet<ExportFormat> = new Set(['mp3', 'wav']);
export const HAS_SUBTITLES: ReadonlySet<ExportFormat> = new Set(['mp3', 'wav', 'm4b']);

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export const STATUS: Record<JobOut['status'], { label: string; tone: Tone }> = {
  queued: { label: 'Waiting', tone: 'accent' },
  running: { label: 'Exporting', tone: 'accent' },
  paused: { label: 'Paused', tone: 'warning' },
  interrupted: { label: 'Interrupted', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
  succeeded: { label: 'Ready', tone: 'success' },
  canceled: { label: 'Canceled', tone: 'neutral' },
};

/** Stopped exports that kept their saved sentences and can carry on. */
export const RESUMABLE: ReadonlySet<JobOut['status']> = new Set([
  'paused',
  'interrupted',
  'failed',
]);

export function savedText(saved: number, total: number): string {
  const count = saved.toLocaleString();
  return total > 0
    ? `${count} of ${total.toLocaleString()} sentences saved`
    : `${count} sentences saved`;
}

export interface ExportResult {
  filename: string;
  sizeBytes: number;
  durationS: number;
}

export function exportResult(job: JobOut): ExportResult | null {
  const result = job.result as Partial<ExportResult> | null;
  return result && typeof result.filename === 'string' ? (result as ExportResult) : null;
}

/** Audiobookshelf takes one audio file: an M4B, MP3 or WAV (not a ZIP or an EPUB). */
export function isSingleAudioFile(filename: string): boolean {
  return /\.(m4b|mp3|wav)$/i.test(filename);
}
