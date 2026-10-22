// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Rebuild the bundled background-music files from their original downloads, reproducibly.
 * Scope: For each track in apps/web/src/features/music/library.json: checks the original (kept
 *   outside Git in .tools/music/sources) against its recorded SHA-256, trims it, crossfades its end
 *   into its start so it loops without a seam, matches its loudness (well below the narration, with
 *   peak headroom), cuts the loop into chunks of about 20 seconds that each carry 20 ms of their
 *   neighbours on both sides, encodes each as 48 kHz Opus in WebM into apps/web/public/music/<id>/,
 *   checks that a reference decode of every chunk has exactly the frames it should, and writes the
 *   chunks' lengths, sizes and SHA-256 back into library.json (library.test.ts checks the files).
 * Does NOT belong: Finding or licensing music (docs in apps/web/public/music/CREDITS.md), or playback
 *   (features/music/engine.ts, which plays the chunks back to back).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ok } from '../lib/log.mjs';
import { repoRoot } from '../lib/paths.mjs';
import { findTool, run } from './ffmpeg.mjs';

/** Integrated loudness of every track: about 1 LU below the narration's typical -27 LUFS. */
const TARGET_LUFS = -28;
/** Highest true peak allowed, so narration and music together keep clear of clipping. */
const PEAK_LIMIT_DBTP = -10;
const RATE = 48_000;
/**
 * About how long each chunk is. The player holds the chunk it plays and the next one, so its memory
 * doesn't grow with a track's length (20 s of 48 kHz stereo decodes to about 7.7 MB).
 */
const CHUNK_SECONDS = 20;
/**
 * Frames of each neighbour a chunk carries on either side (20 ms). A decoder that trims a chunk's
 * edges (Chromium 156 drops 24 frames at the start) trims these, never the music the player uses.
 */
const EDGE_FRAMES = 960;

const LIBRARY = path.join(repoRoot, 'apps/web/src/features/music/library.json');
const OUTPUT = path.join(repoRoot, 'apps/web/public/music');
const SOURCES = path.join(repoRoot, '.tools/music/sources');
const WORK = path.join(repoRoot, '.tools/music/work');

/**
 * A track's preparation. `curve` is the crossfade shape: `qsin` (equal power, the default) for
 * ambient material, `tri` (equal gain) for a loop cut where the music repeats itself exactly, so
 * the blend doesn't swell. `filters` runs after trimming (e.g. a high-pass or gentle compression).
 * @typedef {{ file: string, sha256: string, start: number, end: number, crossfade: number,
 *   curve?: 'qsin' | 'tri', filters?: string, bitrate: number }} Recipe
 * @typedef {{ file: string, frames: number, bytes: number, sha256: string }} Chunk
 * @typedef {{ id: string, durationSeconds: number, bytes: number, edgeFrames: number,
 *   chunks: Chunk[], prepared: Recipe }} Track
 */

