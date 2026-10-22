// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the code-unit string order that generated files and release lists are sorted by.
 * Scope: The same order as a plain `sort()` for case, punctuation, digits, accents and characters
 *   outside the Basic Multilingual Plane, and equal strings comparing as equal.
 * Does NOT belong: Version order (semver.test.mjs).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareCodeUnits } from './code-unit-order.mjs';

// Capitals before lower case, "_" between them, digits by character rather than by value, an accent
// after every ASCII letter, and an emoji (a surrogate pair) before U+FB00 as UTF-16 orders them.
const MIXED = ['b', 'ﬀ', 'B', '_x', 'é', 'a', '😀', 'Z', '10', 'e', '9', 'a-b', 'a_b'];

test('sorts exactly as sort() without a comparator does', () => {
  assert.deepEqual(MIXED.toSorted(compareCodeUnits), [
    '10',
    '9',
    'B',
    'Z',
    '_x',
    'a',
    'a-b',
    'a_b',
    'b',
    'e',
    'é',
    '😀',
    'ﬀ',
  ]);
});

test('equal strings compare as equal, either way round otherwise', () => {
  assert.equal(compareCodeUnits('notices', 'notices'), 0);
  assert.equal(compareCodeUnits('Z', 'a'), -1);
  assert.equal(compareCodeUnits('a', 'Z'), 1);
});
