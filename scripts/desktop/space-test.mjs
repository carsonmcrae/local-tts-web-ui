// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Prove a silent install refuses a drive without room for TTSNative and leaves it untouched.
 * Scope: Creates a small virtual disk with diskpart (so it needs an administrator, as CI runners are),
 *   mounts it on a free drive letter, runs the installer silently into it and expects a non-zero exit
 *   with nothing written and the Installed Apps entry unchanged; then unmounts and deletes the disk.
 *   Usage: `node scripts/desktop/space-test.mjs <installer.exe>`. Without administrator rights it
 *   explains and exits 0, so a developer's machine isn't failed for a test it can't run.
 * Does NOT belong: The installer's behaviour itself (apps/desktop/windows/hooks.nsh), the smoke test
 *   or the update test.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { powershell } from './processes.mjs';

const system32 = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32');
const DISKPART = path.join(system32, 'diskpart.exe');
const REG = path.join(system32, 'reg.exe');
const KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\TTSNative`;
/** Far below what the app needs (about 600 MB of program files plus the installer's margin). */
const DISK_MB = 256;

/** @param {boolean} condition @param {string} message */
function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ${message}`);
}

const isAdministrator = () =>
  powershell(
    '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
  ) === 'True';

/** A drive letter nothing is using. */
const freeLetter = () =>
  powershell(
    '(([char[]](84..90) + [char[]](68..83)) | Where-Object { -not (Test-Path "$($_):\\") } | Select-Object -First 1)',
  );

/** @param {string} script diskpart commands, one per line */
function diskpart(script, /** @type {string} */ work) {
  const file = path.join(work, `diskpart-${Date.now()}.txt`);
  writeFileSync(file, `${script}\n`);
  const result = spawnSync(DISKPART, ['/s', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`diskpart failed:\n${result.stdout}\n${result.stderr}`);
}

const installedVersion = () =>
  /DisplayVersion\s+REG_SZ\s+(\S+)/.exec(
    spawnSync(REG, ['query', KEY], { encoding: 'utf8' }).stdout ?? '',
  )?.[1];

function main() {
  const installer = process.argv[2];
  if (!installer || !existsSync(installer))
    throw new Error('Usage: node scripts/desktop/space-test.mjs <TTSNative-Setup-x.y.z.exe>');
  if (!isAdministrator()) {
    console.log(
      'Not an administrator: the free-space test needs diskpart, so it was not run here.',
    );
    return;
  }
  // The long path: diskpart matches "select vdisk" by name, and the temp folder may come as an 8.3 short
  // name (RUNNER~1), which then never matches the disk attached under its long name.
  const work = mkdtempSync(path.join(realpathSync.native(tmpdir()), 'ttsnative-space-'));
  const disk = path.join(work, 'small.vhdx');
  const letter = freeLetter();
  check(/^[D-Z]$/.test(letter), `drive letter ${letter}: is free`);
  const before = installedVersion();
  try {
    diskpart(
      [
        `create vdisk file="${disk}" maximum=${DISK_MB} type=expandable`,
        `select vdisk file="${disk}"`,
        'attach vdisk',
        'create partition primary',
        'format fs=ntfs quick label=TINY',
        `assign letter=${letter}`,
      ].join('\n'),
      work,
    );
    const free = Number(powershell(`[math]::Floor((Get-PSDrive ${letter}).Free / 1MB)`));
    check(free > 0 && free < DISK_MB, `${letter}: has ${free} MB free`);
    const target = `${letter}:\\TTSNative`;
    const result = spawnSync(installer, ['/S', `/D=${target}`], { stdio: 'inherit' });
    check(
      result.status !== 0,
      `the silent install into ${target} was refused (exit code ${result.status})`,
    );
    const written = existsSync(target) ? readdirSync(target) : [];
    check(written.length === 0, `nothing was written to ${target}`);
    check(
      installedVersion() === before,
      `the Installed Apps entry is unchanged (${before ?? 'none'})`,
    );
  } finally {
    // Cleaning up never hides the test's own result: a failure here is reported, not thrown.
    try {
      diskpart(`select vdisk file="${disk}"\ndetach vdisk`, work);
      rmSync(work, { recursive: true, force: true });
    } catch (error) {
      console.error(`Cleanup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
