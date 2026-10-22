// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: `npm run desktop:build` — build the Windows installer, TTSNative-Setup-<version>.exe.
 * Scope: Stamps one build version (the release number, or a development identifier) into the web UI
 *   and the app, builds the web UI, assembles the bundled runtime, runs `tauri build` (per-user NSIS
 *   installer) and copies the installer, its updater signature and a SHA-256 line to dist/desktop/.
 *   Without TAURI_SIGNING_PRIVATE_KEY the installer has no updater signature: fine for testing, but
 *   such a build can never be offered as an update. TTSNATIVE_WINDOWS_SIGN_COMMAND (for example Azure
 *   Artifact Signing) adds Authenticode signatures to the app and installer (`%1` is the file).
 *   TTSNATIVE_TAURI_CONFIG (the update test's throwaway key and local address) is taken only by a
 *   test build (TTSNATIVE_TEST_HOOKS=1) and may change nothing but the updater section.
 *   Windows only; needs Rust and the MSVC build tools.
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
import { overrideArgs } from './build-config.mjs';
import { checkTestHooks } from './check-test-hooks.mjs';

const desktopDir = path.join(repoRoot, 'apps', 'desktop');
const releaseDir = path.join(desktopDir, 'src-tauri', 'target', 'release');
const nsisDir = path.join(releaseDir, 'bundle', 'nsis');
const outDir = path.join(repoRoot, 'dist', 'desktop');
/** The automated installer tests need the `test-hooks` feature; a release version can never have it. */
const testHooks = process.env.TTSNATIVE_TEST_HOOKS === '1';

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

/**
 * `tauri build`: the updater signature when the key is present, Authenticode when a sign command is
 * configured, the test hooks only for a test build, and a check of the binary either way.
 * @param {string} version
 * @param {NodeJS.ProcessEnv} env
 */
function tauriBuild(version, env) {
  const signed = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY);
  if (!signed) warn('TAURI_SIGNING_PRIVATE_KEY is not set: building without an updater signature.');
  rmSync(nsisDir, { recursive: true, force: true });
  const signCommand = process.env.TTSNATIVE_WINDOWS_SIGN_COMMAND;
  const override = {
    version,
    bundle: {
      createUpdaterArtifacts: signed,
      ...(signCommand ? { windows: { signCommand } } : {}),
    },
  };
  if (!signCommand)
    warn('No TTSNATIVE_WINDOWS_SIGN_COMMAND: the installer has no Authenticode signature.');
  node(
    [
      path.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
      'build',
      '--ci',
      '--bundles',
      'nsis',
      '--config',
      JSON.stringify(override),
      ...(testHooks ? ['--features', 'test-hooks'] : []),
      // Test builds only (update-test.mjs): another update key and a local update address. Any other
      // build refuses the overlay (build-config.mjs).
      ...overrideArgs({ testHooks, override: process.env.TTSNATIVE_TAURI_CONFIG }),
    ],
    { cwd: desktopDir, env },
  );
  // Fail closed: the binary must contain the hooks exactly when this is a test build.
  const problem = checkTestHooks(
    path.join(releaseDir, 'TTSNative.exe'),
    testHooks ? 'present' : 'absent',
  );
  if (problem) throw new BootstrapError(problem);
  ok(`TTSNative.exe: test hooks ${testHooks ? 'present (test build)' : 'absent'}`);
}

function main() {
  if (process.platform !== 'win32')
    throw new BootstrapError('The Windows app is built on Windows.');
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new BootstrapError('Run this through npm: `npm run desktop:build`.');
  const version = buildVersion();
  if (testHooks && /^\d+\.\d+\.\d+$/.test(version)) {
    throw new BootstrapError(
      `TTSNATIVE_TEST_HOOKS=1 would build the test hooks into release version ${version}; unset it.`,
    );
  }
  const env = { TTSNATIVE_BUILD_VERSION: version };
  step(
    `Building TTSNative ${version} for Windows${testHooks ? ' (test build, with test hooks)' : ''}…`,
  );
  node([npmCli, 'run', 'build', '--workspace', '@ltts/web'], { env });
  node([path.join(repoRoot, 'scripts', 'desktop', 'build-runtime.mjs')], { env });
  node([path.join(repoRoot, 'scripts', 'desktop', 'notices.mjs'), version], { env });
  tauriBuild(version, env);
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
  copyFileSync(
    path.join(desktopDir, 'runtime', 'runtime-manifest.json'),
    path.join(outDir, 'desktop-runtime-manifest.json'),
  );
  ok(`${name}: ${(statSync(target).size / 1_048_576).toFixed(0)} MB, SHA-256 ${sha256}`);
}

try {
  main();
} catch (error) {
  printFailure(error);
  process.exit(1);
}
