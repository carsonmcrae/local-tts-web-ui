// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Consistent, colour-aware console output for the bootstrap and dev scripts.
 * Scope: Step/ok/warn/fail lines, actionable error formatting, prefixed child-process output.
 * Does NOT belong: Process management (processes.mjs) or any decision logic.
 */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

/** @param {string} code @param {string} text */
const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);

export const color = {
  dim: (/** @type {string} */ t) => paint('2', t),
  bold: (/** @type {string} */ t) => paint('1', t),
  red: (/** @type {string} */ t) => paint('31', t),
  green: (/** @type {string} */ t) => paint('32', t),
  yellow: (/** @type {string} */ t) => paint('33', t),
  cyan: (/** @type {string} */ t) => paint('36', t),
  magenta: (/** @type {string} */ t) => paint('35', t),
};

/** @param {string} message */
export function step(message) {
  console.log(`${color.cyan('›')} ${message}`);
}

/** @param {string} message */
export function ok(message) {
  console.log(`${color.green('✓')} ${message}`);
}

/** @param {string} message */
export function warn(message) {
  console.warn(`${color.yellow('!')} ${message}`);
}

/**
 * An error that carries a plain-language fix. Bootstrap code throws this instead of
 * letting low-level errors escape, so `npm run dev` never fails mysteriously.
 */
export class BootstrapError extends Error {
  /** @param {string} message @param {string[]} [hints] */
  constructor(message, hints = []) {
    super(message);
    this.name = 'BootstrapError';
    this.hints = hints;
  }
}

/** @param {unknown} error */
export function printFailure(error) {
  console.error('');
  if (error instanceof BootstrapError) {
    console.error(`${color.red('✗')} ${color.bold(error.message)}`);
    for (const hint of error.hints) console.error(`  ${color.dim('→')} ${hint}`);
  } else {
    console.error(`${color.red('✗')} Unexpected failure:`);
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  }
  console.error('');
  console.error(color.dim('  Run `npm run doctor` for a full environment report.'));
}

/**
 * Format bytes for humans.
 * @param {number} bytes
 */
export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
