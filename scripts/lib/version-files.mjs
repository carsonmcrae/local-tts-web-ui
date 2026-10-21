// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The one list of files that carry the product version, and reading or writing it in each.
 * Scope: Root and web package.json, package-lock.json (three entries), the server's pyproject.toml,
 *   `ltts.__version__` and the server's own uv.lock entry, and the desktop crate's Cargo.toml and
 *   Cargo.lock entry (tauri.conf.json reads the root package.json directly). Used by check-version.mjs
 *   to keep them equal and by the release preparation to change them together.
 * Does NOT belong: Choosing the version (changes.mjs) or the CHANGELOG heading (prepare.mjs). The
 *   voice-cloning worker keeps its own version: changing its uv.lock would offer every installation a
 *   needless voice-cloning runtime update (ADR-8).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './paths.mjs';

/**
 * @typedef {{ file: string, pattern: RegExp, optional?: boolean }} VersionFile
 */

/** @type {readonly VersionFile[]} Each pattern's first group is the version. */
export const VERSION_FILES = [
  { file: 'package.json', pattern: /^ {2}"version": "([^"]+)"/m },
  { file: 'apps/web/package.json', pattern: /^ {2}"version": "([^"]+)"/m },
  { file: 'package-lock.json', pattern: /^ {2}"version": "([^"]+)"/m },
  {
    file: 'package-lock.json',
    pattern: /^ {4}"": \{\n {6}"name": "ttsnative",\n {6}"version": "([^"]+)"/m,
  },
  {
    file: 'package-lock.json',
    pattern: /^ {4}"apps\/web": \{\n {6}"name": "@ltts\/web",\n {6}"version": "([^"]+)"/m,
  },
  { file: 'apps/server/pyproject.toml', pattern: /^version = "([^"]+)"/m },
  { file: 'apps/server/src/ltts/__init__.py', pattern: /^__version__ = "([^"]+)"/m },
  { file: 'apps/server/uv.lock', pattern: /^name = "ltts"\nversion = "([^"]+)"/m },
  { file: 'apps/desktop/src-tauri/Cargo.toml', pattern: /^version = "([^"]+)"/m },
  {
    file: 'apps/desktop/src-tauri/Cargo.lock',
    pattern: /^name = "ttsnative-desktop"\nversion = "([^"]+)"/m,
    optional: true,
  },
];

/**
 * The version in each listed file (`null` where it can't be found; optional files that don't exist
 * are left out).
 * @param {(file: string) => string | null} [read] reads a repository file (null when missing)
 * @returns {{ file: string, version: string | null }[]}
 */
export function readVersions(read = readRepoFile) {
  return VERSION_FILES.flatMap(({ file, pattern, optional }) => {
    const text = read(file);
    if (text === null && optional) return [];
    return [{ file, version: (text && pattern.exec(text.replaceAll('\r\n', '\n'))?.[1]) ?? null }];
  });
}

/**
 * Set every listed file to `version` (files keep their line endings and formatting).
 * @param {string} version
 * @param {string} [root]
 */
export function writeVersions(version, root = repoRoot) {
  for (const { file, pattern, optional } of VERSION_FILES) {
    const full = path.join(root, file);
    if (optional && !existsSync(full)) continue;
    const text = readFileSync(full, 'utf8').replaceAll('\r\n', '\n');
    const match = pattern.exec(text);
    if (!match?.[1]) throw new Error(`${file}: no version found to update`);
    const start = match.index + match[0].length - match[1].length - 1;
    writeFileSync(full, `${text.slice(0, start)}${version}${text.slice(start + match[1].length)}`);
  }
}

/** @param {string} file */
function readRepoFile(file) {
  try {
    return readFileSync(path.join(repoRoot, file), 'utf8');
  } catch {
    return null;
  }
}
