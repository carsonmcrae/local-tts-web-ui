// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Keep the list of the web app's pages in step with its router.
 * Scope: Every route path in apps/web/src/app/App.tsx (except the not-found catch-all) is in
 *   APP_ROUTES and nothing else is, so the installed app's smoke test opens every page there is.
 * Does NOT belong: The smoke test itself (scripts/desktop/smoke-test.mjs).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { APP_ROUTES } from './app-routes.mjs';
import { repoRoot } from './paths.mjs';

test('the list of pages matches the router', () => {
  const router = readFileSync(path.join(repoRoot, 'apps', 'web', 'src', 'app', 'App.tsx'), 'utf8');
  const routed = [...router.matchAll(/\bpath: '([^']+)'/g)]
    .map((match) => match[1] ?? '')
    .filter((route) => route !== '*')
    .map((route) => `/${route}`);
  assert.ok(routed.length > 5, "the router declares its pages with `path: '…'`");
  assert.deepEqual([...routed].sort(), [...APP_ROUTES].sort());
});
