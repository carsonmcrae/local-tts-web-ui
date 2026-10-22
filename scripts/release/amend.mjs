// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: `npm run release:amend` — fold change files that landed after a release was prepared into
 *   that release, while it is still untagged.
 * Scope: When main holds a prepared version (its notes in docs/releases/ and its CHANGELOG entry) that
 *   has no tag yet, and pull requests merged after the release branch was cut left change files behind,
 *   this adds their entries to the version's notes and CHANGELOG entry and deletes the change files;
 *   the version number does not move. Refuses a version that is already tagged (that needs
 *   release:prepare for the next version). Nothing is committed, tagged or published.
 *   Options: `--dry-run`.
 * Does NOT belong: Preparing a new version (prepare.mjs) or publishing (release.yml).
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CHANGES_DIR, combineSections, readChanges } from '../lib/changes.mjs';
import { amendRelease } from '../lib/changelog.mjs';
import { releaseTags } from '../lib/git.mjs';
import { BootstrapError, ok, printFailure, step } from '../lib/log.mjs';
import { repoRoot } from '../lib/paths.mjs';
import { RELEASES_DIR, amendNotes } from '../lib/releases.mjs';

function main() {
  const version = /** @type {{ version: string }} */ (
    JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  ).version;
  if (releaseTags().includes(version)) {
    throw new BootstrapError(
      `v${version} is already released; run npm run release:prepare instead.`,
    );
  }
  const notesFile = path.join(repoRoot, RELEASES_DIR, `${version}.md`);
  if (!existsSync(notesFile)) {
    throw new BootstrapError(`${RELEASES_DIR}/${version}.md does not exist.`, [
      'Nothing is prepared for this version; run npm run release:prepare.',
    ]);
  }
  const changes = readChanges();
  const invalid = changes.flatMap((change) => change.problems);
  if (invalid.length) throw new BootstrapError('Some change files need fixing first.', invalid);
  if (!changes.length) throw new BootstrapError('No change file to fold in.');
  const sections = combineSections(changes);
  step(`Folding ${changes.length} change file${changes.length === 1 ? '' : 's'} into ${version}…`);
  for (const section of sections.filter((item) => item.user)) {
    console.log(`  ${section.title}:\n${section.items.map((item) => `    - ${item}`).join('\n')}`);
  }
  if (process.argv.includes('--dry-run')) return;
  writeFileSync(notesFile, amendNotes(readFileSync(notesFile, 'utf8'), sections));
  const changelogFile = path.join(repoRoot, 'CHANGELOG.md');
  writeFileSync(
    changelogFile,
    amendRelease(readFileSync(changelogFile, 'utf8'), { version, sections }),
  );
  for (const change of changes) rmSync(path.join(repoRoot, change.file));
  ok(`Added to ${version}. Next:`);
  console.log(
    `  1. Read the lines above in ${RELEASES_DIR}/${version}.md: they were written for a change file and may need a word.`,
  );
  console.log(
    `  2. Commit on a release/v${version}-amend branch and open a pull request; CI checks it as a release amendment.`,
  );
  console.log(`  (The ${CHANGES_DIR}/ files were consumed; the version stays ${version}.)`);
}

try {
  main();
} catch (error) {
  printFailure(error);
  process.exit(1);
}
