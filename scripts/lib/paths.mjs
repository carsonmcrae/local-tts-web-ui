// @ts-check
/**
 * Purpose: Single source of truth for repository-relative paths used by the scripts.
 * Scope: Repo root, app directories, the local toolchain directory and the toolchain manifest.
 * Does NOT belong: Runtime data paths (the server owns those via its settings).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const serverDir = path.join(repoRoot, 'apps', 'server');
export const webDir = path.join(repoRoot, 'apps', 'web');
export const toolsDir = path.join(repoRoot, '.tools');
export const pythonInstallDir = path.join(toolsDir, 'python');

/**
 * @typedef {{ file: string, size: number, sha256: string }} Artifact
 * @typedef {{ version: string, minimumSystemVersion: string, releaseBaseUrl: string,
 *   artifacts: Record<string, Artifact> }} UvPin
 * @typedef {{ uv: UvPin, allowedDownloadHosts: string[] }} Toolchain
 */

/** @returns {Toolchain} */
export function readToolchain() {
  const raw = readFileSync(path.join(repoRoot, 'scripts', 'toolchain.json'), 'utf8');
  return /** @type {Toolchain} */ (JSON.parse(raw));
}
