// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for sizing the Vitest worker pool to the CPUs that are free.
 * Scope: Idle CI runners keep the usual count, big machines get one worker per core, busy machines get
 *   fewer workers, never fewer than one; the idle sampler reports a share of the real CPUs.
 * Does NOT belong: Vitest itself or the web tests (apps/web).
 */
import assert from 'node:assert/strict';
import os from 'node:os';
import { test } from 'node:test';
import { idleCpus, testWorkers } from './test-workers.mjs';

test('an idle CI runner keeps the usual logical CPUs minus one', () => {
  assert.equal(testWorkers(4, 3.9), 3);
  assert.equal(testWorkers(2, 2), 1);
});

test('a big idle machine gets about one worker per physical core', () => {
  assert.equal(testWorkers(32, 31.5), 16);
  assert.equal(testWorkers(8, 8), 4);
});

test('a busy machine gets only as many workers as it has free CPUs', () => {
  assert.equal(testWorkers(32, 22.2), 16);
  assert.equal(testWorkers(32, 3), 2);
  assert.equal(testWorkers(32, 0.4), 1);
  assert.equal(testWorkers(4, 1.6), 1);
});

test('the sampler reports how many of the real CPUs were idle', async () => {
  const idle = await idleCpus(50);
  assert.ok(idle >= 0 && idle <= os.cpus().length, String(idle));
});
