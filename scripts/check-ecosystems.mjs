// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Fail when a file brings in a language, runtime or package manager the project has no
 *   security tooling for, such as PHP, a container image or a second JavaScript package manager.
 * Scope: Every tracked or untracked file Git doesn't ignore, checked against lib/ecosystems.mjs. The
 *   message says what has to come with a new ecosystem (CONTRIBUTING.md, "Adding a language or
 *   package manager").
 * Does NOT belong: Auditing the ecosystems the project does use (`npm run security`, Dependabot,
 *   CodeQL, SonarQube).
 */
import { color, ok } from './lib/log.mjs';
import { unsupportedFiles } from './lib/ecosystems.mjs';
import { repoFiles } from './lib/repo-files.mjs';

const files = repoFiles(/./, []);
const found = unsupportedFiles(files);

for (const { file, name } of found)
  console.error(
    `${color.red('✗')} ${file}: brings in ${name}, which this project has no security tooling for.`,
  );

if (found.length) {
  console.error(
    '\nA new language or package manager needs an architecture decision and, in the same pull request,\n' +
      'its Dependabot entry, an audit in `npm run security`, scanner coverage (CodeQL or SonarQube) and\n' +
      'an update to scripts/lib/ecosystems.mjs. See CONTRIBUTING.md, "Adding a language or package manager".',
  );
  process.exitCode = 1;
} else {
  ok(`No unsupported language or package manager (${files.length} files checked)`);
}
