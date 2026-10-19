// @ts-check
/**
 * Purpose: `npm run start` — production-style local run: one Python process serves the built UI
 *   and the API on a single loopback port.
 * Scope: Setup, a fresh production build of the web app, then `ltts serve --static`.
 * Does NOT belong: Hot-reload development (dev.mjs).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { setup } from './setup.mjs';
import { BootstrapError, color, printFailure, step } from './lib/log.mjs';
import { repoRoot, serverDir, webDir } from './lib/paths.mjs';
import { findFreePort, startManaged, stopManaged } from './lib/processes.mjs';
import { uvEnv } from './lib/uv.mjs';

async function main() {
  const { uv } = await setup();
  if (!process.argv.includes('--no-build')) {
    step('Building the web app…');
    // npm sets npm_execpath to its own CLI script; running it with this Node avoids a shell.
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new BootstrapError('Run this through npm: `npm run start`.');
    const build = spawnSync(
      process.execPath,
      [npmCli, 'run', 'build', '--workspace', '@ltts/web'],
      {
        cwd: repoRoot,
        stdio: 'inherit',
      },
    );
    if (build.status !== 0) throw new BootstrapError('The web build failed; see the output above.');
  }
  const port = await findFreePort(Number(process.env.LTTS_PORT ?? 8765));
  if (port === null) throw new BootstrapError('No free local port found. Set LTTS_PORT and retry.');
  const server = startManaged({
    name: 'server',
    label: color.magenta('[app]'),
    command: uv,
    args: [
      'run',
      '--frozen',
      '--project',
      serverDir,
      'ltts',
      'serve',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--static',
      path.join(webDir, 'dist'),
      ...(process.env.LTTS_NO_OPEN === '1' ? [] : ['--open']),
    ],
    cwd: repoRoot,
    env: { ...uvEnv(), LTTS_ENV: 'production', LTTS_UV_BIN: uv },
  });
  const stop = () => {
    stopManaged(server);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.child.on('exit', (code) => process.exit(code ?? 1));
}

main().catch((error) => {
  printFailure(error);
  process.exit(1);
});
