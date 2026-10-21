// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Rebuild the bundled background-music files from their original downloads, reproducibly.
 * Scope: For each track in apps/web/src/features/music/library.json: checks the original (kept
 *   outside Git in .tools/music/sources) against its recorded SHA-256, trims it, crossfades its end
 *   into its start so it loops without a seam, matches its loudness (well below the narration, with
 *   peak headroom), encodes 48 kHz Opus in WebM into apps/web/public/music, and writes the result's
 *   length, size and SHA-256 back into library.json. `--check` only verifies the bundled files.
 * Does NOT belong: Finding or licensing music (docs in apps/web/public/music/CREDITS.md), or playback.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { color, ok } from '../lib/log.mjs';
import { repoRoot } from '../lib/paths.mjs';
import { duration, findTool, run } from './ffmpeg.mjs';

/** Integrated loudness of every track: about 1 LU below the narration's typical -27 LUFS. */
const TARGET_LUFS = -28;
/** Highest true peak allowed, so narration and music together keep clear of clipping. */
const PEAK_LIMIT_DBTP = -9;

const LIBRARY = path.join(repoRoot, 'apps/web/src/features/music/library.json');
const OUTPUT = path.join(repoRoot, 'apps/web/public/music');
const SOURCES = path.join(repoRoot, '.tools/music/sources');
const WORK = path.join(repoRoot, '.tools/music/work');

/**
 * @typedef {{ file: string, sha256: string, start: number, end: number, crossfade: number,
 *   bitrate: number, channels?: number }} Recipe
 * @typedef {{ id: string, file: string, durationSeconds: number, bytes: number, sha256: string,
 *   prepared: Recipe }} Track
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

/**
 * The trimmed section with its last `crossfade` seconds blended (equal power) into its first, so
 * the file's end leads straight back into its start: [x .. L-x] then (tail faded out + head in).
 * @param {string} ffmpeg @param {string} source @param {Recipe} recipe @param {string} out
 */
async function loop(ffmpeg, source, recipe, out) {
  const length = recipe.end - recipe.start;
  const x = recipe.crossfade;
  const graph = [
    `[0:a]atrim=${recipe.start}:${recipe.end},asetpts=N/SR/TB,aresample=48000,` +
      `aformat=sample_fmts=fltp:channel_layouts=${recipe.channels === 1 ? 'mono' : 'stereo'},asplit=3[h][m][t]`,
    `[h]atrim=0:${x},asetpts=N/SR/TB,afade=t=in:d=${x}:curve=qsin[hi]`,
    `[t]atrim=${length - x}:${length},asetpts=N/SR/TB,afade=t=out:d=${x}:curve=qsin[to]`,
    `[to][hi]amix=inputs=2:normalize=0:duration=longest[x]`,
    `[m]atrim=${x}:${length - x},asetpts=N/SR/TB[mid]`,
    `[mid][x]concat=n=2:v=0:a=1[out]`,
  ].join(';');
  await run(ffmpeg, ['-y', '-v', 'error', '-i', source, '-filter_complex', graph, '-map', '[out]', '-c:a', 'pcm_f32le', out]); // prettier-ignore
}

/** @param {string} ffmpeg @param {string} looped @param {Recipe} recipe @param {string} out */
async function encode(ffmpeg, looped, recipe, out) {
  const { lufs, peak } = await loudness(ffmpeg, looped);
  const gain = TARGET_LUFS - lufs;
  // Quiet beds rarely need it, but a peak above the limit after the gain is brought down to it.
  const limit =
    peak + gain > PEAK_LIMIT_DBTP
      ? `,alimiter=limit=${10 ** (PEAK_LIMIT_DBTP / 20)}:level=false`
      : '';
  await run(ffmpeg, ['-y', '-v', 'error', '-i', looped, '-af', `volume=${gain.toFixed(2)}dB${limit}`,
    '-c:a', 'libopus', '-b:a', `${recipe.bitrate}k`, '-vbr', 'on', '-application', 'audio',
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'webm', out]); // prettier-ignore
}

/** @param {Track} track */
function checkBundled(track) {
  const file = path.join(OUTPUT, track.file);
  if (!existsSync(file)) return `${track.file} is missing`;
  if (statSync(file).size !== track.bytes) return `${track.file} has the wrong size`;
  if (sha256(file) !== track.sha256) return `${track.file} doesn't match its SHA-256`;
  return null;
}

async function main() {
  /** @type {{ version: number, tracks: Track[] }} */
  const library = JSON.parse(readFileSync(LIBRARY, 'utf8'));
  if (process.argv.includes('--check')) {
    const problems = library.tracks.map(checkBundled).filter(Boolean);
    for (const problem of problems) console.error(`${color.red('✗')} ${problem}`);
    if (problems.length) process.exit(1);
    ok(`Music files match library.json (${library.tracks.length} tracks)`);
    return;
  }
  const ffmpeg = findTool('ffmpeg');
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUTPUT, { recursive: true });
  for (const track of library.tracks) {
    const recipe = track.prepared;
    const source = path.join(SOURCES, recipe.file);
    if (!existsSync(source)) throw new Error(`Download ${recipe.file} into ${SOURCES} first.`);
    if (sha256(source) !== recipe.sha256)
      throw new Error(`${recipe.file} doesn't match its SHA-256.`);
    const looped = path.join(WORK, `${track.id}.wav`);
    const out = path.join(OUTPUT, track.file);
    await loop(ffmpeg, source, recipe, looped);
    await encode(ffmpeg, looped, recipe, out);
    rmSync(looped);
    track.durationSeconds = Math.round((await duration(out)) * 1000) / 1000;
    track.bytes = statSync(out).size;
    track.sha256 = sha256(out);
    const { lufs, peak } = await loudness(ffmpeg, out);
    console.log(
      `${track.id}: ${track.durationSeconds} s, ${(track.bytes / 1e6).toFixed(2)} MB, ${lufs} LUFS, peak ${peak} dBFS`,
    );
  }
  writeFileSync(LIBRARY, `${JSON.stringify(library, null, 2)}\n`);
  ok(`Prepared ${library.tracks.length} tracks into ${path.relative(repoRoot, OUTPUT)}`);
}

await main();
