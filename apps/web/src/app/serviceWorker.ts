// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Register the service worker (public/sw.js) that lets the app shell open without a server.
 * Scope: Only in production builds, only on a secure page (localhost counts; a LAN address over
 *   plain HTTP doesn't, so phones never get one) and only where browsers support it. The app version
 *   is in the script's URL, so a new version installs a new worker, which clears the old caches.
 * Does NOT belong: What is cached and how (public/sw.js) or showing the reconnect state
 *   (ConnectionBanner.tsx).
 */

declare const __APP_VERSION__: string;

interface Environment {
  production?: boolean;
  secure?: boolean;
  container?: Pick<ServiceWorkerContainer, 'register'> | undefined;
}

/** Whether a service worker was registered; never in development, tests or insecure pages. */
export async function registerServiceWorker({
  production = import.meta.env.PROD,
  secure = globalThis.isSecureContext,
  container = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
}: Environment = {}): Promise<boolean> {
  if (!production || !secure || !container) return false;
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
  try {
    await container.register(`/sw.js?v=${encodeURIComponent(version)}`, { scope: '/' });
    return true;
  } catch {
    return false; // e.g. blocked by the browser's settings: the app works the same without it
  }
}
