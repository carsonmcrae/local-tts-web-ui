// @ts-check
/**
 * Purpose: Create and verify the server's isolated Python environment through uv.
 * Scope: Node version gate, `uv sync --frozen` against the committed lockfile, and a helper
 *   that runs commands inside that environment with shared environment variables.
 * Does NOT belong: Downloading uv (uv.mjs) or starting long-running services (dev.mjs).
 */
import { spawnSync } from 'node:child_process';
import { BootstrapError, ok, step } from './log.mjs';
import { serverDir } from './paths.mjs';
import { resolveUv, uvEnv } from './uv.mjs';

export const MIN_NODE = [22, 12];

export function assertNodeVersion() {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  const [needMajor = 0, needMinor = 0] = MIN_NODE;
  if (major < needMajor || (major === needMajor && minor < needMinor)) {
    throw new BootstrapError(`Node.js ${MIN_NODE.join('.')} or newer is required (found ${process.versions.node}).`, [
      'Install the current LTS release from https://nodejs.org or with your version manager (see .nvmrc).',
    ]);
  }
}

/**
 * Run a uv sub-command in the server project and fail with a readable error.
 * @param {string} uv
 * @param {string[]} args
 * @param {{ quiet?: boolean, cwd?: string }} [options]
 */
export function runUv(uv, args, { quiet = false, cwd = serverDir } = {}) {
  const result = spawnSync(uv, args, {
    cwd,
    env: uvEnv(),
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw new BootstrapError(`Could not run uv: ${result.error.message}`);
  return result;
}

/**
 * Install exactly the locked Python dependencies (and Python 3.12 itself if missing).
 * @param {{ dev?: boolean }} [options]
 * @returns {Promise<string>} the uv binary path for follow-up calls
 */
export async function syncServerEnvironment({ dev = true } = {}) {
  const uv = await resolveUv();
  step('Syncing the Python environment from apps/server/uv.lock…');
  const args = ['sync', '--frozen', '--project', serverDir];
  if (!dev) args.push('--no-dev');
  const result = runUv(uv, args);
  if (result.status !== 0) {
    throw new BootstrapError('Installing the locked Python dependencies failed.', [
      'Scroll up for the uv error. Common causes: no network on first run, or a proxy blocking',
      'files.pythonhosted.org / github.com (Python 3.12 download).',
      'uv installs Python 3.12 into .tools/python — no system Python is required or modified.',
    ]);
  }
  ok('Python environment ready (apps/server/.venv)');
  return uv;
}
