// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The version this copy of the UI was built as.
 * Scope: A release number (2.1.0) or a development identifier (2.1.0-dev.3+branch.commit), stamped
 *   at build time; "dev" if it is missing.
 * Does NOT belong: Release notes (releaseHistory.ts) or the server's version (GET /api/system).
 */
declare const __APP_VERSION__: string | undefined;

export function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}
