// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Keep the project's copyright, licence and provenance markers in place (ATTRIBUTION.md).
 * Scope: Every hand-written source file under apps/, scripts/ and tests/ starts with the SPDX
 *   licence line and the author's copyright line; LICENSE, NOTICE, ATTRIBUTION.md and CITATION.cff
 *   name the author; the project fingerprint appears in NOTICE, CITATION.cff, the server and web
 *   provenance modules and the web build's licence banner; the web page names its author.
 * Does NOT belong: Licence compatibility of dependencies (license-inventory.mjs) or module headers
 *   (check-headers.mjs).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { color, ok } from './lib/log.mjs';
import { repoRoot } from './lib/paths.mjs';
import { repoFiles } from './lib/repo-files.mjs';

const AUTHOR = 'Carson McRae';
const SPDX = 'SPDX-License-Identifier: MIT';
const COPYRIGHT = `Copyright (c) 2026 ${AUTHOR}`;
const FINGERPRINT = 'ltts-origin-c44dbf7e-6172-4e3a-a46a-636998263e03';
const CHECKED = /^(apps|scripts|tests)\/.*\.(ts|tsx|mjs|py|css)$/;
const EXEMPT = [/schema\.gen\.ts$/, /vite-env\.d\.ts$/, /^tests\/fixtures\//];

/** Files that must mention each marker. @type {[string, string[]][]} */
const REQUIRED = [
  ['LICENSE', [COPYRIGHT]],
  ['NOTICE', [COPYRIGHT, FINGERPRINT]],
  ['ATTRIBUTION.md', [AUTHOR, FINGERPRINT]],
  ['CITATION.cff', [AUTHOR.split(' ')[1] ?? AUTHOR, FINGERPRINT]],
  ['apps/server/src/ltts/provenance.py', [AUTHOR, FINGERPRINT]],
  ['apps/web/src/lib/provenance.ts', [AUTHOR, FINGERPRINT]],
  ['apps/web/vite.config.ts', [COPYRIGHT, FINGERPRINT]],
  ['apps/web/index.html', [`content="${AUTHOR}"`]],
];

/** @param {string} file */
function read(file) {
  try {
    return readFileSync(path.join(repoRoot, file), 'utf8');
  } catch {
    return null;
  }
}

const problems = [];
const files = repoFiles(CHECKED, EXEMPT);
for (const file of files) {
  const head = read(file)?.split('\n').slice(0, 4).join('\n');
  if (head === undefined) continue; // deleted in the working tree
  if (!head.includes(SPDX) || !head.includes(COPYRIGHT)) {
    problems.push(`${file}: missing the SPDX licence and copyright lines at the top`);
  }
}
for (const [file, markers] of REQUIRED) {
  const text = read(file);
  const missing = text === null ? markers : markers.filter((marker) => !text.includes(marker));
  if (missing.length) problems.push(`${file}: missing ${missing.join(', ')}`);
}
for (const problem of problems) console.error(`${color.red('✗')} ${problem}`);
if (problems.length) {
  console.error('See ATTRIBUTION.md: these notices are required by the licence.');
  process.exit(1);
}
ok(`Provenance markers OK (${files.length} source files, ${REQUIRED.length} notices)`);
