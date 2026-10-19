// @ts-check
/**
 * Purpose: Print the GitHub Release notes for a version tag, refusing to publish a mismatched release.
 * Scope: Checks that the tag (vX.Y.Z) equals the version in package.json and that CHANGELOG.md has a
 *   dated `## [X.Y.Z] - YYYY-MM-DD` entry (not "Unreleased"), then prints that entry followed by how
 *   to verify the downloads. Usage: `node scripts/release-notes.mjs v2.0.0 > notes.md`.
 * Does NOT belong: Building or uploading artifacts (.github/workflows/release.yml) or the version
 *   consistency gate across files (check-version.mjs).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './lib/paths.mjs';

const REPO = 'carsonmcrae/local-tts-web-ui';

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
const body = changelog.slice(start, next === -1 ? changelog.length : next).trim();

console.log(`${body}

## Verifying this release

Every file attached below is listed in \`SHA256SUMS.txt\` and has a signed build-provenance attestation
from this repository's release workflow. To check a download:

\`\`\`bash
sha256sum --check --ignore-missing SHA256SUMS.txt
gh attestation verify <file> --repo ${REPO}
\`\`\`

The source archive and SBOMs (CycloneDX 1.5) cover the web app, the server and the optional Chatterbox
worker. To install, follow the [Quick start](https://github.com/${REPO}#quick-start).`);
