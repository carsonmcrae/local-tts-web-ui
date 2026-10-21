// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for semantic version parsing, precedence and bumps.
 * Scope: The SemVer 2.0.0 precedence examples, build metadata, invalid input, bumps and the strongest
 *   of several bumps.
 * Does NOT belong: Change-file rules (changes.test.mjs).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bumpVersion, compareVersions, isStable, parseVersion, strongestBump } from './semver.mjs';

test('parses releases, pre-releases and build metadata', () => {
  assert.deepEqual(parseVersion('2.1.0-dev.3+feat-x.abc123'), {
    major: 2,
    minor: 1,
    patch: 0,
    prerelease: ['dev', '3'],
    build: ['feat-x', 'abc123'],
  });
  for (const bad of ['2.1', 'v2.1.0', '02.1.0', '2.1.0-', '2.1.0-01', '2.1.0+', 'x.y.z']) {
    assert.equal(parseVersion(bad), null, bad);
  }
  assert.ok(isStable('2.1.0'));
  assert.ok(!isStable('2.1.0-rc.1'));
  assert.ok(!isStable('2.1.0+build'));
  assert.ok(!isStable('nonsense'));
});

test('orders versions as the SemVer specification does', () => {
  const ordered = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
    '1.0.1',
    '1.1.0',
    '2.0.0',
  ];
  for (let index = 1; index < ordered.length; index += 1) {
    const older = /** @type {string} */ (ordered[index - 1]);
    const newer = /** @type {string} */ (ordered[index]);
    assert.ok(compareVersions(older, newer) < 0, `${older} < ${newer}`);
    assert.ok(compareVersions(newer, older) > 0, `${newer} > ${older}`);
  }
  assert.equal(compareVersions('2.1.0+a', '2.1.0+b'), 0);
  assert.equal(compareVersions('2.1.0-dev.1', '2.1.0-dev.1'), 0);
  assert.throws(() => compareVersions('2.1', '2.1.0'), /not a semantic version/);
});

test('bumps drop pre-release parts and reset lower numbers', () => {
  assert.equal(bumpVersion('2.3.4', 'patch'), '2.3.5');
  assert.equal(bumpVersion('2.3.4', 'minor'), '2.4.0');
  assert.equal(bumpVersion('2.3.4', 'major'), '3.0.0');
  assert.equal(bumpVersion('2.3.4-dev.1', 'none'), '2.3.4');
});

test('the strongest bump wins and unknown values are ignored', () => {
  assert.equal(strongestBump([]), 'none');
  assert.equal(strongestBump(['patch', 'none', 'minor', 'patch']), 'minor');
  assert.equal(strongestBump(['patch', 'major']), 'major');
  assert.equal(strongestBump(/** @type {any} */ (['', 'huge', 'patch'])), 'patch');
});
