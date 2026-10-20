// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Locate FFmpeg/FFprobe by absolute path and run tools for the media scripts.
 * Scope: `LTTS_FFMPEG` (path to ffmpeg; ffprobe is looked up beside it) or the first match on PATH,
 *   resolved to an absolute file so a planted binary in the working directory is never used. Runs
 *   commands without a shell and reads durations with ffprobe.
 * Does NOT belong: What the media scripts render or record (record-demo.mjs, render-promo.mjs).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const EXE = process.platform === 'win32' ? '.exe' : '';

/** @param {string} name ffmpeg or ffprobe @returns {string} */
export function findTool(name) {
  const explicit = process.env.LTTS_FFMPEG;
  if (explicit) {
    const candidate = path.join(path.dirname(path.resolve(explicit)), name + EXE);
    if (existsSync(candidate)) return candidate;
    throw new Error(`${name} not found next to LTTS_FFMPEG (${explicit})`);
  }
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, name + EXE);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `${name} was not found. Install FFmpeg or set LTTS_FFMPEG to ffmpeg's full path.`,
  );
}

/**
 * Run a tool and resolve with its stdout followed by its stderr (FFmpeg prints analysis there);
 * rejects with the end of stderr on a non-zero exit.
 * @param {string} tool absolute path
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<string>}
 */
export function run(tool, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    /** @type {Buffer[]} */
    const out = [];
    /** @type {Buffer[]} */
    const err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat([...out, ...err]).toString('utf8'));
      else
        reject(
          new Error(
            `${path.basename(tool)} exited ${code}: ${Buffer.concat(err).toString('utf8').slice(-2000)}`,
          ),
        );
    });
  });
}

/** @param {string} file @returns {Promise<number>} duration in seconds */
export async function duration(file) {
  const out = await run(findTool('ffprobe'), [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ]); // prettier-ignore
  return Number(out.trim());
}
