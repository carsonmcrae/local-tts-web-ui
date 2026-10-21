// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Parse, compare and bump semantic versions (https://semver.org) for the release tooling.
 * Scope: MAJOR.MINOR.PATCH with optional pre-release (`-dev.3`) and build metadata (`+branch.sha`),
 *   precedence as the SemVer 2.0.0 specification defines it, and patch/minor/major bumps.
 * Does NOT belong: Where versions are stored (version-files.mjs) or which bump a change needs
 *   (changes.mjs).
 */

const PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * @typedef {{ major: number, minor: number, patch: number, prerelease: string[], build: string[] }} SemVer
 * @typedef {'major' | 'minor' | 'patch' | 'none'} Bump
 */

/** The bump levels from strongest to weakest. */
export const BUMPS = /** @type {const} */ (['major', 'minor', 'patch', 'none']);

/**
 * @param {string} text
 * @returns {SemVer | null}
 */
export function parseVersion(text) {
  const match = PATTERN.exec(text.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] ? match[5].split('.') : [],
  };
}

/** @param {string} text */
export function isStable(text) {
  const version = parseVersion(text);
  return version !== null && version.prerelease.length === 0 && version.build.length === 0;
}

/**
 * @param {string} text
 * @returns {SemVer}
 */
function require(text) {
  const version = parseVersion(text);
  if (!version) throw new Error(`"${text}" is not a semantic version (MAJOR.MINOR.PATCH)`);
  return version;
}

/** @param {string} a @param {string} b */
function compareIdentifiers(a, b) {
  const numericA = /^\d+$/.test(a);
  const numericB = /^\d+$/.test(b);
  if (numericA && numericB) return Math.sign(Number(a) - Number(b));
  if (numericA !== numericB) return numericA ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * SemVer precedence: negative when `a` is older than `b`, 0 when equal (build metadata is ignored).
 * @param {string} a
 * @param {string} b
 */
export function compareVersions(a, b) {
  const left = require(a);
  const right = require(b);
  for (const key of /** @type {const} */ (['major', 'minor', 'patch'])) {
    if (left[key] !== right[key]) return Math.sign(left[key] - right[key]);
  }
  if (!left.prerelease.length || !right.prerelease.length) {
    return Math.sign(right.prerelease.length - left.prerelease.length);
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const x = left.prerelease[index];
    const y = right.prerelease[index];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const order = compareIdentifiers(x, y);
    if (order) return order;
  }
  return 0;
}

/**
 * The next stable version after `version` for a bump (pre-release and build parts are dropped).
 * @param {string} version
 * @param {Bump} bump
 */
export function bumpVersion(version, bump) {
  const { major, minor, patch } = require(version);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return `${major}.${minor}.${patch}`;
}

/**
 * The strongest of several bumps (`none` when there are none; unknown values are ignored).
 * @param {Iterable<Bump>} bumps
 * @returns {Bump}
 */
export function strongestBump(bumps) {
  let best = BUMPS.length - 1;
  for (const bump of bumps) {
    const index = BUMPS.indexOf(bump);
    if (index >= 0) best = Math.min(best, index);
  }
  return /** @type {Bump} */ (BUMPS[best]);
}
