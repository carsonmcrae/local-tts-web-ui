// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The version a build reports: the release number for an official release, otherwise a
 *   development identifier unique to its branch and commit.
 * Scope: `X.Y.Z` only when HEAD is the commit tagged vX.Y.Z of package.json's version and nothing is
 *   modified; otherwise `<next>-dev.<commits since the last release>+<branch>.<commit>[.dirty]`, where
 *   <next> is the version the pending change files lead to, so a development build always sorts
 *   before the release it becomes and after the release it started from. TTSNATIVE_BUILD_VERSION
 *   overrides it (validated) for reproducing a build.
 * Does NOT belong: Which files carry the version (version-files.mjs).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readChanges } from './changes.mjs';
import { headFacts, headIsTagged, releaseTags } from './git.mjs';
import { repoRoot } from './paths.mjs';
import { bumpVersion, parseVersion, strongestBump } from './semver.mjs';

/** A branch name as SemVer build metadata (letters, digits and hyphens). @param {string} branch */
export function branchSlug(branch) {
  const slug = branch
    .toLowerCase()
    .replaceAll(/[^0-9a-z-]+/g, '-')
    .replaceAll(/-{2,}/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '');
  return slug || 'detached';
}

/**
 * The next release a development build leads to.
 * @param {{ current: string, tagged: string[], bumps: import('./semver.mjs').Bump[] }} facts
 */
export function developmentBase({ current, tagged, bumps }) {
  const pending = strongestBump(bumps);
  if (pending !== 'none') return bumpVersion(current, pending);
  // A version prepared but not yet tagged is still ahead; after its release, assume a patch.
  return tagged.includes(current) ? bumpVersion(current, 'patch') : current;
}

/**
 * @param {{ base: string, sinceTag: number, branch: string, sha: string, dirty: boolean }} facts
 */
export function developmentVersion({ base, sinceTag, branch, sha, dirty }) {
  const meta = [
    branchSlug(branch),
    sha.replaceAll(/[^0-9a-zA-Z]/g, ''),
    ...(dirty ? ['dirty'] : []),
  ];
  return `${base}-dev.${sinceTag}+${meta.join('.')}`;
}

/** @returns {string} */
export function buildVersion() {
  const override = process.env.TTSNATIVE_BUILD_VERSION;
  if (override) {
    if (!parseVersion(override))
      throw new Error(`TTSNATIVE_BUILD_VERSION "${override}" is not SemVer`);
    return override;
  }
  const current = /** @type {{ version: string }} */ (
    JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  ).version;
  const facts = headFacts();
  if (!facts.dirty && headIsTagged(current)) return current;
  const base = developmentBase({
    current,
    tagged: releaseTags(),
    bumps: readChanges().map((change) => change.bump),
  });
  return developmentVersion({ base, ...facts });
}
