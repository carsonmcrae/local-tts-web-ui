// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for change files: validation, plain-language checks and how pending files combine.
 * Scope: Every rule a change file must follow, the next version from concurrent pull requests (no
 *   collisions, independent of merge order), de-duplicated sections, release-PR expectations, and
 *   that the repository's own pending change files are valid.
 * Does NOT belong: Release notes files (releases.test.mjs).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  combineSections,
  isExpectedNext,
  nextVersion,
  parseChange,
  readChanges,
} from './changes.mjs';
import { parseNotes, technicalWording } from './notes-format.mjs';

/** @param {string} bump @param {string} body */
const change = (bump, body, file = '.changes/x.md') =>
  parseChange(file, `---\nbump: ${bump}\n---\n\n${body}\n`);

test('a valid change file has a bump and plain-language entries', () => {
  const parsed = change(
    'minor',
    '## New\n\n- Read documents in their own window.\n  It opens from the Start menu.\n\n## Technical\n\n- `apps/desktop`: Tauri shell.',
  );
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(parsed.sections.new, [
    'Read documents in their own window. It opens from the Start menu.',
  ]);
  assert.deepEqual(parsed.sections.technical, ['`apps/desktop`: Tauri shell.']);
});

test('the bump must be declared and match the entries', () => {
  const missing = parseChange('.changes/a.md', '## Fixed\n\n- A fix.\n');
  assert.ok(missing.problems.some((p) => p.includes('front matter')));
  assert.ok(missing.problems.some((p) => p.includes('"bump: major"')));
  assert.ok(
    change('huge', '## Fixed\n\n- A fix.').problems.some((p) => p.includes('"bump: patch"')),
  );
  assert.ok(
    change('none', '## Fixed\n\n- A fix.').problems.some((p) => p.includes('user-facing entries')),
  );
  assert.ok(change('none', '').problems.some((p) => p.includes('under "## Technical"')));
  assert.ok(change('patch', '').problems.some((p) => p.includes('no entries')));
  assert.ok(
    change('patch', '## New\n\n- A feature.').problems.some((p) =>
      p.includes('at least "bump: minor"'),
    ),
  );
  assert.deepEqual(change('none', '## Technical\n\n- CI only.').problems, []);
  assert.deepEqual(change('patch', '## Technical\n\n- Dependency update.').problems, []);
});

test('user-facing entries must read as plain language', () => {
  const technical = [
    'Fixed the `export` route.',
    'Updated a dependency.',
    'See https://example.com for details.',
    'Fixes #42.',
    'Reverted commit 1a2b3c4d.',
    'Patched GHSA-1234-abcd-wxyz.',
    'Added 12 tests for playback.',
    'The React reader loads faster.',
  ];
  for (const entry of technical) {
    const parsed = change('patch', `## Fixed\n\n- ${entry}`);
    assert.ok(
      parsed.problems.some((p) => p.includes('user-facing entry uses')),
      entry,
    );
  }
  assert.deepEqual(
    technicalWording('Stopping a recording right away no longer shows an error.'),
    [],
  );
  assert.deepEqual(
    change('patch', '## Technical\n\n- Bumped React and the API schema.').problems,
    [],
  );
});

test('placeholders, stray text, unknown sections and very long entries are refused', () => {
  const problems = (/** @type {string} */ body) => change('patch', body).problems.join('\n');
  assert.match(problems('## Fixed\n\n- TODO: describe it'), /placeholder/);
  assert.match(problems('## Technical\n\n- tbd'), /placeholder/);
  assert.match(problems('Intro text\n\n## Fixed\n\n- A fix.'), /before the first/);
  assert.match(problems('## Fixed\n\nNot a list entry.'), /outside a "- " list entry/);
  assert.match(problems('## Changes\n\n- A fix.'), /unknown section "Changes"/);
  assert.match(problems(`## Fixed\n\n- ${'Very long sentence. '.repeat(20)}`), /longer than 300/);
  assert.match(
    parseChange('.changes/b.md', '---\nbump: patch\nnot a field\n').problems.join(),
    /not "key: value"/,
  );
  assert.match(parseChange('.changes/c.md', '---\nbump: patch\n').problems.join(), /not closed/);
});

test('section headings accept common names', () => {
  const doc = parseNotes(
    '---\nbump: minor\n---\n## New features\n- a\n## Bug fixes\n- b\n## Improvements\n- c\n## Security\n- d\n',
  );
  assert.deepEqual(Object.keys(doc.sections).sort(), ['fixed', 'improved', 'new', 'security']);
});

test('concurrent pull requests never collide: the strongest bump decides, in any merge order', () => {
  const fix = change('patch', '## Fixed\n\n- A fix.', '.changes/fix.md');
  const feature = change('minor', '## New\n\n- A feature.', '.changes/feature.md');
  const docs = change('none', '## Technical\n\n- Docs.', '.changes/docs.md');
  assert.equal(nextVersion('2.0.0', [fix, feature, docs]), '2.1.0');
  assert.equal(nextVersion('2.0.0', [docs, feature, fix]), '2.1.0');
  assert.equal(nextVersion('2.0.0', [fix]), '2.0.1');
  assert.equal(nextVersion('2.0.0', [docs]), '2.0.0');
  assert.equal(
    nextVersion('2.0.0', [change('major', '## Improved\n\n- Big change.'), fix]),
    '3.0.0',
  );
});

test('a release must set exactly the next version and never go backwards', () => {
  const fix = change('patch', '## Fixed\n\n- A fix.');
  assert.ok(isExpectedNext('2.0.0', '2.0.1', [fix]));
  assert.ok(!isExpectedNext('2.0.0', '2.1.0', [fix]));
  assert.ok(!isExpectedNext('2.0.0', '2.0.0', []));
  assert.ok(!isExpectedNext('2.0.0', '1.9.9', [fix]));
});

test('combined sections keep the section order, strongest changes first, without duplicates', () => {
  const combined = combineSections([
    change(
      'patch',
      '## Fixed\n\n- Exports no longer stop early.\n\n## Technical\n\n- One.',
      '.changes/a.md',
    ),
    change(
      'minor',
      '## New\n\n- Bookmarks.\n\n## Fixed\n\n- Exports no longer stop early!',
      '.changes/b.md',
    ),
  ]);
  assert.deepEqual(
    combined.map((section) => [section.key, section.items]),
    [
      ['new', ['Bookmarks.']],
      ['fixed', ['Exports no longer stop early!']],
      ['technical', ['One.']],
    ],
  );
});

test('reads pending change files from a folder, ignoring the README', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'changes-'));
  assert.deepEqual(readChanges(root), []);
  mkdirSync(path.join(root, '.changes'));
  writeFileSync(path.join(root, '.changes', 'README.md'), '# Not a change');
  writeFileSync(path.join(root, '.changes', 'b.md'), '---\nbump: patch\n---\n## Fixed\n- B.\n');
  writeFileSync(path.join(root, '.changes', 'a.md'), '---\nbump: none\n---\n## Technical\n- A.\n');
  assert.deepEqual(
    readChanges(root).map((item) => [item.file, item.bump]),
    [
      ['.changes/a.md', 'none'],
      ['.changes/b.md', 'patch'],
    ],
  );
});

test("the repository's pending change files are valid", () => {
  for (const pending of readChanges()) assert.deepEqual(pending.problems, [], pending.file);
});
