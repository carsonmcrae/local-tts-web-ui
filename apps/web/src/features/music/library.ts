// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The bundled background-music library as typed data.
 * Scope: Reads library.json (each track's file, length, category, creator and licence), lists the
 *   categories in display order, and builds a track's URL under /music/ (served with the web app,
 *   so it plays without an internet connection).
 * Does NOT belong: Playing tracks (engine.ts), choosing one (session.ts) or the audio files
 *   themselves (apps/web/public/music, with CREDITS.md).
 */
import library from './library.json';

export type MusicCategory = 'ambient' | 'fantasy' | 'cinematic' | 'lofi' | 'focus' | 'nature';

export interface MusicTrack {
  id: string;
  title: string;
  creator: string;
  category: MusicCategory;
  file: string;
  durationSeconds: number;
  licence: { name: string; url: string };
  /** The credit a licence asks for; null for CC0 and public-domain tracks. */
  attribution: string | null;
}

export const CATEGORIES: readonly { id: MusicCategory; label: string }[] = [
  { id: 'ambient', label: 'Ambient' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'lofi', label: 'Lo-fi' },
  { id: 'focus', label: 'Focus' },
  { id: 'nature', label: 'Nature' },
];

/** Every bundled track; library.test.ts checks the file, size and licence record of each. */
export const TRACKS = library.tracks as readonly MusicTrack[];

export function categoryLabel(category: MusicCategory): string {
  return CATEGORIES.find((entry) => entry.id === category)?.label ?? category;
}

export function trackUrl(track: MusicTrack): string {
  return `${import.meta.env.BASE_URL}music/${track.file}`;
}
