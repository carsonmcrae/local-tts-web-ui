// @ts-check
/**
 * Purpose: Require a useful module header on every hand-written source file.
 * Scope: TS/TSX/MJS/PY/CSS source under apps/, scripts/ and tests/ must state `Purpose:`,
 *   `Scope:` and `Does NOT belong:` within the first 15 lines, with real content (not TODO).
 * Does NOT belong: Docs, configs without comment syntax, generated files.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { color, ok } from './lib/log.mjs';
import { repoRoot } from './lib/paths.mjs';
import { repoFiles } from './lib/repo-files.mjs';

const CHECKED = /^(apps|scripts|tests)\/.*\.(ts|tsx|mjs|py|css)$/;
const EXEMPT = [/schema\.gen\.ts$/, /\/__init__\.py$/, /vite-env\.d\.ts$/, /^tests\/fixtures\//];
const FIELDS = ['Purpose:', 'Scope:', 'Does NOT belong:'];

const files = repoFiles(CHECKED, EXEMPT);

let failed = 0;
for (const file of files) {
  let head;
  try {
    head = readFileSync(path.join(repoRoot, file), 'utf8').split('\n').slice(0, 15).join('\n');
  } catch {
    continue;
  }
  const missing = FIELDS.filter((field) => !head.includes(field));
  const placeholder = /(Purpose|Scope):\s*(TODO|TBD|\.\.\.)/i.test(head);
  if (missing.length || placeholder) {
    console.error(
      `${color.red('✗')} ${file}: header ${placeholder ? 'has placeholder text' : `missing ${missing.join(', ')}`}`,
    );
    failed += 1;
  }
}
if (failed) process.exit(1);
ok(`File headers OK (${files.length} files checked)`);
