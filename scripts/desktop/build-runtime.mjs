// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Assemble the runtime the Windows desktop app bundles: everything the core reader needs, so
 *   users install no developer tools.
 * Scope: Into apps/desktop/runtime/: Python (the exact version in apps/desktop/runtime.json, installed
 *   by the checksum-pinned uv, which verifies it) with the server's locked, hash-checked packages and
 *   the `ltts` package, byte-compiled so nothing is written into the install folder at run time; the
 *   built web UI; the optional voice-cloning worker's project (installed later, on request, into the
 *   user's folder); the pinned uv; and the default Kokoro model, downloaded and SHA-256 verified by
 *   the server's own model store (cached in .tools/desktop-cache between builds).
 *   Usage: `node scripts/desktop/build-runtime.mjs` after `npm run build` (Windows only).
 * Does NOT belong: Building the installer (build.mjs) or the desktop shell (apps/desktop/src-tauri).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { BootstrapError, formatBytes, ok, printFailure, step } from '../lib/log.mjs';
import { readToolchain, repoRoot, serverDir, toolsDir, webDir } from '../lib/paths.mjs';
import { resolveUv } from '../lib/uv.mjs';

const desktopDir = path.join(repoRoot, 'apps', 'desktop');
const out = path.join(desktopDir, 'runtime');
const cache = path.join(toolsDir, 'desktop-cache');
const manifest =
  /** @type {{ python: string, bundledModels: string[], removeFromPython: string[] }} */ (
    JSON.parse(readFileSync(path.join(desktopDir, 'runtime.json'), 'utf8'))
  );

/**
 * @param {string} command
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 */
function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, UV_NO_PROGRESS: '1', ...env },
  });
  if (result.status !== 0) {
    throw new BootstrapError(`${path.basename(command)} ${args.slice(0, 2).join(' ')} failed.`);
  }
}

/** The pinned uv only: the bundled copy must be the verified build, never one found on PATH. */
async function pinnedUv() {
  delete process.env.LTTS_UV_PATH;
  process.env.LTTS_UV_PINNED_ONLY = '1';
  const uv = await resolveUv();
  const expected = path.join(toolsDir, 'uv', readToolchain().uv.version, 'uv.exe');
  if (path.resolve(uv) !== expected)
    throw new BootstrapError(`Expected the pinned uv at ${expected}.`);
  return uv;
}

/** @param {string} uv */
function installPython(uv) {
  step(`Python ${manifest.python} (installed and verified by uv)…`);
  const pythons = path.join(cache, 'python');
  run(uv, ['python', 'install', manifest.python, '--no-bin', '--no-registry'], {
    UV_PYTHON_INSTALL_DIR: pythons,
  });
  const folder = readdirSync(pythons).find((name) =>
    name.startsWith(`cpython-${manifest.python}-windows-x86_64`),
  );
  if (!folder) throw new BootstrapError(`uv did not install Python ${manifest.python}.`);
  const target = path.join(out, 'python');
  cpSync(path.join(pythons, folder), target, { recursive: true });
  // The server runs under its own name, so Task Manager shows "ttsnative-backend" rather than Python.
  copyFileSync(path.join(target, 'python.exe'), path.join(target, 'ttsnative-backend.exe'));
  return path.join(target, 'python.exe');
}

/**
 * @param {string} uv
 * @param {string} python
 */
function installServer(uv, python) {
  step('Server packages (locked and hash-checked)…');
  const requirements = path.join(cache, 'server-requirements.txt');
  mkdirSync(cache, { recursive: true });
  run(uv, [
    'export',
    '--project',
    serverDir,
    '--frozen',
    '--no-dev',
    '--no-emit-project',
    '--format',
    'requirements-txt',
    '--quiet',
    '-o',
    requirements,
  ]);
  const install = ['pip', 'install', '--python', python, '--break-system-packages'];
  run(uv, [...install, '--require-hashes', '--no-deps', '-r', requirements, '--link-mode', 'copy']);
  run(uv, [...install, '--no-deps', '--link-mode', 'copy', serverDir]);
  // The app never installs packages into its own runtime, so the pip that ships with Python goes.
  run(uv, ['pip', 'uninstall', '--python', python, '--break-system-packages', 'pip']);
  // Unused parts of the standard library, and the console scripts packages added, are left out.
  for (const part of manifest.removeFromPython) {
    rmSync(path.join(out, 'python', part), { recursive: true, force: true });
  }
  step('Byte-compiling (nothing is written into the install folder at run time)…');
  run(python, [
    '-I',
    '-X',
    'utf8',
    '-m',
    'compileall',
    '-q',
    '-j',
    '0',
    '--invalidation-mode',
    'unchecked-hash',
    path.join(out, 'python', 'Lib'),
  ]);
}

