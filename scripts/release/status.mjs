// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: `npm run release:status` — where the version stands and what the next release will be.
 * Scope: The current and newest released versions, the pending change files and their bumps, the
 *   resulting next version, this build's identifier and a preview of the user-facing notes. With
 *   `--markdown`, the same as a GitHub job summary (CI shows it after every merge to main).
 * Does NOT belong: Changing anything (prepare.mjs).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildVersion } from '../lib/build-version.mjs';
import { combineSections, nextVersion, readChanges } from '../lib/changes.mjs';
import { releaseTags } from '../lib/git.mjs';
import { repoRoot } from '../lib/paths.mjs';
import { strongestBump } from '../lib/semver.mjs';

const current = /** @type {{ version: string }} */ (
  JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
).version;
const changes = readChanges();
const bump = strongestBump(changes.map((change) => change.bump));
const next = bump === 'none' ? null : nextVersion(current, changes);
const lines = [
  `## TTSNative release status`,
  '',
  `- Version in the repository: **${current}** (newest release tag: ${releaseTags()[0] ? `v${releaseTags()[0]}` : 'none found'})`,
  `- Pending change files: **${changes.length}** (strongest bump: ${bump})`,
  `- Next release: **${next ?? 'nothing to release yet'}**`,
  `- This build: \`${buildVersion()}\``,
  '',
  ...changes.map(
    (change) =>
      `- \`${change.file}\`: ${change.bump}${change.problems.length ? ' (needs fixing)' : ''}`,
  ),
];
for (const section of combineSections(changes).filter((item) => item.user)) {
  lines.push('', `### ${section.title}`, '', ...section.items.map((item) => `- ${item}`));
}
const text = lines.join('\n');
console.log(
  process.argv.includes('--markdown') ? text : text.replaceAll('**', '').replaceAll('`', ''),
);
