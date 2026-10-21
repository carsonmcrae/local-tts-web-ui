// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: `npm run release:prepare` — turn the merged change files into a release, on a branch the
 *   maintainer reviews as a pull request.
 * Scope: Computes the next version from the change files on this commit (refusing a version that
 *   was ever tagged), sets it in every version file, writes the user-facing notes draft
 *   (docs/releases/X.Y.Z.md, marked as a draft until a person rewrites the summary and checks every
 *   line) and the dated CHANGELOG.md entry, and deletes the consumed change files. Nothing is
 *   committed, tagged or published. Options: `--date YYYY-MM-DD`, `--dry-run`.
 * Does NOT belong: Publishing (pushing the tag runs .github/workflows/release.yml).
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CHANGES_DIR, combineSections, nextVersion, readChanges } from '../lib/changes.mjs';
import { releaseTags } from '../lib/git.mjs';
import { BootstrapError, ok, printFailure, step } from '../lib/log.mjs';
import { repoRoot } from '../lib/paths.mjs';
import { RELEASES_DIR, draftNotes } from '../lib/releases.mjs';
import { strongestBump } from '../lib/semver.mjs';
import { writeVersions } from '../lib/version-files.mjs';
import { addRelease } from '../lib/changelog.mjs';

const REPO = 'carsonmcrae/ttsnative';

function main() {
  const dateIndex = process.argv.indexOf('--date');
  const date =
    dateIndex >= 0 ? (process.argv[dateIndex + 1] ?? '') : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BootstrapError('--date must be YYYY-MM-DD');
  const current = /** @type {{ version: string }} */ (
    JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  ).version;
  const changes = readChanges();
  const invalid = changes.flatMap((change) => change.problems);
  if (invalid.length) throw new BootstrapError('Some change files need fixing first.', invalid);
  if (strongestBump(changes.map((change) => change.bump)) === 'none') {
    throw new BootstrapError(
      'Nothing to release: no change file asks for a patch, minor or major bump.',
    );
  }
  const version = nextVersion(current, changes);
  if (releaseTags().includes(version)) {
    throw new BootstrapError(`v${version} already exists; versions are never reused.`, [
      'Update this branch from main (git fetch --tags) and try again.',
    ]);
  }
  const notesFile = path.join(repoRoot, RELEASES_DIR, `${version}.md`);
  if (existsSync(notesFile))
    throw new BootstrapError(`${RELEASES_DIR}/${version}.md already exists.`);
  const sections = combineSections(changes);
  step(
    `${current} → ${version} from ${changes.length} change file${changes.length === 1 ? '' : 's'}`,
  );
  if (process.argv.includes('--dry-run')) {
    console.log(`\n${draftNotes(version, date, sections)}\n`);
    return;
  }
  writeVersions(version);
  writeFileSync(notesFile, `${draftNotes(version, date, sections)}\n`);
  const changelogFile = path.join(repoRoot, 'CHANGELOG.md');
  writeFileSync(
    changelogFile,
    addRelease(readFileSync(changelogFile, 'utf8'), {
      version,
      previous: current,
      date,
      repo: REPO,
      sections,
    }),
  );
  for (const change of changes) rmSync(path.join(repoRoot, change.file));
  ok(`Prepared TTSNative ${version}. Next:`);
  console.log(
    `  1. Rewrite ${RELEASES_DIR}/${version}.md for people who don't write software, and delete its draft line.`,
  );
  console.log(
    `  2. Commit on a release/v${version} branch and open a pull request; CI checks the version and notes.`,
  );
  console.log(
    `  3. After merging, tag the merge commit: git tag -a v${version} -m "TTSNative ${version}" && git push origin v${version}`,
  );
  console.log(
    `  (The ${CHANGES_DIR}/ files were consumed; CHANGELOG.md has the developer details.)`,
  );
}

try {
  main();
} catch (error) {
  printFailure(error);
  process.exit(1);
}