/** @param {string} file */
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** @param {string} ffmpeg @param {string} file @returns {Promise<{ lufs: number, peak: number }>} */
async function loudness(ffmpeg, file) {
  const out = await run(ffmpeg, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']); // prettier-ignore
  const summary = out.slice(out.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const peak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(peak)) throw new Error(`No loudness for ${file}`);
  return { lufs, peak };
}

/** Frames in a decoded file (a WAV's sample count). @param {string} file */
async function frames(file) {
  const out = await run(findTool('ffprobe'), ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration_ts', '-of', 'default=nw=1:nk=1', file]); // prettier-ignore
  const count = Number(out.trim());
  if (!Number.isInteger(count) || count <= 0) throw new Error(`No frame count for ${file}`);
  return count;
}

/**
 * The trimmed section with its last `crossfade` seconds blended into its first, so
 * the file's end leads straight back into its start: [x .. L-x] then (tail faded out + head in).
 * @param {string} ffmpeg @param {string} source @param {Recipe} recipe @param {string} out
 */
async function loop(ffmpeg, source, recipe, out) {
  const length = recipe.end - recipe.start;
  const x = recipe.crossfade;
  const curve = recipe.curve ?? 'qsin';
  const filters = recipe.filters ? `${recipe.filters},` : '';
  const graph = [
    `[0:a]atrim=${recipe.start}:${recipe.end},asetpts=N/SR/TB,aresample=${RATE},${filters}` +
      `aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=3[h][m][t]`,
    `[h]atrim=0:${x},asetpts=N/SR/TB,afade=t=in:d=${x}:curve=${curve}[hi]`,
    `[t]atrim=${length - x}:${length},asetpts=N/SR/TB,afade=t=out:d=${x}:curve=${curve}[to]`,
    `[to][hi]amix=inputs=2:normalize=0:duration=longest[x]`,
    `[m]atrim=${x}:${length - x},asetpts=N/SR/TB[mid]`,
    `[mid][x]concat=n=2:v=0:a=1[out]`,
  ].join(';');
  await run(ffmpeg, ['-y', '-v', 'error', '-i', source, '-filter_complex', graph, '-map', '[out]', '-c:a', 'pcm_f32le', out]); // prettier-ignore
}

/** `[a][b]…` with `count` labels, each `prefix` and its number. @param {string} prefix @param {number} count */
const labels = (prefix, count) => Array.from({ length: count }, (_, i) => `[${prefix}${i}]`);

/**
 * `input` (a loop of `length` frames) between its own last `frames` and its first: the loop as it is
 * heard, round and round, then `next` (the filters after it, ending in an output label).
 * @param {string} input @param {number} length @param {number} frames
 * @param {string} name a prefix for this step's labels @param {string} next
 */
const wrapped = (input, length, frames, name, next) => {
  const [before, body, after] = labels(name, 3);
  return [
    `${input}asplit=3${before}${body}${after}`,
    `${before}atrim=start_sample=${length - frames},asetpts=N/SR/TB[${name}b]`,
    `${after}atrim=end_sample=${frames},asetpts=N/SR/TB[${name}a]`,
    `[${name}b]${body}[${name}a]concat=n=3:v=0:a=1,${next}`,
  ];
};

/** Two seconds of the loop's own end before it and start after it, so a limiter starts warm at both. */
const PRIME_FRAMES = 2 * RATE;

/**
 * The loop at its target loudness, with its last `EDGE_FRAMES` before its start and its first after
 * its end, so every chunk (the first and last included) can carry its neighbours' frames. Any peak
 * limiting (of true peaks, at four times the rate) runs over the loop with its own end before it and
 * start after it, so the loop's first frames are limited as they are heard after its last, and the
 * chunks join without a step.
 * @param {string} ffmpeg @param {string} looped @param {number} length frames in the loop
 * @param {string} out
 */
async function extend(ffmpeg, looped, length, out) {
  const { lufs, peak } = await loudness(ffmpeg, looped);
  const gain = TARGET_LUFS - lufs;
  // Quiet beds rarely need it, but a peak above the limit after the gain is brought down to it.
  const limit =
    peak + gain > PEAK_LIMIT_DBTP
      ? wrapped(
          '[g]',
          length,
          PRIME_FRAMES,
          'p',
          // Limited at four times the rate, so the peaks between samples stay under it too.
          `aresample=${4 * RATE},alimiter=limit=${10 ** (PEAK_LIMIT_DBTP / 20)}:level=false:latency=1,aresample=${RATE},` +
            `atrim=start_sample=${PRIME_FRAMES}:end_sample=${PRIME_FRAMES + length},asetpts=N/SR/TB[l]`,
        )
      : ['[g]anull[l]'];
  const graph = [
    `[0:a]volume=${gain.toFixed(2)}dB[g]`,
    ...limit,
    ...wrapped('[l]', length, EDGE_FRAMES, 'e', 'anull[out]'),
  ].join(';');
  await run(ffmpeg, ['-y', '-v', 'error', '-i', looped, '-filter_complex', graph, '-map', '[out]', '-c:a', 'pcm_f32le', out]); // prettier-ignore
}

/** How many frames each chunk's body has: `length` split evenly into chunks of about CHUNK_SECONDS. @param {number} length */
function chunkFrames(length) {
  const count = Math.max(1, Math.round(length / (CHUNK_SECONDS * RATE)));
  const base = Math.floor(length / count);
  return Array.from({ length: count }, (_, index) => base + (index < length % count ? 1 : 0));
}

/**
 * Encode one chunk: its body (`frames` from loop frame `first`) with EDGE_FRAMES of each neighbour,
 * then check that FFmpeg decodes it back to exactly that many frames.
 * @param {string} ffmpeg @param {string} extended @param {number} first @param {number} body
 * @param {number} bitrate @param {string} out
 */
async function encodeChunk(ffmpeg, extended, first, body, bitrate, out) {
  // The extended loop starts EDGE_FRAMES early, so loop frame `first` minus the lead-in is `first`.
  const trim = `atrim=start_sample=${first}:end_sample=${first + body + 2 * EDGE_FRAMES},asetpts=N/SR/TB`;
  await run(ffmpeg, ['-y', '-v', 'error', '-i', extended, '-af', trim, '-c:a', 'libopus', '-b:a', `${bitrate}k`,
    '-vbr', 'constrained', '-application', 'audio', '-map_metadata', '-1', '-fflags', '+bitexact',
    '-flags:a', '+bitexact', '-f', 'webm', out]); // prettier-ignore
  const check = path.join(WORK, 'check.wav');
  await run(ffmpeg, ['-y', '-v', 'error', '-i', out, '-c:a', 'pcm_f32le', check]); // prettier-ignore
  const decoded = await frames(check);
  rmSync(check);
  if (decoded !== body + 2 * EDGE_FRAMES)
    throw new Error(`${out} decodes to ${decoded} frames, not ${body + 2 * EDGE_FRAMES}.`);
}

/** @param {string} ffmpeg @param {Track} track */
async function build(ffmpeg, track) {
  const recipe = track.prepared;
  const source = path.join(SOURCES, recipe.file);
  if (!existsSync(source)) throw new Error(`Download ${recipe.file} into ${SOURCES} first.`);
  if (sha256(source) !== recipe.sha256)
    throw new Error(`${recipe.file} doesn't match its SHA-256.`);
  const looped = path.join(WORK, `${track.id}.wav`);
  const extended = path.join(WORK, `${track.id}-extended.wav`);
  await loop(ffmpeg, source, recipe, looped);
  const length = await frames(looped);
  await extend(ffmpeg, looped, length, extended);
  const folder = path.join(OUTPUT, track.id);
  rmSync(folder, { recursive: true, force: true });
  rmSync(path.join(OUTPUT, `${track.id}.webm`), { force: true }); // the single file of before
  mkdirSync(folder, { recursive: true });
  /** @type {Chunk[]} */
  const chunks = [];
  let first = 0;
  for (const [index, body] of chunkFrames(length).entries()) {
    const file = `${track.id}/${String(index + 1).padStart(2, '0')}.webm`;
    const out = path.join(OUTPUT, file);
    await encodeChunk(ffmpeg, extended, first, body, recipe.bitrate, out);
    chunks.push({ file, frames: body, bytes: statSync(out).size, sha256: sha256(out) });
    first += body;
  }
  const { lufs, peak } = await loudness(ffmpeg, extended);
  rmSync(looped);
  rmSync(extended);
  track.durationSeconds = length / RATE;
  track.bytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
  track.edgeFrames = EDGE_FRAMES;
  track.chunks = chunks;
  console.log(
    `${track.id}: ${track.durationSeconds.toFixed(3)} s in ${chunks.length} chunks, ${(track.bytes / 1e6).toFixed(2)} MB, ${lufs} LUFS, peak ${peak} dBFS`,
  );
}

async function main() {
  /** @type {{ version: number, tracks: Track[] }} */
  const library = JSON.parse(readFileSync(LIBRARY, 'utf8'));
  const only = process.argv.slice(2);
  const ffmpeg = findTool('ffmpeg');
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUTPUT, { recursive: true });
  // `npm run music:build -- <id> …` rebuilds just those tracks.
  for (const track of library.tracks)
    if (!only.length || only.includes(track.id)) await build(ffmpeg, track);
  writeFileSync(LIBRARY, `${JSON.stringify(library, null, 2)}\n`);
  ok(`Prepared ${library.tracks.length} tracks into ${path.relative(repoRoot, OUTPUT)}`);
}

await main();
