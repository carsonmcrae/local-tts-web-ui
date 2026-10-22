// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for user-facing release notes and the developer changelog entry of a release.
 * Scope: Validation of docs/releases files, ordering, Markdown output for GitHub and the updater, the
 *   draft written by release preparation, CHANGELOG.md entries (with and without older Unreleased
 *   notes), and that every release notes file in the repository is valid and finished.
 * Does NOT belong: Change files (changes.test.mjs).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { addRelease, amendRelease } from './changelog.mjs';
import { releaseTags } from './git.mjs';
import {
  amendNotes,
  draftNotes,
  formatDate,
  parseRelease,
  readReleases,
  renderRelease,
} from './releases.mjs';

const GOOD = `---
version: 2.1.0
date: 2026-11-02
---

Install TTSNative like any other Windows app.

## New

- Open TTSNative from the Start menu.

## Fixed

- Exports no longer stop early.
`;

test('valid notes parse into a summary and sections', () => {
  const { release, problems } = parseRelease('docs/releases/2.1.0.md', GOOD);
  assert.deepEqual(problems, []);
  assert.equal(release.summary, 'Install TTSNative like any other Windows app.');
  assert.deepEqual(
    release.sections.map((section) => [section.title, section.items]),
    [
      ['New', ['Open TTSNative from the Start menu.']],
      ['Fixed', ['Exports no longer stop early.']],
    ],
  );
  assert.equal(release.draft, false);
  assert.equal(
    renderRelease(release),
    'Install TTSNative like any other Windows app.\n\n## New\n\n- Open TTSNative from the Start menu.\n\n## Fixed\n\n- Exports no longer stop early.',
  );
});

test('notes are refused when they are mislabelled, undated, technical or empty', () => {
  const problems = (/** @type {string} */ file, /** @type {string} */ text) =>
    parseRelease(file, text).problems.join('\n');
  assert.match(problems('docs/releases/2.2.0.md', GOOD), /should be 2\.2\.0/);
  assert.match(problems('docs/releases/2.1.0-rc.1.md', GOOD), /stable version/);
  assert.match(
    problems('docs/releases/2.1.0.md', GOOD.replace('2026-11-02', 'soon')),
    /date: YYYY-MM-DD/,
  );
  assert.match(
    problems('docs/releases/2.1.0.md', GOOD.replace('---\n\n', 'revised: later\n---\n\n')),
    /"revised"/,
  );
  assert.match(
    problems('docs/releases/2.1.0.md', `${GOOD}\n## Technical\n\n- x\n`),
    /Technical section/,
  );
  assert.match(
    problems(
      'docs/releases/2.1.0.md',
      GOOD.replace('Install TTSNative like any other Windows app.', ''),
    ),
    /summary/,
  );
  assert.match(
    problems('docs/releases/2.1.0.md', GOOD.replace('Exports', 'The export API')),
    /technical term/,
  );
});

test('a prepared draft is marked until someone rewrites it', () => {
  const text = draftNotes('2.1.0', '2026-11-02', [
    { title: 'New', user: true, items: ['Bookmarks.'] },
    { title: 'Technical', user: false, items: ['Internal.'] },
  ]);
  const { release, problems } = parseRelease('docs/releases/2.1.0.md', text);
  assert.deepEqual(problems, []);
  assert.ok(release.draft);
  assert.equal(release.summary, 'TTSNative 2.1.0: 1 new.');
  assert.ok(!text.includes('Internal.'));
  assert.match(draftNotes('2.0.1', '2026-11-02', []), /maintenance and reliability work/);
});

test('reads every notes file newest first', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'releases-'));
  assert.deepEqual(readReleases(root), { releases: [], problems: [] });
  mkdirSync(path.join(root, 'docs', 'releases'), { recursive: true });
  for (const version of ['1.0.0', '10.0.0', '2.1.0']) {
    writeFileSync(
      path.join(root, 'docs', 'releases', `${version}.md`),
      GOOD.replace('2.1.0', version),
    );
  }
  writeFileSync(path.join(root, 'docs', 'releases', 'README.md'), 'not a release');
  assert.deepEqual(
    readReleases(root).releases.map((release) => release.version),
    ['10.0.0', '2.1.0', '1.0.0'],
  );
});

test('dates are written out for people, in UTC', () => {
  assert.equal(formatDate('2026-10-19'), 'October 19, 2026');
  assert.equal(formatDate('2026-01-01'), 'January 1, 2026');
});

test('every published version has finished notes in the repository', () => {
  const { releases, problems } = readReleases();
  assert.deepEqual(problems, []);
  const documented = new Set(releases.map((release) => release.version));
  for (const tag of releaseTags()) assert.ok(documented.has(tag), `notes for v${tag}`);
  for (const release of releases) assert.ok(!release.draft, `${release.version} is not a draft`);
  assert.ok(documented.has('1.0.0') && documented.has('2.0.0'));
});

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

