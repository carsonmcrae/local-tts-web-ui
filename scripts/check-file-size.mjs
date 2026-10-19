// @ts-check
/**
 * Purpose: Enforce source file size limits across languages (repository rule, see CONTRIBUTING.md).
 * Scope: Every tracked source file (TS/TSX/MJS/PY/CSS/MD/YML). Under 300 lines is the target;
 *   over 400 is reported for review; over 500 fails unless listed with a reason in
 *   `scripts/file-size-exceptions.json`. Lockfiles, generated files and fixtures are exempt.
 * Does NOT belong: Formatting or complexity checks (ESLint / ruff).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { color, ok, warn } from './lib/log.mjs';
import { repoRoot } from './lib/paths.mjs';
import { repoFiles } from './lib/repo-files.mjs';

const REVIEW = 400;
const LIMIT = 500;
const CHECKED = /\.(ts|tsx|mjs|js|py|css|md|ya?ml)$/;
const EXEMPT = [
  /(^|\/)package-lock\.json$/,
  /uv\.lock$/,
  /schema\.gen\.ts$/,
  /^tests\/fixtures\//,
  /^CHANGELOG\.md$/,
];

/** @returns {Record<string, string>} */
function exceptions() {
  try {
    return (
      JSON.parse(readFileSync(path.join(repoRoot, 'scripts', 'file-size-exceptions.json'), 'utf8'))
        .files ?? {}
    );
  } catch {
    return {};
  }
}

const files = repoFiles(CHECKED, EXEMPT);

const allowed = exceptions();
let failed = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(path.join(repoRoot, file), 'utf8');
  } catch {
    continue; // deleted but not yet staged
  }
  const lines = text.split('\n').length;
  if (lines > LIMIT && !allowed[file]) {
    console.error(
      `${color.red('✗')} ${file}: ${lines} lines (limit ${LIMIT}). Split it or document an exception.`,
    );
    failed += 1;
  } else if (lines > REVIEW) {
    const exception = allowed[file] ? ` (exception: ${allowed[file]})` : '';
    warn(
      `${file}: ${lines} lines — over ${REVIEW}, review whether it should be split${exception}.`,
    );
  }
}
if (failed) process.exit(1);
ok(`File sizes OK (${files.length} files checked)`);
