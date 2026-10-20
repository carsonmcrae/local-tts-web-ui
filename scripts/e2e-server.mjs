// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Start an isolated, production-style server for Playwright end-to-end tests.
 * Scope: Serves the built web UI and API from one process on a given port, with a fresh throwaway
 *   data directory (.e2e-data/<port>) and either the real installed models or none at all
 *   (`--no-models`, to test the "model not installed" experience). Stops its process tree on exit.
 * Does NOT belong: Building the UI (npm run build runs first) or the tests themselves.
 */
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { color, printFailure } from './lib/log.mjs';
import { repoRoot, serverDir, webDir } from './lib/paths.mjs';
import { exitWithChild, startManaged } from './lib/processes.mjs';
import { resolveUv, uvEnv } from './lib/uv.mjs';

const args = process.argv.slice(2);
const port = args[args.indexOf('--port') + 1] ?? '8799';
const withoutModels = args.includes('--no-models');

async function main() {
  const uv = await resolveUv({ allowDownload: false });
  const dataDir = path.join(repoRoot, '.e2e-data', port);
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  const env = {
    ...uvEnv(),
    LTTS_ENV: 'production',
    LTTS_DATA_DIR: dataDir,
    LTTS_MODELS_DIR: withoutModels
      ? path.join(dataDir, 'no-models')
      : path.join(repoRoot, 'data', 'models'),
    LTTS_ENGINES_DIR: withoutModels
      ? path.join(dataDir, 'no-engines')
      : path.join(repoRoot, 'data', 'engines'),
    LTTS_UV_BIN: uv,
  };
  const server = startManaged({
    name: 'e2e',
    label: color.dim(`[e2e:${port}]`),
    command: uv,
    args: [
      'run',
      '--frozen',
      '--project',
      serverDir,
      'ltts',
      'serve',
      '--port',
      port,
      '--static',
      path.join(webDir, 'dist'),
    ],
    cwd: repoRoot,
    env,
  });
  exitWithChild(server);
}

try {
  await main();
} catch (error) {
  printFailure(error);
  process.exit(1);
}
