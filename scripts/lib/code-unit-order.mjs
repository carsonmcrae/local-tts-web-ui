// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Sort strings in the order a plain `sort()` uses, with the comparator written out.
 * Scope: UTF-16 code-unit order ("B" before "a", "_" after "Z"), the same on every machine and in
 *   every locale, for generated files and lists whose order must never move.
 * Does NOT belong: Order for people to read (`localeCompare`) or version order (semver.mjs).
 */

/**
 * Code-unit order, exactly what `sort()` without a comparator does; unlike `localeCompare`, case and
 * punctuation never change places with the machine's locale.
 * @param {string} a
 * @param {string} b
 */
export function compareCodeUnits(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
