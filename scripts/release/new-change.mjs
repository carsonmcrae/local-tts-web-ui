// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: `npm run change -- <major|minor|patch|none>` — start this branch's change file.
 * Scope: Writes `.changes/<branch>.md` (numbered if it exists) with the bump, a placeholder for each
 *   surface's impact and placeholder entries, all of which CI rejects until they are replaced.
 * Does NOT belong: Validation (lib/changes.mjs) or releases (prepare.mjs).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { branchSlug } from '../lib/build-version.mjs';
import { CHANGES_DIR, SURFACES } from '../lib/changes.mjs';
import { git } from '../lib/git.mjs';
import { BootstrapError, ok, printFailure } from '../lib/log.mjs';
import { repoRoot } from '../lib/paths.mjs';
import { BUMPS } from '../lib/semver.mjs';

const SECTION_FOR = { major: 'New', minor: 'New', patch: 'Fixed', none: 'Technical' };

try {
  const bump = /** @type {import('../lib/semver.mjs').Bump} */ (process.argv[2] ?? '');
  if (!BUMPS.includes(bump)) {
    throw new BootstrapError('Say how this change affects the version.', [
      'npm run change -- minor   (new features)',
      'npm run change -- patch   (fixes, security and maintenance)',
      'npm run change -- major   (breaking changes)',
      'npm run change -- none    (no effect on what users get, such as documentation or CI)',
    ]);
  }
  const dir = path.join(repoRoot, CHANGES_DIR);
  mkdirSync(dir, { recursive: true });
  const base = branchSlug(git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'change');
  let file = path.join(dir, `${base}.md`);
  let index = 2;
  while (existsSync(file)) {
    file = path.join(dir, `${base}-${index}.md`);
    index += 1;
  }
  const user = SECTION_FOR[bump];
  const body =
    user === 'Technical'
      ? '## Technical\n\n- TODO: what changed, for developers.\n'
      : `## ${user}\n\n- TODO: what changes for people using TTSNative, in plain words.\n\n## Technical\n\n- TODO: what changed in the code, for developers (or delete this section).\n`;
  // Each surface must be answered: changed, unchanged, or "limited: <why>" (see the README).
  const surfaces = SURFACES.map((surface) => `${surface}: TODO`).join('\n');
  writeFileSync(file, `---\nbump: ${bump}\n${surfaces}\n---\n\n${body}`);
  ok(
    `Created ${path.relative(repoRoot, file)}; replace the TODO lines (see ${CHANGES_DIR}/README.md).`,
  );
} catch (error) {
  printFailure(error);
  process.exit(1);
}
