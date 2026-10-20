// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Run media work against an isolated TTSNative server (scripts/e2e-server.mjs).
 * Scope: Starts the server on a given port, waits for its health check, runs the work with the base
 *   URL, and always stops the server afterwards.
 * Does NOT belong: What the media scripts generate (render-promo.mjs, voice-samples.mjs).
 */
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';
import { startManaged, stopManaged, waitForHttp } from '../lib/processes.mjs';

/**
 * @template T
 * @param {string} name short name for the log prefix
 * @param {string} port
 * @param {(base: string) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withAppServer(name, port, work) {
  const base = `http://127.0.0.1:${port}`;
  const app = startManaged({
    name,
    label: `[${name}-server]`,
    command: process.execPath,
    args: [path.join(repoRoot, 'scripts', 'e2e-server.mjs'), '--port', port],
    cwd: repoRoot,
  });
  try {
    if (!(await waitForHttp(`${base}/api/health`, 180_000)))
      throw new Error('server did not start');
    return await work(base);
  } finally {
    stopManaged(app);
  }
}
