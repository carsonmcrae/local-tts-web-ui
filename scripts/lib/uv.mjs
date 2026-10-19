// @ts-check
/**
 * Purpose: Locate or provision the `uv` Python manager that owns the server's environment.
 * Scope: Prefer an explicit LTTS_UV_PATH, then a project-local pinned copy, then a recent
 *   system uv; otherwise download the pinned release and verify its checksum. Also builds the
 *   environment variables every uv invocation shares (project-local managed Python).
 * Does NOT belong: Running the server or syncing dependencies (python-env.mjs).
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { extractFromTarGz, extractFromZip } from './archive.mjs';
import { downloadVerified } from './download.mjs';
import { BootstrapError, formatBytes, ok, step } from './log.mjs';
import { pythonInstallDir, readToolchain, toolsDir } from './paths.mjs';

const exe = process.platform === 'win32' ? 'uv.exe' : 'uv';

/**
 * Compare dotted numeric versions.
 * @param {string} a
 * @param {string} b
 * @returns {number} negative if a < b, 0 if equal, positive if a > b
 */
export function compareVersions(a, b) {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * @param {string} binary
 * @returns {string | null} the version reported by `uv --version`, or null if it cannot run
 */
function probeVersion(binary) {
  try {
    const out = execFileSync(binary, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return /uv (\d+\.\d+\.\d+)/.exec(out)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** @returns {string} platform key used in scripts/toolchain.json */
export function platformKey() {
  return `${process.platform}-${process.arch}`;
}

/** @param {import('./paths.mjs').UvPin} pin */
async function downloadUv(pin) {
  const artifact = pin.artifacts[platformKey()];
  if (!artifact) {
    throw new BootstrapError(`No pinned uv build for ${platformKey()}.`, [
      'Install uv yourself (https://docs.astral.sh/uv/getting-started/installation/)',
      'then run again, or point LTTS_UV_PATH at an existing uv binary.',
    ]);
  }
  const targetDir = path.join(toolsDir, 'uv', pin.version);
  mkdirSync(targetDir, { recursive: true });
  const archivePath = path.join(targetDir, artifact.file);
  step(`Downloading uv ${pin.version} (${formatBytes(artifact.size)}, checksum-pinned)…`);
  await downloadVerified({
    url: `${pin.releaseBaseUrl}/${artifact.file}`,
    destination: archivePath,
    size: artifact.size,
    sha256: artifact.sha256,
    allowedHosts: readToolchain().allowedDownloadHosts,
  });
  const archive = readFileSync(archivePath);
  const binary = artifact.file.endsWith('.zip')
    ? extractFromZip(archive, exe)
    : extractFromTarGz(archive, exe);
  const binaryPath = path.join(targetDir, exe);
  writeFileSync(binaryPath, binary, { mode: 0o755 });
  chmodSync(binaryPath, 0o755);
  rmSync(archivePath, { force: true });
  ok(`uv ${pin.version} verified and installed to .tools/uv/${pin.version}`);
  return binaryPath;
}

/**
 * Resolve a usable uv binary, downloading the pinned build only when nothing suitable exists.
 * @param {{ allowDownload?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function resolveUv({ allowDownload = true } = {}) {
  const { uv: pin } = readToolchain();
  const explicit = process.env.LTTS_UV_PATH;
  if (explicit) {
    if (!probeVersion(explicit)) {
      throw new BootstrapError(`LTTS_UV_PATH is set but ${explicit} is not a working uv binary.`);
    }
    return explicit;
  }
  const local = path.join(toolsDir, 'uv', pin.version, exe);
  if (existsSync(local) && probeVersion(local)) return local;
  // LTTS_UV_PINNED_ONLY=1 ignores a system uv (used by CI to exercise the verified download).
  const systemVersion = process.env.LTTS_UV_PINNED_ONLY === '1' ? null : probeVersion('uv');
  if (systemVersion && compareVersions(systemVersion, pin.minimumSystemVersion) >= 0) return 'uv';
  if (!allowDownload) {
    throw new BootstrapError('uv is not installed yet.', ['Run `npm run setup` first.']);
  }
  return downloadUv(pin);
}

/**
 * Environment shared by every uv call: managed Python lives inside the repo (.tools/python)
 * so bootstrapping never modifies system-wide Python installations.
 * @returns {NodeJS.ProcessEnv}
 */
export function uvEnv() {
  return {
    ...process.env,
    UV_PYTHON_INSTALL_DIR: pythonInstallDir,
    UV_PYTHON_DOWNLOADS: process.env.UV_PYTHON_DOWNLOADS ?? 'automatic',
    UV_NO_PROGRESS: process.stdout.isTTY ? process.env.UV_NO_PROGRESS : '1',
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
  };
}
