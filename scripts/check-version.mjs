// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Keep the single product version consistent everywhere it appears.
 * Scope: Root and web package.json, the server's pyproject.toml and `ltts.__version__`, the worker's
 *   pyproject.toml, and the newest released heading in CHANGELOG.md.
 * Does NOT belong: Choosing or bumping versions (see docs/guides/release-process.md).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { color, ok } from './lib/log.mjs';
import { repoRoot } from './lib/paths.mjs';

/** @param {string} file */
const read = (file) => readFileSync(path.join(repoRoot, file), 'utf8');

const sources = {
  'package.json': JSON.parse(read('package.json')).version,
  'apps/web/package.json': JSON.parse(read('apps/web/package.json')).version,
  'apps/server/pyproject.toml': /^version = "([^"]+)"/m.exec(
    read('apps/server/pyproject.toml'),
  )?.[1],
  'apps/server/src/ltts/__init__.py': /__version__ = "([^"]+)"/.exec(
    read('apps/server/src/ltts/__init__.py'),
  )?.[1],
  'apps/chatterbox-worker/pyproject.toml': /^version = "([^"]+)"/m.exec(
    read('apps/chatterbox-worker/pyproject.toml'),
  )?.[1],
  'CHANGELOG.md': /^## \[(\d+\.\d+\.\d+)\]/m.exec(read('CHANGELOG.md'))?.[1],
};

const expected = sources['package.json'];
const mismatched = Object.entries(sources).filter(([, version]) => version !== expected);
if (!/^\d+\.\d+\.\d+$/.test(expected ?? '')) {
  console.error(
    `${color.red('✗')} package.json version "${expected}" is not semantic (MAJOR.MINOR.PATCH).`,
  );
  process.exit(1);
}
if (mismatched.length) {
  for (const [file, version] of mismatched)
    console.error(`${color.red('✗')} ${file} has ${version ?? 'no version'}, expected ${expected}`);
  process.exit(1);
}
ok(`Version ${expected} is consistent across ${Object.keys(sources).length} files`);
