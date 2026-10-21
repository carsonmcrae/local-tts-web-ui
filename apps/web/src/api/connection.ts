// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: What the API client learns about the connection to the server, for the rest of the app.
 * Scope: Whether the server answers at all (any response counts; a failed fetch doesn't), as a tiny
 *   store React can subscribe to, and one hook for "this phone or tablet must pair first" (a 401
 *   `device_not_paired` in LAN mode), called once until a response says otherwise.
 * Does NOT belong: Making requests (client.ts), the reconnect banner (app/ConnectionBanner.tsx) or
 *   where an unpaired device is sent (app/App.tsx).
 */

type Listener = () => void;

let reachable = true;
const listeners = new Set<Listener>();
let unpairedHandler: (() => void) | null = null;
let unpairedReported = false;

export function isServerReachable(): boolean {
  return reachable;
}

export function subscribeToConnection(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by the client after every request: true when any response arrived. */
export function reportServerReachable(value: boolean): void {
  if (reachable === value) return;
  reachable = value;
  for (const listener of listeners) listener();
}

/** Who to tell when this device isn't paired (one handler; null removes it). */
export function onDeviceNotPaired(handler: (() => void) | null): void {
  unpairedHandler = handler;
}

/**
 * Called by the client after every response. Many requests are refused at once when a device
 * isn't paired, so the handler hears about it once, and again only after a response got through.
 */
export function reportPairing(unpaired: boolean): void {
  if (!unpaired) {
    unpairedReported = false;
    return;
  }
  if (unpairedReported) return;
  unpairedReported = true;
  unpairedHandler?.();
}
