// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The bundled background-music library as typed data.
 * Scope: Reads library.json (each track's chunks, length, category, creator and licence), lists the
 *   categories in display order, and gives the engine a track's chunks with their URLs under /music/
 *   (served with the web app, so it plays without an internet connection).
 * Does NOT belong: Playing tracks (engine.ts), choosing one (session.ts) or the audio files
 *   themselves (apps/web/public/music, with CREDITS.md).
 */
import type { MusicTarget } from './engine';
import library from './library.json';

export type MusicCategory = 'ambient' | 'fantasy' | 'cinematic' | 'lofi' | 'focus' | 'nature';

/** About 20 seconds of a track, with its neighbours' frames at each edge (scripts/media/music-library.mjs). */
export interface MusicChunk {
  file: string;
  frames: number;
  bytes: number;
  sha256: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  creator: string;
  category: MusicCategory;
  durationSeconds: number;
  bytes: number;
  edgeFrames: number;
  chunks: readonly MusicChunk[];
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

/** What the engine needs to play `track`: its chunks in order, each with its URL. */
export function trackSource(track: MusicTrack): Pick<MusicTarget, 'chunks' | 'edgeFrames'> {
  return {
    edgeFrames: track.edgeFrames,
    chunks: track.chunks.map((chunk) => ({
      url: `${import.meta.env.BASE_URL}music/${chunk.file}`,
      frames: chunk.frames,
    })),
  };
}