Some prose.

### Added

- **Old feature.** Details.

### Fixed

- Old fix.

## [2.0.0] - 2026-10-19

- First.

[Unreleased]: https://github.com/o/r/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/o/r/compare/v1.0.0...v2.0.0
`;

test('a release folds the Unreleased notes into its dated CHANGELOG entry', () => {
  const result = addRelease(CHANGELOG, {
    version: '2.1.0',
    previous: '2.0.0',
    date: '2026-11-02',
    repo: 'o/r',
    sections: [
      { changelog: 'Technical', items: ['Tooling.'] },
      { changelog: 'Added', items: ['New thing.'] },
    ],
  });
  assert.ok(!result.includes('[Unreleased]'));
  assert.ok(
    result.includes(
      '## [2.1.0] - 2026-11-02\n\nSome prose.\n\n### Added\n\n- **Old feature.** Details.\n- New thing.\n\n### Fixed\n\n- Old fix.\n\n### Technical\n\n- Tooling.\n\n## [2.0.0]',
    ),
  );
  assert.ok(result.includes('[2.1.0]: https://github.com/o/r/compare/v2.0.0...v2.1.0\n[2.0.0]:'));
});

test('without Unreleased notes the entry goes above the newest release', () => {
  const plain = CHANGELOG.replace(/## \[Unreleased\][\s\S]*?(?=## \[2\.0\.0\])/, '').replace(
    /^\[Unreleased\]: .*\n/m,
    '',
  );
  const result = addRelease(plain, {
    version: '2.0.1',
    previous: '2.0.0',
    date: '2026-11-02',
    repo: 'o/r',
    sections: [{ changelog: 'Fixed', items: ['A fix.'] }],
  });
  assert.ok(
    result.includes('Intro.\n\n## [2.0.1] - 2026-11-02\n\n### Fixed\n\n- A fix.\n\n## [2.0.0]'),
  );
  assert.ok(result.includes('[2.0.1]: https://github.com/o/r/compare/v2.0.0...v2.0.1\n[2.0.0]:'));
  const bare = addRelease('# Changelog\n', {
    version: '1.0.0',
    previous: '0.9.0',
    date: '2026-11-02',
    repo: 'o/r',
    sections: [{ changelog: 'Custom', items: ['x'] }],
  });
  assert.ok(
    bare.endsWith('### Custom\n\n- x\n\n[1.0.0]: https://github.com/o/r/compare/v0.9.0...v1.0.0\n'),
  );
});

const FINISHED = `---
version: 2.1.0
date: 2026-10-22
---

A summary.

## New

- Bookmarks.

## Fixed

- An old fix.
`;

test('late change files join the matching sections of finished notes', () => {
  const amended = amendNotes(FINISHED, [
    { title: 'Fixed', user: true, items: ['A later fix.'] },
    { title: 'Improved', user: true, items: ['Faster.'] },
    { title: 'Security & reliability', user: true, items: ['Safer.'] },
    { title: 'Technical', user: false, items: ['Internal.'] },
  ]);
  assert.equal(
    amended,
    `---
version: 2.1.0
date: 2026-10-22
---

A summary.

## New

- Bookmarks.

## Improved

- Faster.

## Fixed

- An old fix.
- A later fix.

## Security & reliability

- Safer.
`,
  );
  const { release, problems } = parseRelease('docs/releases/2.1.0.md', amended);
  assert.deepEqual(problems, []);
  assert.ok(!release.draft);
  assert.equal(amendNotes(FINISHED, []), FINISHED);
  assert.equal(amendNotes(FINISHED.replaceAll('\n', '\r\n'), []), FINISHED);
});

test('an amendment adds late change files to the prepared CHANGELOG entry', () => {
  const prepared = addRelease(CHANGELOG, {
    version: '2.1.0',
    previous: '2.0.0',
    date: '2026-11-02',
    repo: 'o/r',
    sections: [{ changelog: 'Added', items: ['New thing.'] }],
  });
  const result = amendRelease(prepared, {
    version: '2.1.0',
    sections: [
      { changelog: 'Technical', items: ['Tooling.'] },
      { changelog: 'Fixed', items: ['A later fix.'] },
    ],
  });
  assert.ok(
    result.includes(
      '## [2.1.0] - 2026-11-02\n\nSome prose.\n\n### Added\n\n- **Old feature.** Details.\n- New thing.\n\n### Fixed\n\n- Old fix.\n- A later fix.\n\n### Technical\n\n- Tooling.\n\n## [2.0.0] - 2026-10-19\n\n- First.\n\n[2.1.0]:',
    ),
  );
  assert.throws(
    () => amendRelease(CHANGELOG, { version: '2.1.0', sections: [] }),
    /no "## \[2\.1\.0\]" entry/,
  );
});
