// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Print the GitHub Release notes for a version tag, refusing to publish a mismatched or
 *   unreviewed release.
 * Scope: Checks that the tag (vX.Y.Z) equals the version in package.json, that CHANGELOG.md has a
 *   dated `## [X.Y.Z] - YYYY-MM-DD` entry and that docs/releases/X.Y.Z.md is valid and no longer a
 *   draft; then prints the user-facing notes, the Windows download (unless `--no-installer`), the
 *   developer changes folded away, and how to verify the files.
 *   Usage: `node scripts/release-notes.mjs v2.1.0 > notes.md`.
 * Does NOT belong: Building or uploading artifacts (.github/workflows/release.yml) or the version
 *   consistency gate across files (check-version.mjs).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './lib/paths.mjs';
import { RELEASES_DIR, parseRelease, renderRelease } from './lib/releases.mjs';

const REPO = 'carsonmcrae/ttsnative';

/** @param {string} message */
function fail(message) {
  console.error(`release-notes: ${message}`);
  process.exit(1);
}

const tag = process.argv[2] ?? '';
const version = /** @type {{ version: string }} */ (
  JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
).version;
if (tag !== `v${version}`) fail(`tag "${tag}" does not match package.json version ${version}`);

const changelog = readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
const escapedVersion = version.replaceAll('.', String.raw`\.`);
const heading = new RegExp(String.raw`^## \[${escapedVersion}\] - (.+)$`, 'm');
const match = heading.exec(changelog);
if (!match) fail(`CHANGELOG.md has no "## [${version}] - <date>" entry`);
const date = match?.[1]?.trim() ?? '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
  fail(`CHANGELOG.md entry for ${version} is "${date}", not a date`);
const start = (match?.index ?? 0) + (match?.[0].length ?? 0);
const next = changelog.indexOf('\n## [', start);
const technical = changelog.slice(start, next === -1 ? changelog.length : next).trim();

const notesFile = `${RELEASES_DIR}/${version}.md`;
let notesText = '';
try {
  notesText = readFileSync(path.join(repoRoot, notesFile), 'utf8');
} catch {
  fail(`${notesFile} is missing`);
}
const { release, problems } = parseRelease(notesFile, notesText);
if (problems.length) fail(problems.join('\n'));
if (release.draft) fail(`${notesFile} is still a draft`);

const installer = `TTSNative-Setup-${version}.exe`;
const download = process.argv.includes('--no-installer')
  ? ''
  : `## Download

**Windows 11 (64-bit):** [${installer}](https://github.com/${REPO}/releases/download/${tag}/${installer}), also on [ttsnative.com](https://ttsnative.com). TTSNative already installed from the website offers this update itself.

`;

console.log(`${renderRelease(release)}

${download}<details>
<summary>Changes for developers</summary>

${technical}

</details>

## Verifying this release

Every file attached below is listed in \`SHA256SUMS.txt\` and has a signed build-provenance attestation
from this repository's release workflow. To check a download:

\`\`\`bash
sha256sum --check --ignore-missing SHA256SUMS.txt
gh attestation verify <file> --repo ${REPO}
\`\`\`

The source archive and SBOMs (CycloneDX 1.5) cover the web app, the server, the optional Chatterbox
worker and the Windows app. To run from source, follow the [Quick start](https://github.com/${REPO}#quick-start).`);
