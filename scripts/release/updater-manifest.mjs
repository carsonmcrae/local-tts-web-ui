// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Write `latest.json`, the file installed copies of TTSNative read to find an update.
 * Scope: The version, its reviewed user-facing notes (docs/releases/X.Y.Z.md), the release date and,
 *   for Windows x64, the installer's download address on GitHub Releases with its minisign signature
 *   (the app refuses an installer whose signature doesn't match its built-in public key).
 *   Usage: `node scripts/release/updater-manifest.mjs <version> <signature file> <output>`.
 * Does NOT belong: Signing (Tauri's bundler signs with TAURI_SIGNING_PRIVATE_KEY) or publishing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';
import { RELEASES_DIR, parseRelease, renderRelease } from '../lib/releases.mjs';

const REPO = 'carsonmcrae/ttsnative';
const [version = '', signatureFile = '', output = 'latest.json'] = process.argv.slice(2);
const notesFile = `${RELEASES_DIR}/${version}.md`;
const { release, problems } = parseRelease(
  notesFile,
  readFileSync(path.join(repoRoot, notesFile), 'utf8'),
);
if (problems.length || release.draft) {
  console.error(`updater-manifest: ${notesFile} is not ready:\n${problems.join('\n')}`);
  process.exit(1);
}
const installer = `TTSNative-Setup-${version}.exe`;
const manifest = {
  version,
  notes: renderRelease(release),
  pub_date: `${release.date}T00:00:00Z`,
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(signatureFile, 'utf8').trim(),
      url: `https://github.com/${REPO}/releases/download/v${version}/${installer}`,
    },
  },
};
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${output} for ${version}`);
