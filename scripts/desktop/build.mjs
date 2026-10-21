// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: `npm run desktop:build` — build the Windows installer, TTSNative-Setup-<version>.exe.
 * Scope: Stamps one build version (the release number, or a development identifier) into the web UI
 *   and the app, builds the web UI, assembles the bundled runtime, runs `tauri build` (per-user NSIS
 *   installer) and copies the installer, its updater signature and a SHA-256 line to dist/desktop/.
 *   Without TAURI_SIGNING_PRIVATE_KEY the installer has no updater signature: fine for testing, but
 *   such a build can never be offered as an update. Windows only; needs Rust and the MSVC build tools.
 * Does NOT belong: What goes into the runtime (build-runtime.mjs) or publishing (release.yml).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { buildVersion } from '../lib/build-version.mjs';
import { BootstrapError, ok, printFailure, step, warn } from '../lib/log.mjs';
import { repoRoot } from '../lib/paths.mjs';

const desktopDir = path.join(repoRoot, 'apps', 'desktop');
const nsisDir = path.join(desktopDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const outDir = path.join(repoRoot, 'dist', 'desktop');

/**
 * @param {string[]} args arguments for this Node.js
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 */
function node(args, { cwd = repoRoot, env = {} } = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    windowsHide: true,
  });
  if (result.status !== 0) throw new BootstrapError(`${args.slice(0, 3).join(' ')} failed.`);
}

function main() {
  if (process.platform !== 'win32')
    throw new BootstrapError('The Windows app is built on Windows.');
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new BootstrapError('Run this through npm: `npm run desktop:build`.');
  const version = buildVersion();
  const env = { TTSNATIVE_BUILD_VERSION: version };
  step(`Building TTSNative ${version} for Windows…`);
  node([npmCli, 'run', 'build', '--workspace', '@ltts/web'], { env });
  node([path.join(repoRoot, 'scripts', 'desktop', 'build-runtime.mjs')], { env });
  const signed = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY);
  if (!signed) warn('TAURI_SIGNING_PRIVATE_KEY is not set: building without an updater signature.');
  rmSync(nsisDir, { recursive: true, force: true });
  const override = { version, bundle: { createUpdaterArtifacts: signed } };
  node(
    [
      path.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
      'build',
      '--ci',
      '--bundles',
      'nsis',
      '--config',
      JSON.stringify(override),
    ],
    { cwd: desktopDir, env },
  );
  const built = readdirSync(nsisDir).find((name) => name.endsWith('-setup.exe'));
  if (!built) throw new BootstrapError(`No installer was produced in ${nsisDir}.`);
  mkdirSync(outDir, { recursive: true });
  const name = `TTSNative-Setup-${version}.exe`;
  const target = path.join(outDir, name);
  copyFileSync(path.join(nsisDir, built), target);
  if (existsSync(path.join(nsisDir, `${built}.sig`))) {
    copyFileSync(path.join(nsisDir, `${built}.sig`), `${target}.sig`);
  }
  const sha256 = createHash('sha256').update(readFileSync(target)).digest('hex');
  writeFileSync(`${target}.sha256`, `${sha256}  ${name}\n`);
  writeFileSync(path.join(outDir, 'version.txt'), version);
  ok(`${name}: ${(statSync(target).size / 1_048_576).toFixed(0)} MB, SHA-256 ${sha256}`);
}

try {
  main();
} catch (error) {
  printFailure(error);
  process.exit(1);
}
