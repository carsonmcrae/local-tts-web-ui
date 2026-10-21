// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Keep the GPL/LGPL source offer in step with what the Windows installer ships.
 * Scope: Every package that brings GPL or LGPL code into the installer is covered by the manifest, at
 *   the version apps/server/uv.lock installs (so a dependency update cannot leave the offer stale), and
 *   every entry is complete, pinned and lands under its own name in the archive.
 * Does NOT belong: Downloading the archives (the release workflow does, verifying each one).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { repoRoot } from '../lib/paths.mjs';
import { archiveName, readSources } from './third-party-sources.mjs';

/** Packages in the installed runtime that contain GPL or LGPL code (docs/security/license-inventory.md). */
const COPYLEFT_PACKAGES = ['espeakng-loader', 'phonemizer', 'soundfile', 'lxml'];

const sources = readSources();
const locked = new Map(
  [
    ...readFileSync(path.join(repoRoot, 'apps', 'server', 'uv.lock'), 'utf8')
      .replaceAll('\r\n', '\n')
      .matchAll(/^\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/gm),
  ].map((m) => [m[1], m[2]]),
);

test('every package with GPL or LGPL code is covered', () => {
  const covered = new Set(sources.map((s) => s.for.split(' ')[0]));
  for (const name of COPYLEFT_PACKAGES) assert.ok(covered.has(name), `${name} has no source entry`);
});

test('each entry matches the version the installer ships', () => {
  for (const source of sources) {
    const [name, version] = source.for.split(' ');
    assert.equal(
      locked.get(name ?? ''),
      version,
      `${source.component} covers ${source.for}, but apps/server/uv.lock has ${name} ${locked.get(name ?? '')}: confirm the new version's source and update apps/desktop/third-party-sources.json`,
    );
  }
});

test('each entry is complete and pinned', () => {
  for (const source of sources) {
    assert.match(source.url, /^https:\/\//, source.component);
    assert.match(source.sha256, /^[0-9a-f]{64}$/, source.component);
    assert.ok(Number.isInteger(source.size) && source.size > 0, source.component);
    for (const field of ['component', 'version', 'licence', 'why']) {
      assert.ok(source[/** @type {'component'} */ (field)].trim(), `${source.component}: ${field}`);
    }
  }
});

test('archives keep distinct, descriptive names', () => {
  const names = sources.map(archiveName);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('espeak-ng-1.52.0.tar.gz'));
  assert.ok(names.includes('phonemizer-3.4.0.tar.gz'));
  assert.ok(names.includes('libsndfile-1.2.2.tar.gz'));
});
