// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Keep the single product version consistent everywhere it appears, and never behind a
 *   published release.
 * Scope: Every file in scripts/lib/version-files.mjs plus the newest released heading in
 *   CHANGELOG.md must hold the root package.json version, a stable MAJOR.MINOR.PATCH; when release
 *   tags are available, that version may not be older than the newest one.
 * Does NOT belong: Choosing or bumping versions (`npm run release:prepare`, see
 *   docs/guides/release-process.md) or pull-request rules (check-changes.mjs).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { releaseTags } from './lib/git.mjs';
import { color, ok } from './lib/log.mjs';
import { repoRoot } from './lib/paths.mjs';
import { compareVersions, isStable } from './lib/semver.mjs';
import { readVersions } from './lib/version-files.mjs';

const found = readVersions();
const changelog = readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
found.push({
  file: 'CHANGELOG.md',
  version: /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1] ?? null,
});

const expected = found[0]?.version ?? '';
/** @param {string} message */
const fail = (message) => {
  console.error(`${color.red('✗')} ${message}`);
  process.exitCode = 1;
};
if (!isStable(expected)) fail(`package.json version "${expected}" is not MAJOR.MINOR.PATCH.`);
for (const { file, version } of found.filter((entry) => entry.version !== expected)) {
  fail(`${file} has ${version ?? 'no version'}, expected ${expected}`);
}
const newest = releaseTags()[0];
if (newest && isStable(expected) && compareVersions(expected, newest) < 0) {
  fail(`version ${expected} is older than the published v${newest}; versions never go backwards.`);
}
if (!process.exitCode) ok(`Version ${expected} is consistent across ${found.length} places`);
