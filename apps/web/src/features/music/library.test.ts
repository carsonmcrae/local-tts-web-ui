// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Keep the bundled music library and its licence records honest.
 * Scope: Every track in library.json has a unique id, a known category, a file in public/music of
 *   the recorded size and SHA-256, a source and licence that allow redistribution, editing and
 *   commercial use, and an entry in CREDITS.md; no audio file ships without a record. Also the
 *   small helpers for labels and URLs.
 * Does NOT belong: Playback (engine.test.ts, session.test.ts).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MusicCategory, MusicTrack } from './library';
import { CATEGORIES, categoryLabel, TRACKS, trackUrl } from './library';
import library from './library.json';

/** The full record of a track in library.json, beyond what the app reads. */
interface TrackRecord extends MusicTrack {
  bytes: number;
  sha256: string;
  source: string;
  licence: MusicTrack['licence'] & { verifiedAt: string };
  permits: { modification: boolean; redistribution: boolean; commercial: boolean };
}

const RECORDS = library.tracks as readonly TrackRecord[];

const MUSIC_DIR = new URL('../../../public/music/', import.meta.url);
const ALLOWED_LICENCES = new Set(['CC0 1.0', 'Public domain', 'CC BY 4.0']);

const audioFiles = () =>
  existsSync(MUSIC_DIR) ? readdirSync(MUSIC_DIR).filter((name) => name.endsWith('.webm')) : [];

describe('music library', () => {
  it('records every track with a unique id, a known category and a bundled file', () => {
    const ids = new Set(TRACKS.map((track) => track.id));
    expect(ids.size).toBe(TRACKS.length);
    for (const track of RECORDS) {
      expect(CATEGORIES.map((category) => category.id)).toContain(track.category);
      const data = readFileSync(new URL(track.file, MUSIC_DIR));
      expect(data.length, track.file).toBe(track.bytes);
      expect(createHash('sha256').update(data).digest('hex'), track.file).toBe(track.sha256);
      expect(track.durationSeconds).toBeGreaterThan(30);
    }
    expect(audioFiles().sort()).toEqual(RECORDS.map((track) => track.file).sort());
  });

  it('only includes music whose licence allows shipping, editing and commercial use', () => {
    for (const track of RECORDS) {
      expect(ALLOWED_LICENCES, track.id).toContain(track.licence.name);
      expect(track.licence.url).toMatch(/^https:\/\//);
      expect(track.licence.verifiedAt).toMatch(/^https:\/\//);
      expect(track.source).toMatch(/^https:\/\//);
      expect(track.permits, track.id).toEqual({
        modification: true,
        redistribution: true,
        commercial: true,
      });
      // Only an attribution licence may (and must) carry a credit line.
      expect(track.attribution === null, track.id).toBe(track.licence.name !== 'CC BY 4.0');
    }
  });

  it('credits every track in the notes that ship beside the music', () => {
    const credits = existsSync(new URL('CREDITS.md', MUSIC_DIR))
      ? readFileSync(new URL('CREDITS.md', MUSIC_DIR), 'utf8')
      : '';
    for (const track of RECORDS) {
      for (const fact of [track.title, track.creator, track.source, track.licence.name])
        expect(credits, `${track.id}: ${fact}`).toContain(fact);
    }
  });

  it('labels categories and builds URLs under /music/', () => {
    expect(categoryLabel('lofi')).toBe('Lo-fi');
    expect(categoryLabel('unknown' as MusicCategory)).toBe('unknown');
    expect(trackUrl({ file: 'rain.webm' } as MusicTrack)).toBe('/music/rain.webm');
  });
});
