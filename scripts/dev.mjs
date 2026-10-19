// @ts-check
/**
 * Purpose: `npm run dev` — one command that bootstraps and runs the whole app locally.
 * Scope: Runs setup, picks free loopback ports, starts the FastAPI server (auto-reload) and the
 *   Vite dev server, waits for health, and shuts both process trees down together.
 * Does NOT belong: Bootstrap internals (lib/*) or the production-style single-process mode
 *   (start.mjs).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { setup } from './setup.mjs';
import { BootstrapError, color, ok, printFailure, step } from './lib/log.mjs';
import { repoRoot, serverDir, webDir } from './lib/paths.mjs';
import { findFreePort, startManaged, stopManaged, waitForHttp } from './lib/processes.mjs';
import { uvEnv } from './lib/uv.mjs';

const API_PORT = Number(process.env.LTTS_API_PORT ?? 8765);
const WEB_PORT = Number(process.env.LTTS_WEB_PORT ?? 5173);
const HOST = '127.0.0.1';

/** @type {import('./lib/processes.mjs').Managed[]} */
const managed = [];

function viteBin() {
  const require = createRequire(path.join(webDir, 'package.json'));
  return path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
}

async function main() {
  const { uv } = await setup();
  const apiPort = await findFreePort(API_PORT);
  const webPort = await findFreePort(WEB_PORT);
  if (apiPort === null || webPort === null) {
    throw new BootstrapError('No free local port found for the app.', [
      'Set LTTS_API_PORT / LTTS_WEB_PORT to free ports and try again.',
    ]);
  }

  step(`Starting API on http://${HOST}:${apiPort} and web UI on http://${HOST}:${webPort}…`);
  const api = startManaged({
    name: 'api',
    label: color.magenta('[api]'),
    command: uv,
    args: ['run', '--frozen', '--project', serverDir, 'ltts', 'serve', '--host', HOST, '--port', String(apiPort), '--reload'],
    cwd: repoRoot,
    env: { ...uvEnv(), LTTS_ENV: 'development', LTTS_UV_BIN: uv },
  });
  managed.push(api);
  let shuttingDown = false;
  const shutdown = (/** @type {number} */ code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(color.dim('\nStopping local services…'));
    for (const proc of managed) stopManaged(proc);
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  api.child.on('exit', (code) => {
    if (!shuttingDown) {
      printFailure(new BootstrapError(`The API server exited unexpectedly (code ${code}).`, ['See the [api] lines above.']));
      shutdown(1);
    }
  });

  const healthy = await waitForHttp(`http://${HOST}:${apiPort}/api/health`, 90_000, () => api.child.exitCode === null);
  if (!healthy) throw new BootstrapError('The API server did not become healthy within 90 seconds.');
  ok('API healthy');

  const openBrowser = process.env.LTTS_NO_OPEN !== '1' && !process.env.CI;
  const web = startManaged({
    name: 'web',
    label: color.cyan('[web]'),
    command: process.execPath,
    args: [viteBin(), '--host', HOST, '--port', String(webPort), '--strictPort', ...(openBrowser ? ['--open'] : [])],
    cwd: webDir,
    env: { ...process.env, LTTS_API_PORT: String(apiPort) },
  });
  managed.push(web);
  web.child.on('exit', (code) => {
    if (!shuttingDown) {
      printFailure(new BootstrapError(`The web dev server exited unexpectedly (code ${code}).`));
      shutdown(1);
    }
  });
  const webReady = await waitForHttp(`http://${HOST}:${webPort}/`, 60_000, () => web.child.exitCode === null);
  if (!webReady) throw new BootstrapError('The web dev server did not start within 60 seconds.');
  console.log('');
  ok(`${color.bold('Local TTS is running:')} ${color.cyan(`http://${HOST}:${webPort}`)}`);
  console.log(color.dim('  Press Ctrl+C to stop both services.\n'));
}

main().catch((error) => {
  printFailure(error);
  for (const proc of managed) stopManaged(proc);
  process.exit(1);
});
