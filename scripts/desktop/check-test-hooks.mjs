// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Prove whether a built TTSNative.exe contains the test hooks (the `test-hooks` Cargo feature,
 *   which lets the automated installer tests open WebView2's debugging port).
 * Scope: Scans the executable for the switch text that only the feature compiles in, and fails when the
 *   result differs from what the caller expects: `absent` for every release build (build.mjs checks this
 *   for any build without TTSNATIVE_TEST_HOOKS=1, and the Desktop workflow checks a plain release build),
 *   `present` for a test build. Usage: `node scripts/desktop/check-test-hooks.mjs <exe> absent|present`.
 * Does NOT belong: Building (build.mjs) or driving the window (webview-debugging.mjs).
 */
import { readFileSync } from 'node:fs';

/** The switch text the feature compiles in; split so this file never contains it whole. */
const MARKER = Buffer.from(['remote', 'debugging', 'port'].join('-'));

/**
 * @param {string} exe
 * @param {'absent' | 'present'} expected
 * @returns {string | null} what is wrong, or null when the binary is as expected
 */
export function checkTestHooks(exe, expected) {
  const present = readFileSync(exe).includes(MARKER);
  if (expected === 'absent' && present) {
    return `${exe} contains the test hooks; a release build must never have them (TTSNATIVE_TEST_HOOKS must be unset).`;
  }
  if (expected === 'present' && !present) {
    return `${exe} has no test hooks, but this build was meant for the automated tests (TTSNATIVE_TEST_HOOKS=1).`;
  }
  return null;
}

if (process.argv[1]?.endsWith('check-test-hooks.mjs')) {
  const [exe = '', expected = ''] = process.argv.slice(2);
  if (!exe || (expected !== 'absent' && expected !== 'present')) {
    console.error('usage: check-test-hooks.mjs <exe> absent|present');
    process.exit(2);
  }
  const problem = checkTestHooks(exe, expected);
  if (problem) {
    console.error(`✗ ${problem}`);
    process.exit(1);
  }
  console.log(`✓ ${exe}: test hooks ${expected}`);
}
