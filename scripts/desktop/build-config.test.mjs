// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The TTSNATIVE_TAURI_CONFIG overlay reaches only test builds, and only the updater section.
 * Scope: No overlay, the update test's overlay on a test build, the same overlay on a release build,
 *   an overlay that touches anything else, and malformed JSON.
 * Does NOT belong: Building (build.mjs).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overrideArgs } from './build-config.mjs';

const UPDATER = JSON.stringify({
  plugins: {
    updater: {
      pubkey: 'throwaway',
      endpoints: ['http://127.0.0.1:8799/latest.json'],
      dangerousInsecureTransportProtocol: true,
    },
  },
});

test('without an overlay a build gets no extra arguments', () => {
  assert.deepEqual(overrideArgs({ testHooks: false, override: undefined }), []);
  assert.deepEqual(overrideArgs({ testHooks: true, override: '' }), []);
});

test('a test build takes the update test overlay', () => {
  assert.deepEqual(overrideArgs({ testHooks: true, override: UPDATER }), ['--config', UPDATER]);
});

test('a release build refuses the overlay, naming the switch that would allow it', () => {
  assert.throws(
    () => overrideArgs({ testHooks: false, override: UPDATER }),
    /test builds only \(TTSNATIVE_TEST_HOOKS=1\)/,
  );
});

test('an overlay may name nothing but plugins.updater', () => {
  for (const override of [
    JSON.stringify({ bundle: { windows: { signCommand: 'evil %1' } } }),
    JSON.stringify({ plugins: { updater: {}, shell: {} } }),
    JSON.stringify({ plugins: { updater: {} }, version: '9.9.9' }),
    JSON.stringify(['plugins']),
    JSON.stringify({ plugins: 'updater' }),
  ]) {
    assert.throws(() => overrideArgs({ testHooks: true, override }), /only set plugins\.updater/);
  }
  assert.throws(() => overrideArgs({ testHooks: true, override: '{not json' }), /not valid JSON/);
});
