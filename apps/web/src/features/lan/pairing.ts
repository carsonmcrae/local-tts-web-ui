// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Small, pure helpers for pairing a phone or tablet in LAN mode.
 * Scope: Reading a pairing code as typed or from the QR link (with or without the dash, any case),
 *   a default name for the device from its user agent, and where to go after pairing (the page that
 *   asked for it, if it is one of the app's own).
 * Does NOT belong: The pairing page itself (PairPage.tsx) or the pairing rules (the server).
 */

export const CODE_LENGTH = 8;

/** "abcd-efgh", "ABCDEFGH" or "#ABCDEFGH" → "ABCDEFGH" (letters and digits only, upper case). */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** "ABCDEFGH" → "ABCD-EFGH", as the computer shows it; anything else is returned as it is. */
export function formatCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** A name the computer can show in its list of paired devices; the person can change it. */
export function deviceName(userAgent: string, touchPoints = 0): string {
  if (/iPhone|iPod/.test(userAgent)) return 'iPhone';
  // iPadOS asks for desktop sites and says "Macintosh"; a touch screen gives it away.
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'iPad';
  if (/Android/.test(userAgent)) return /Mobile/.test(userAgent) ? 'Android phone' : 'Tablet';
  if (/Tablet|Silk|Kindle/i.test(userAgent)) return 'Tablet';
  return 'Phone or tablet';
}

/** The app page to return to after pairing: the one that sent the device here, else the library. */
export function returnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  const own = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//');
  return own && !from.startsWith('/pair') ? from : '/library';
}
