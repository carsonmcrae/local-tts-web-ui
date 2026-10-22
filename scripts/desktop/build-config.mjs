// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Decide whether a build may take the TTSNATIVE_TAURI_CONFIG overlay, and what it may change.
 * Scope: The overlay exists for the automated update test, which builds two versions trusting a
 *   throwaway key and a local update address. It is applied only when the test hooks are on, it may
 *   name nothing but `plugins.updater`, and any other build refuses it outright, so a release can never
 *   be built trusting a key that is not the project's.
 * Does NOT belong: The build itself (build.mjs) or the update test (update-test.mjs).
 */

const ONLY = 'TTSNATIVE_TAURI_CONFIG may only set plugins.updater (the update test does that)';

/**
 * Arguments to append to `tauri build` for the overlay, or none.
 * @param {{ testHooks: boolean, override: string | undefined }} build
 * @returns {string[]}
 */
export function overrideArgs({ testHooks, override }) {
  if (!override) return [];
  if (!testHooks) {
    throw new Error(
      'TTSNATIVE_TAURI_CONFIG is for test builds only (TTSNATIVE_TEST_HOOKS=1): unset it for this build.',
    );
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(override);
  } catch {
    throw new Error('TTSNATIVE_TAURI_CONFIG is not valid JSON.');
  }
  if (!isRecord(parsed) || Object.keys(parsed).join() !== 'plugins') throw new Error(ONLY);
  const plugins = parsed.plugins;
  if (!isRecord(plugins) || Object.keys(plugins).join() !== 'updater') throw new Error(ONLY);
  return ['--config', override];
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
