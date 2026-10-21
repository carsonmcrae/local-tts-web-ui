// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for where versions live and what a build calls itself.
 * Scope: Every version file agrees in the repository; writing a version changes each file (in a temporary
 *   copy) and nothing else; development identifiers are unique per branch and commit, valid SemVer,
 *   newer than the release they start from and older than the one they become.
 * Does NOT belong: Change-file rules (changes.test.mjs).
 */
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { branchSlug, buildVersion, developmentBase, developmentVersion } from './build-version.mjs';
import { repoRoot } from './paths.mjs';
import { compareVersions, parseVersion } from './semver.mjs';
import { readVersions, writeVersions } from './version-files.mjs';

test('every version file in the repository holds the same version', () => {
  const found = readVersions();
  assert.ok(found.length >= 9);
  assert.equal(new Set(found.map((entry) => entry.version)).size, 1, JSON.stringify(found));
});

test('writing a version updates every file and nothing else', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'versions-'));
  const files = [...new Set(readVersions().map((entry) => entry.file))];
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(repoRoot, file), path.join(root, file));
  }
  writeVersions('9.8.7', root);
  const read = (/** @type {string} */ file) => {
    try {
      return readFileSync(path.join(root, file), 'utf8');
    } catch {
      return null;
    }
  };
  assert.deepEqual([...new Set(readVersions(read).map((entry) => entry.version))], ['9.8.7']);
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(
    lock.packages['node_modules/vite']?.version,
    JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8')).packages[
      'node_modules/vite'
    ]?.version,
  );
});

test('missing versions are reported, and an optional file may be absent', () => {
  const found = readVersions((file) => (file.endsWith('Cargo.lock') ? null : 'no version here'));
  assert.ok(found.every((entry) => entry.version === null));
  assert.ok(!found.some((entry) => entry.file.endsWith('Cargo.lock')));
  const empty = mkdtempSync(path.join(tmpdir(), 'versions-empty-'));
  assert.throws(() => writeVersions('1.0.0', empty), /ENOENT/);
});

test('branch names become safe build metadata', () => {
  assert.equal(branchSlug('feat/Desktop_Release!!'), 'feat-desktop-release');
  assert.equal(branchSlug('---'), 'detached');
  assert.equal(branchSlug(`feat/${'x'.repeat(60)}`).length <= 40, true);
});

test('a development build sorts after its starting release and before the one it becomes', () => {
  const base = developmentBase({ current: '2.0.0', tagged: ['2.0.0'], bumps: ['minor', 'patch'] });
  assert.equal(base, '2.1.0');
  const version = developmentVersion({
    base,
    sinceTag: 7,
    branch: 'feat/desktop-release',
    sha: 'abc1234def',
    dirty: true,
  });
  assert.equal(version, '2.1.0-dev.7+feat-desktop-release.abc1234def.dirty');
  assert.ok(parseVersion(version));
  assert.ok(compareVersions(version, '2.0.0') > 0 && compareVersions(version, '2.1.0') < 0);
  const other = developmentVersion({
    base,
    sinceTag: 7,
    branch: 'fix/other',
    sha: 'fff0000aaa',
    dirty: false,
  });
  assert.notEqual(other, version);
});

test('without pending changes, a released version leads to a patch; a prepared one stays', () => {
  assert.equal(developmentBase({ current: '2.0.0', tagged: ['2.0.0'], bumps: ['none'] }), '2.0.1');
  assert.equal(developmentBase({ current: '2.1.0', tagged: ['2.0.0'], bumps: [] }), '2.1.0');
});

test('this checkout builds as a valid version, and an override must be SemVer', () => {
  assert.ok(parseVersion(buildVersion()));
  process.env.TTSNATIVE_BUILD_VERSION = '3.0.0-rc.1';
  try {
    assert.equal(buildVersion(), '3.0.0-rc.1');
    process.env.TTSNATIVE_BUILD_VERSION = 'latest';
    assert.throws(() => buildVersion(), /not SemVer/);
  } finally {
    delete process.env.TTSNATIVE_BUILD_VERSION;
  }
});
