// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Keep the bundled music library and its licence records honest.
 * Scope: The library is the owner-approved selection; every track in library.json has a unique id, a
 *   known category, chunks of about 20 seconds in public/music/<id>/ of the recorded frames, size and
 *   SHA-256 (so the player's memory doesn't depend on a track's length), a source and licence that
 *   allow redistribution, editing and commercial use, and an entry in CREDITS.md; no audio file
 *   ships without a record. Also the small helpers for labels and a track's chunk URLs.
 * Does NOT belong: Playback (engine.test.ts, session.test.ts).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MusicCategory, MusicTrack } from './library';
import { CATEGORIES, categoryLabel, TRACKS, trackSource } from './library';
import library from './library.json';

/** The full record of a track in library.json, beyond what the app reads. */
interface TrackRecord extends MusicTrack {
  source: string;
  licence: MusicTrack['licence'] & { verifiedAt: string; archived: string };
  permits: { modification: boolean; redistribution: boolean; commercial: boolean };
}

const RECORDS = library.tracks as readonly TrackRecord[];

/** apps/web/public/music, found from this test file (import.meta.url isn't a file URL under jsdom). */
const musicFile = (name = '') =>
  path.join(path.dirname(expect.getState().testPath ?? ''), '../../../public/music', name);
const ALLOWED_LICENCES = new Set(['CC0 1.0', 'Public domain', 'CC BY 4.0']);

/** Every audio file under public/music, as `<id>/<nn>.webm`. */
const audioFiles = () =>
  readdirSync(musicFile(), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.webm'))
    .map((name) => name.split(path.sep).join('/'));
const RATE = 48_000;

describe('music library', () => {
  it('offers the approved library, covering every category', () => {
    // The owner approved these 17 (2026-10-22); a larger library needs their say-so first.
    expect(TRACKS.length).toBeGreaterThanOrEqual(8);
    expect(TRACKS.length).toBeLessThanOrEqual(17);
    for (const category of CATEGORIES)
      expect(
        TRACKS.some((track) => track.category === category.id),
        category.id,
      ).toBe(true);
  });

  it('records every track with a unique id, a known category and its bundled chunks', () => {
    const ids = new Set(TRACKS.map((track) => track.id));
    expect(ids.size).toBe(TRACKS.length);
    for (const track of RECORDS) {
      expect(CATEGORIES.map((category) => category.id)).toContain(track.category);
      expect(track.edgeFrames, track.id).toBe(960);
      let frames = 0;
      for (const [index, chunk] of track.chunks.entries()) {
        expect(chunk.file).toBe(`${track.id}/${String(index + 1).padStart(2, '0')}.webm`);
        const data = readFileSync(musicFile(chunk.file));
        expect(data.length, chunk.file).toBe(chunk.bytes);
        expect(createHash('sha256').update(data).digest('hex'), chunk.file).toBe(chunk.sha256);
        // About 20 s each: what the player holds at once doesn't grow with the track.
        expect(chunk.frames / RATE, chunk.file).toBeGreaterThan(15);
        expect(chunk.frames / RATE, chunk.file).toBeLessThan(25);
        frames += chunk.frames;
      }
      expect(track.durationSeconds, track.id).toBe(frames / RATE);
      expect(track.durationSeconds).toBeGreaterThan(30);
      expect(track.bytes, track.id).toBe(track.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0));
    }
    expect(audioFiles().sort((a, b) => a.localeCompare(b))).toEqual(
      RECORDS.flatMap((track) => track.chunks.map((chunk) => chunk.file)).sort((a, b) =>
        a.localeCompare(b),
      ),
    );
  });

  it('only includes music whose licence allows shipping, editing and commercial use', () => {
    for (const track of RECORDS) {
      expect(ALLOWED_LICENCES, track.id).toContain(track.licence.name);
      expect(track.licence.url).toMatch(/^https:\/\//);
      expect(track.licence.verifiedAt).toMatch(/^https:\/\//);
      // An independent copy of the source page, as evidence that outlives the page itself.
      expect(track.licence.archived.endsWith(`/${track.source}`), track.id).toBe(true);
      expect(track.licence.archived).toMatch(/^https:\/\/web\.archive\.org\/web\/\d{14}\//);
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
    const credits = readFileSync(musicFile('CREDITS.md'), 'utf8');
    for (const track of RECORDS) {
      for (const fact of [
        track.title,
        track.creator,
        track.source,
        track.licence.name,
        `${track.id}/`,
      ])
        expect(credits, `${track.id}: ${fact}`).toContain(fact);
    }
  });

  it('labels categories and gives the player the chunks of a track under /music/', () => {
    expect(categoryLabel('lofi')).toBe('Lo-fi');
    expect(categoryLabel('unknown' as MusicCategory)).toBe('unknown');
    const rain = {
      edgeFrames: 960,
      chunks: [
        { file: 'rain/01.webm', frames: 960_000, bytes: 1, sha256: 'a' },
        { file: 'rain/02.webm', frames: 959_999, bytes: 1, sha256: 'b' },
      ],
    } as unknown as MusicTrack;
    expect(trackSource(rain)).toEqual({
      edgeFrames: 960,
      chunks: [
        { url: '/music/rain/01.webm', frames: 960_000 },
        { url: '/music/rain/02.webm', frames: 959_999 },
      ],
    });
  });
});
