// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Make every pull request declare its release impact, and keep release notes trustworthy.
 * Scope: Always: every change file and release notes file is valid, and every release tag has its
 *   notes in docs/releases/. With `--base <commit>` (pull requests): an ordinary PR adds or edits a
 *   change file, leaves the version and CHANGELOG.md alone, and edits published notes only with a new
 *   `revised` date; a release PR (one that changes the version) sets exactly the version its base's
 *   change files lead to, consumes all of them, adds that version's finished notes and dated
 *   CHANGELOG entry, and uses a version that was never tagged.
 *   Usage: `node scripts/check-changes.mjs [--base <commit>]`.
 * Does NOT belong: Version consistency across files (check-version.mjs).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CHANGES_DIR,
  isExpectedNext,
  nextVersion,
  parseChange,
  readChanges,
} from './lib/changes.mjs';
import { changedFiles, fileAt, git, releaseTags } from './lib/git.mjs';
import { color, ok } from './lib/log.mjs';
import { repoRoot } from './lib/paths.mjs';
import { RELEASES_DIR, readReleases } from './lib/releases.mjs';
import { compareVersions } from './lib/semver.mjs';

/** @type {string[]} */
const problems = [];
const isChangeFile = (/** @type {string} */ file) =>
  file.startsWith(`${CHANGES_DIR}/`) && file.endsWith('.md') && !file.endsWith('/README.md');

/** @param {string | null} text */
const packageVersion = (text) =>
  text ? /** @type {{ version: string }} */ (JSON.parse(text)).version : '';

function checkFiles() {
  const changes = readChanges();
  problems.push(...changes.flatMap((change) => change.problems));
  const { releases, problems: releaseProblems } = readReleases();
  problems.push(...releaseProblems);
  for (const release of releases.filter((item) => item.draft)) {
    problems.push(
      `${RELEASES_DIR}/${release.version}.md is still a draft: finish the wording and delete the draft line`,
    );
  }
  const documented = new Set(releases.map((release) => release.version));
  for (const tag of releaseTags().filter((version) => !documented.has(version))) {
    problems.push(`v${tag} is released but ${RELEASES_DIR}/${tag}.md is missing`);
  }
  return changes;
}

/** @param {string} base @param {{ status: string, file: string }[]} diff */
function checkOrdinaryPr(base, diff) {
  if (!diff.some(({ status, file }) => status !== 'D' && isChangeFile(file))) {
    problems.push(
      `add a change file in ${CHANGES_DIR}/ that says "bump: major|minor|patch|none" (see ${CHANGES_DIR}/README.md)`,
    );
  }
  if (diff.some(({ file }) => file === 'CHANGELOG.md')) {
    problems.push(
      'CHANGELOG.md is written when a release is prepared; describe this change in a change file instead',
    );
  }
  const tags = new Set(releaseTags());
  for (const { status, file } of diff.filter((entry) =>
    entry.file.startsWith(`${RELEASES_DIR}/`),
  )) {
    const version = path.basename(file, '.md');
    if (!tags.has(version) || status === 'A') continue;
    const before = fileAt(base, file);
    const now = existsSync(path.join(repoRoot, file))
      ? readFileSync(path.join(repoRoot, file), 'utf8')
      : '';
    const revised = (/** @type {string | null} */ text) =>
      /^revised:\s*(.+)$/m.exec(text ?? '')?.[1];
    if (status === 'D' || revised(before) === revised(now)) {
      problems.push(
        `${file} was published with v${version}; correct it only with a new "revised: YYYY-MM-DD"`,
      );
    }
  }
}

/** @param {string} base @param {string} baseVersion @param {string} headVersion @param {import('./lib/changes.mjs').Change[]} headChanges */
function checkReleasePr(base, baseVersion, headVersion, headChanges) {
  const baseChanges = (git(['ls-tree', '--name-only', base, `${CHANGES_DIR}/`]) ?? '')
    .split('\n')
    .filter(isChangeFile)
    .map((file) => parseChange(file, fileAt(base, file) ?? ''));
  if (!isExpectedNext(baseVersion, headVersion, baseChanges)) {
    problems.push(
      `this release sets ${headVersion}, but the change files on its base lead to ${nextVersion(baseVersion, baseChanges)}; run npm run release:prepare on an up-to-date branch`,
    );
  }
  if (headChanges.length)
    problems.push(`a release must consume every change file (${headChanges.length} left)`);
  if (releaseTags().includes(headVersion))
    problems.push(`v${headVersion} was already released; versions are never reused`);
  const notes = `${RELEASES_DIR}/${headVersion}.md`;
  if (!existsSync(path.join(repoRoot, notes))) problems.push(`${notes} is missing`);
  const changelog = readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
  const escaped = headVersion.replaceAll('.', String.raw`\.`);
  if (!new RegExp(String.raw`^## \[${escaped}\] - \d{4}-\d{2}-\d{2}$`, 'm').test(changelog)) {
    problems.push(`CHANGELOG.md needs a dated "## [${headVersion}] - YYYY-MM-DD" entry`);
  }
}

function main() {
  const headChanges = checkFiles();
  const baseIndex = process.argv.indexOf('--base');
  const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : undefined;
  if (base) {
    const baseVersion = packageVersion(fileAt(base, 'package.json'));
    const headVersion = packageVersion(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const order = compareVersions(headVersion, baseVersion);
    if (order < 0) problems.push(`the version moves backwards (${baseVersion} → ${headVersion})`);
    else if (order === 0) checkOrdinaryPr(base, changedFiles(base));
    else checkReleasePr(base, baseVersion, headVersion, headChanges);
  }
  for (const problem of problems) console.error(`${color.red('✗')} ${problem}`);
  if (problems.length) process.exit(1);
  ok(
    `Change files and release notes OK (${headChanges.length} pending change${headChanges.length === 1 ? '' : 's'})`,
  );
}

main();