/** @param {string} python */
function installModels(python) {
  const models = path.join(cache, 'models');
  for (const artifact of manifest.bundledModels) {
    step(`Model ${artifact} (downloaded once, SHA-256 verified)…`);
    run(python, ['-I', '-X', 'utf8', '-m', 'ltts.cli', 'models', 'ensure', artifact], {
      LTTS_MODELS_DIR: models,
      LTTS_DATA_DIR: path.join(cache, 'data'),
    });
    cpSync(path.join(models, artifact), path.join(out, 'models', artifact), {
      recursive: true,
      filter: (source) => !source.endsWith('.part'),
    });
  }
}

/** @param {string} uv */
function copyApps(uv) {
  step('Web UI, voice-cloning project and uv…');
  const dist = path.join(webDir, 'dist');
  if (!existsSync(path.join(dist, 'index.html'))) {
    throw new BootstrapError('The web UI is not built.', ['Run `npm run build` first.']);
  }
  cpSync(dist, path.join(out, 'web'), { recursive: true });
  const worker = path.join(repoRoot, 'apps', 'chatterbox-worker');
  for (const item of ['pyproject.toml', 'uv.lock', 'README.md', 'src']) {
    cpSync(path.join(worker, item), path.join(out, 'worker', item), { recursive: true });
  }
  mkdirSync(path.join(out, 'uv'), { recursive: true });
  copyFileSync(uv, path.join(out, 'uv', 'uv.exe'));
  copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(out, 'LICENSE.txt'));
}

/** @param {string} folder @returns {number} */
function folderBytes(folder) {
  return readdirSync(folder, { withFileTypes: true }).reduce((total, entry) => {
    const full = path.join(folder, entry.name);
    return total + (entry.isDirectory() ? folderBytes(full) : statSync(full).size);
  }, 0);
}

async function main() {
  if (process.platform !== 'win32') {
    throw new BootstrapError('The desktop runtime is built on Windows (x64).');
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const uv = await pinnedUv();
  const python = installPython(uv);
  installServer(uv, python);
  installModels(python);
  copyApps(uv);
  writeFileSync(
    path.join(out, 'README.txt'),
    'TTSNative runtime: the bundled Python, the local server, the web UI and the default voice model.\r\n' +
      'Third-party licences: python\\LICENSE.txt, the packages in python\\Lib\\site-packages\\*.dist-info,\r\n' +
      'web\\THIRD-PARTY-LICENSES.md and web\\FONT-LICENSES.txt. Kokoro model weights: Apache-2.0.\r\n',
  );
  writeFileSync(
    path.join(out, 'runtime-manifest.json'),
    `${JSON.stringify(provenance(uv), null, 2)}\n`,
  );
  ok(`Desktop runtime ready in apps/desktop/runtime (${formatBytes(folderBytes(out))})`);
}

/**
 * What went into the runtime, for the release's records (the packages themselves are in the server SBOM).
 * @param {string} uv
 */
function provenance(uv) {
  const sha256 = (/** @type {string} */ file) =>
    createHash('sha256').update(readFileSync(file)).digest('hex');
  const models = JSON.parse(
    readFileSync(path.join(serverDir, 'src', 'ltts', 'modelstore', 'manifest.json'), 'utf8'),
  ).artifacts;
  return {
    python: {
      version: manifest.python,
      source: 'python-build-standalone, installed and verified by uv',
    },
    uv: { version: readToolchain().uv.version, sha256: sha256(uv) },
    serverLockSha256: sha256(path.join(serverDir, 'uv.lock')),
    workerLockSha256: sha256(path.join(repoRoot, 'apps', 'chatterbox-worker', 'uv.lock')),
    models: manifest.bundledModels.map((id) => ({ id, files: models[id].files })),
  };
}

try {
  await main();
} catch (error) {
  printFailure(error);
  process.exit(1);
}
