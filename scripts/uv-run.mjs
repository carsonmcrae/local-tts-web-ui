// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Run a uv command with the project's pinned uv and shared environment.
 * Scope: Thin wrapper used by npm scripts (`node scripts/uv-run.mjs [--cwd dir] <uv args…>`)
 *   so contributors never need uv on PATH or an activated virtual environment.
 * Does NOT belong: Any command-specific logic; callers pass the full uv argument list.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { printFailure } from './lib/log.mjs';
import { repoRoot } from './lib/paths.mjs';
import { resolveUv, uvEnv } from './lib/uv.mjs';

async function main() {
  const args = process.argv.slice(2);
  let cwd = repoRoot;
  if (args[0] === '--cwd' && args[1]) {
    cwd = path.resolve(repoRoot, args[1]);
    args.splice(0, 2);
  }
  const uv = await resolveUv();
  const result = spawnSync(uv, args, { cwd, env: uvEnv(), stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

try {
  await main();
} catch (error) {
  printFailure(error);
  process.exit(1);
}
