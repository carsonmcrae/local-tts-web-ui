// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The pages of the web app, for tests that check every surface opens all of them.
 * Scope: The route paths apps/web/src/app/App.tsx declares (app-routes.test.mjs keeps the two in step),
 *   with `:documentId` standing for a document's id.
 * Does NOT belong: The router itself (App.tsx) or what each page shows.
 */

export const APP_ROUTES = [
  '/pair',
  '/library',
  '/explore',
  '/read/:documentId',
  '/voices',
  '/studio',
  '/exports',
  '/settings',
];
