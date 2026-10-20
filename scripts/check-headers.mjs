// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Require a licence notice and a useful module header on every hand-written source file.
 * Scope: TS/TSX/MJS/PY/CSS source under apps/, scripts/ and tests/ must start with the SPDX licence
 *   line and the copyright line (after a shebang or `// @ts-check`), and state `Purpose:`, `Scope:`
 *   and `Does NOT belong:` within the first 15 lines, with real content rather than placeholder
 *   text (package markers only need the licence lines).
 * Does NOT belong: Docs, configs without comment syntax, generated files.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { color, ok } from './lib/log.mjs';
import { repoRoot } from './lib/paths.mjs';
import { repoFiles } from './lib/repo-files.mjs';

const CHECKED = /^(apps|scripts|tests)\/.*\.(ts|tsx|mjs|py|css)$/;
const EXEMPT = [/schema\.gen\.ts$/, /vite-env\.d\.ts$/, /^tests\/fixtures\//];
const MARKER = /\/__init__\.py$/;
const LICENCE_LINES = ['SPDX-License-Identifier: MIT', 'Copyright (c) 2026 Carson McRae'];
const FIELDS = ['Purpose:', 'Scope:', 'Does NOT belong:'];

const files = repoFiles(CHECKED, EXEMPT);

let failed = 0;
for (const file of files) {
  let lines;
  try {
    lines = readFileSync(path.join(repoRoot, file), 'utf8').split('\n');
  } catch {
    continue;
  }
  const problems = [];
  if (LICENCE_LINES.some((line) => !lines.slice(0, 4).some((text) => text.includes(line)))) {
    problems.push('missing the SPDX licence and copyright lines at the top');
  }
  const head = lines.slice(0, 15).join('\n');
  const missing = MARKER.test(file) ? [] : FIELDS.filter((field) => !head.includes(field));
  if (missing.length) problems.push(`header missing ${missing.join(', ')}`);
  if (/(Purpose|Scope):\s*(TODO|TBD|\.\.\.)/i.test(head))
    problems.push('header has placeholder text');
  for (const problem of problems) console.error(`${color.red('✗')} ${file}: ${problem}`);
  failed += problems.length ? 1 : 0;
}
if (failed) process.exit(1);
ok(`File headers OK (${files.length} files checked)`);
