// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Build the corresponding-source archive each release must offer for the GPL and LGPL
 *   components the Windows installer redistributes.
 * Scope: Downloads every archive listed in apps/desktop/third-party-sources.json, checks its exact size
 *   and SHA-256 (the release fails on any mismatch), adds a README naming each component, version,
 *   licence and origin, and writes ttsnative-<version>-third-party-sources.tar.gz.
 *   Usage: `node scripts/release/third-party-sources.mjs <version> <output folder>`.
 * Does NOT belong: The installer's notices (scripts/desktop/notices.mjs) or the manifest's review.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';

/**
 * @typedef {{ component: string, version: string, licence: string, url: string, sha256: string,
 *   size: number, for: string, why: string }} Source
 */

/** @returns {Source[]} */
export function readSources() {
  const manifest = JSON.parse(
    readFileSync(path.join(repoRoot, 'apps', 'desktop', 'third-party-sources.json'), 'utf8'),
  );
  return manifest.sources;
}

/**
 * The archive's file name inside the bundle: its download name, led by the component when that name
 * alone (a tag or commit) would not say what it is.
 * @param {Source} source
 */
export function archiveName(source) {
  const file = path.posix.basename(new URL(source.url).pathname);
  const slug = source.component
    .toLowerCase()
    .replace(/\(.*\)/, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-');
  return file.toLowerCase().startsWith(slug) ? file : `${slug}-${file}`;
}

async function main() {
  const [version = '', outDir = ''] = process.argv.slice(2);
  if (!version || !outDir)
    throw new Error('usage: third-party-sources.mjs <version> <output folder>');
  const name = `ttsnative-${version}-third-party-sources`;
  const staging = path.join(mkdtempSync(path.join(tmpdir(), 'sources-')), name);
  mkdirSync(staging, { recursive: true });
  const sources = readSources();
  for (const source of sources) {
    const response = await fetch(source.url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`${source.url}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== source.size || sha256 !== source.sha256) {
      throw new Error(
        `${source.component} ${source.version}: got ${bytes.length} bytes, SHA-256 ${sha256}; the manifest expects ${source.size} and ${source.sha256}`,
      );
    }
    writeFileSync(path.join(staging, archiveName(source)), bytes);
    console.log(`✓ ${source.component} ${source.version} (${bytes.length} bytes)`);
  }
  writeFileSync(
    path.join(staging, 'README.txt'),
    [
      `Corresponding source for the GPL and LGPL components in the TTSNative ${version} Windows installer,`,
      'with the build scripts and the permissively licensed libraries compiled into the same files.',
      'Each archive is unmodified and byte-for-byte the file at the address shown.',
      '',
      ...sources.map(
        (s) =>
          `${archiveName(s)}\n  ${s.component} ${s.version}\n  Licence: ${s.licence}\n  Covers the installed Python package ${s.for}. ${s.why}\n  ${s.url}\n  SHA-256 ${s.sha256}\n`,
      ),
    ]
      .join('\n')
      .replaceAll('\n', '\r\n'),
  );
  mkdirSync(outDir, { recursive: true });
  const archive = path.resolve(outDir, `${name}.tar.gz`);
  const tar = spawnSync('tar', ['-czf', path.relative(path.dirname(staging), archive), name], {
    cwd: path.dirname(staging),
    stdio: 'inherit',
  });
  if (tar.status !== 0) throw new Error('tar failed');
  console.log(`Wrote ${archive}`);
}

if (process.argv[1]?.endsWith('third-party-sources.mjs')) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
