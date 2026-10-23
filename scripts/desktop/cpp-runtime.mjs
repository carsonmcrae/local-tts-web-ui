// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Ship the Microsoft Visual C++ runtime with the bundled Python, and prove that nothing in the
 *   runtime needs a DLL a clean Windows PC lacks.
 * Scope: Copies msvcp140, msvcp140_1, vcruntime140 and vcruntime140_1 next to python.exe from one
 *   Microsoft-signed set (Visual Studio's redistributable folder, found with vswhere, or the folder in
 *   TTSNATIVE_VC_REDIST_DIR), keeping a newer copy already there, and returns their versions and
 *   SHA-256 for the runtime's records. Then reads every .dll, .pyd and .exe in the runtime and fails on
 *   any import that is neither shipped nor part of Windows. Build machines have the C++ runtime
 *   installed system-wide, so a missing copy only shows on a clean PC: ONNX Runtime fails to load and
 *   the default voice can't speak. Usage: `node scripts/desktop/cpp-runtime.mjs <runtime folder>`
 *   checks an existing runtime.
 * Does NOT belong: Parsing PE files (lib/pe-imports.mjs) or the rest of the runtime (build-runtime.mjs).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BootstrapError, ok, printFailure, step } from '../lib/log.mjs';
import { missingImports, peImports } from '../lib/pe-imports.mjs';

const FILES = ['msvcp140.dll', 'msvcp140_1.dll', 'vcruntime140.dll', 'vcruntime140_1.dll'];
/** Libraries built with MSVC 14.40 or later need a C++ runtime at least that new. */
const MINIMUM = '14.40';
const WINDOWS = process.env.SystemRoot ?? String.raw`C:\Windows`;
const POWERSHELL = path.join(WINDOWS, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

/** @param {string} a @param {string} b */
function compareDotted(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

/** The redistributable folder of the newest Visual Studio, or the one named in the environment. */
function redistFolder() {
  const named = process.env.TTSNATIVE_VC_REDIST_DIR;
  if (named) return { folder: named, source: 'TTSNATIVE_VC_REDIST_DIR' };
  const programs = process.env['ProgramFiles(x86)'] ?? String.raw`C:\Program Files (x86)`;
  const vswhere = path.join(programs, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  const studio = existsSync(vswhere)
    ? spawnSync(vswhere, ['-latest', '-products', '*', '-property', 'installationPath'], {
        encoding: 'utf8',
        windowsHide: true,
      }).stdout.trim()
    : '';
  const root = studio && path.join(studio, 'VC', 'Redist', 'MSVC');
  const versions =
    root && existsSync(root) ? readdirSync(root).filter((n) => /^\d+(\.\d+)+$/.test(n)) : [];
  for (const version of versions.sort((a, b) => compareDotted(b, a))) {
    const x64 = path.join(root, version, 'x64');
    const crt = existsSync(x64) && readdirSync(x64).find((n) => /^Microsoft\.VC\d+\.CRT$/.test(n));
    if (crt)
      return { folder: path.join(x64, crt), source: `Visual Studio redistributable ${version}` };
  }
  throw new BootstrapError('The Microsoft Visual C++ redistributable files were not found.', [
    'Install Visual Studio or its Build Tools with the C++ workload, or set TTSNATIVE_VC_REDIST_DIR',
    'to a folder holding Microsoft-signed msvcp140.dll, msvcp140_1.dll, vcruntime140.dll and vcruntime140_1.dll.',
  ]);
}

/**
 * Each file's Authenticode signature and file version, read by Windows itself.
 * @param {string[]} files
 * @returns {{ file: string, valid: boolean, signer: string, version: string }[]}
 */
function describe(files) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$env:TTSNATIVE_FILES.Split('|') | ForEach-Object {",
    '  $s = Get-AuthenticodeSignature -LiteralPath $_',
    '  $v = (Get-Item -LiteralPath $_).VersionInfo',
    "  [pscustomobject]@{ file = $_; valid = ($s.Status -eq 'Valid'); signer = [string]$s.SignerCertificate.Subject;",
    "    version = '{0}.{1}.{2}.{3}' -f $v.FileMajorPart, $v.FileMinorPart, $v.FileBuildPart, $v.FilePrivatePart }",
    '} | ConvertTo-Json -Compress',
  ].join('\n');
  const result = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, TTSNATIVE_FILES: files.join('|') },
  });
  if (result.status !== 0)
    throw new BootstrapError(`Couldn't read the signatures: ${result.stderr.trim()}`);
  const parsed = JSON.parse(result.stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Copies the C++ runtime next to python.exe and returns what was shipped.
 * @param {string} pythonDir
 */
export function bundleCppRuntime(pythonDir) {
  const { folder, source } = redistFolder();
  step(`Microsoft Visual C++ runtime (${source})…`);
  const offered = describe(FILES.map((name) => path.join(folder, name)));
  for (const file of offered) {
    if (!file.valid || !/\bO="?Microsoft Corporation/.test(file.signer)) {
      throw new BootstrapError(`${file.file} is not signed by Microsoft.`);
    }
    if (compareDotted(file.version, MINIMUM) < 0) {
      throw new BootstrapError(
        `${file.file} is version ${file.version}; ${MINIMUM} or later is needed.`,
      );
    }
  }
  const present = FILES.filter((name) => existsSync(path.join(pythonDir, name)));
  const current = new Map(
    (present.length ? describe(present.map((name) => path.join(pythonDir, name))) : []).map(
      (file) => [path.basename(file.file).toLowerCase(), file.version],
    ),
  );
  const files = offered.map((file) => {
    const name = path.basename(file.file).toLowerCase();
    const kept = current.has(name) && compareDotted(current.get(name) ?? '', file.version) > 0;
    if (!kept) copyFileSync(file.file, path.join(pythonDir, name));
    const sha256 = createHash('sha256')
      .update(readFileSync(path.join(pythonDir, name)))
      .digest('hex');
    return { name, version: kept ? current.get(name) : file.version, sha256 };
  });
  return { source, files };
}

/**
 * Fails when any binary in the runtime imports a DLL that is neither shipped nor part of Windows.
 * @param {string} runtimeDir
 */
export function checkRuntimeDlls(runtimeDir) {
  const system32 = path.join(WINDOWS, 'System32');
  const binaries = /** @type {string[]} */ (readdirSync(runtimeDir, { recursive: true }))
    .filter((file) => /\.(dll|pyd|exe)$/i.test(file))
    .map((file) => ({
      path: file.split(path.sep).join('/'),
      imports: peImports(readFileSync(path.join(runtimeDir, file))) ?? [],
    }));
  const missing = missingImports(binaries, {
    appDir: 'python',
    isWindowsDll: (name) => existsSync(path.join(system32, name)),
  });
  if (missing.size) {
    throw new BootstrapError(
      'The runtime needs DLLs that neither ship with it nor come with Windows.',
      [...missing].map(([dll, users]) => `${dll}: needed by ${users.slice(0, 3).join(', ')}`),
    );
  }
  return binaries.length;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const count = checkRuntimeDlls(path.resolve(process.argv[2] ?? 'apps/desktop/runtime'));
    ok(`All ${count} programs and libraries find every DLL they load`);
  } catch (error) {
    printFailure(error);
    process.exit(1);
  }
}
