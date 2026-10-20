// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: `npm run doctor` — explain the local environment when something doesn't work.
 * Scope: Node/npm versions, uv availability, the Python environment, installed models, GPU/ONNX
 *   providers (via `ltts doctor`), free ports and disk space. Read-only; never installs anything.
 * Does NOT belong: Fixing problems (setup.mjs) — the doctor only reports, with suggested next steps.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statfsSync } from 'node:fs';
import path from 'node:path';
import { color, formatBytes, ok, warn } from './lib/log.mjs';
import { repoRoot, serverDir } from './lib/paths.mjs';
import { isPortFree } from './lib/processes.mjs';
import { MIN_NODE } from './lib/python-env.mjs';
import { resolveUv, uvEnv } from './lib/uv.mjs';

function checkNode() {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  const [needMajor = 0, needMinor = 0] = MIN_NODE;
  const nodeOk = major > needMajor || (major === needMajor && minor >= needMinor);
  (nodeOk ? ok : warn)(`Node.js ${process.versions.node} (needs ${MIN_NODE.join('.')}+)`);
  ok(`Platform ${process.platform}-${process.arch}`);
}

/** @returns {Promise<string | null>} */
async function checkUv() {
  try {
    const uv = await resolveUv({ allowDownload: false });
    ok(`uv: ${uv === 'uv' ? 'system uv on PATH' : path.relative(repoRoot, uv)}`);
    return uv;
  } catch {
    warn(
      'uv not installed yet — run `npm run setup` (downloads a checksum-pinned copy into .tools/).',
    );
    return null;
  }
}

/** @param {string | null} uv */
function checkPython(uv) {
  const venv = path.join(serverDir, '.venv');
  if (!existsSync(venv)) {
    warn('Python environment missing — run `npm run setup`.');
    return;
  }
  ok('Python environment: apps/server/.venv');
  if (!uv) return;
  const result = spawnSync(uv, ['run', '--frozen', '--project', serverDir, 'ltts', 'doctor'], {
    cwd: repoRoot,
    env: uvEnv(),
    encoding: 'utf8',
  });
  const output = (result.stdout || result.stderr || '').trim();
  for (const line of output.split(/\r?\n/)) console.log(`  ${color.dim('│')} ${line}`);
}

async function checkPorts() {
  for (const port of [8765, 5173]) {
    if (await isPortFree(port)) ok(`Port ${port} is free`);
    else warn(`Port ${port} is in use — the app will pick the next free port.`);
  }
}

function checkDisk() {
  try {
    const stats = statfsSync(repoRoot);
    const free = stats.bavail * stats.bsize;
    (free > 2 * 1024 ** 3 ? ok : warn)(
      `Free disk space: ${formatBytes(free)} (Kokoro needs ~0.4 GB, Chatterbox ~8 GB)`,
    );
  } catch {
    warn('Could not read free disk space.');
  }
}

async function main() {
  console.log(color.bold('Local TTS doctor\n'));
  checkNode();
  checkPython(await checkUv());
  await checkPorts();
  checkDisk();
  console.log(color.dim('\nIf something is still wrong, see docs/guides/troubleshooting.md.'));
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
