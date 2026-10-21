// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/*
 * Purpose: The service worker: lets the app shell open while the server is unreachable, and says so.
 * Scope: Caches only the app shell: index.html (network first, the cached copy only when the server
 *   doesn't answer), the hashed files under /assets/ (cached as they are fetched; their names change
 *   with their content) and a few top-level files (icons, manifest, theme script). It never touches
 *   /api/* or /v1/* (documents, audio, exports, settings, the speech API), other methods than GET,
 *   range requests or other origins: those always go to the network as if it weren't here. Old
 *   caches are deleted when a new version activates. With no cached shell, a navigation that fails
 *   gets a small "isn't reachable" page with a Retry link (no scripts). Only the screens can open
 *   this way: reading and listening always need the server, which makes the speech.
 * Does NOT belong: Registering it (src/app/serviceWorker.ts) or the in-app reconnect banner.
 */
'use strict';

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const PREFIX = 'ttsnative-shell-';
const CACHE = PREFIX + VERSION;
const SHELL = '/'; // index.html: every app route serves the same page
const TOP_LEVEL = [
  '/theme-boot.js',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];
const MAX_ASSETS = 120; // old builds' files are dropped first
const NEVER = /^\/(api|v1)(\/|$)/;

const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="20">
<title>TTSNative isn't reachable</title>
<style>
  :root { color-scheme: light dark; --bg: #f7f6f3; --text: #14151a; --muted: #55565c; --accent: #4f46e5; }
  @media (prefers-color-scheme: dark) { :root { --bg: #121316; --text: #ececee; --muted: #a9aab1; --accent: #a5b4fc; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg);
    color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 26rem; padding: 2rem 1rem; }
  h1 { font-size: 1.375rem; margin: 0 0 .5rem; }
  p { color: var(--muted); margin: 0 0 1.5rem; }
  a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 1.25rem; border-radius: 10px;
    background: var(--accent); color: var(--bg); font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<main>
<h1>TTSNative isn't reachable</h1>
<p>Is the computer on and the app running? This page tries again every 20 seconds.</p>
<a href="">Retry</a>
</main>
</body>
</html>`;

function cacheable(response) {
  if (!response || response.status !== 200 || response.type !== 'basic' || response.redirected)
    return false;
  return !/no-store|private/i.test(response.headers.get('Cache-Control') || '');
}

function isHtml(response) {
  return (response.headers.get('Content-Type') || '').startsWith('text/html');
}

function offline() {
  return new Response(OFFLINE_PAGE, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'",
      'Cache-Control': 'no-store',
    },
  });
}

async function remember(cache, key, response) {
  try {
    await cache.put(key, response);
  } catch {
    // storage full or unavailable: the app works the same, but its screens won't open while the
    // server is unreachable
  }
}

async function precache() {
  const cache = await caches.open(CACHE);
  try {
    const page = await fetch(SHELL, { cache: 'no-cache' });
    if (!cacheable(page) || !isHtml(page)) return;
    const html = await page.clone().text();
    await remember(cache, SHELL, page);
    const assets = Array.from(
      html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g),
      (match) => match[1],
    );
    await Promise.all(
      Array.from(new Set([...assets, ...TOP_LEVEL]), async (path) => {
        const response = await fetch(path, { cache: 'no-cache' }).catch(() => null);
        if (cacheable(response)) await remember(cache, path, response);
      }),
    );
  } catch {
    // offline while installing: the shell is cached the next time it loads
  }
}

async function trim(cache) {
  const assets = (await cache.keys()).filter((request) =>
    new URL(request.url).pathname.startsWith('/assets/'),
  );
  await Promise.all(
    assets
      .slice(0, Math.max(0, assets.length - MAX_ASSETS))
      .map((request) => cache.delete(request)),
  );
}

/** The network's answer (kept under `key` when `keep` accepts it); the kept copy only if there is none. */
async function networkFirst(event, key, keep) {
  try {
    const response = await fetch(event.request);
    if (cacheable(response) && keep(response)) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => remember(cache, key, copy)));
    }
    return response;
  } catch (error) {
    const kept = await caches.match(key, { cacheName: CACHE });
    if (kept) return kept;
    if (event.request.mode === 'navigate') return offline();
    throw error;
  }
}

/** Hashed build files never change under the same name, so a kept copy is always right. */
async function asset(event) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(event.request);
  if (kept) return kept;
  const response = await fetch(event.request);
  if (cacheable(response)) {
    const copy = response.clone();
    event.waitUntil(remember(cache, event.request, copy).then(() => trim(cache)));
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(PREFIX) && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  // The API, the speech API and everything they serve (documents, audio, exports): never cached.
  if (url.origin !== self.location.origin || NEVER.test(url.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, SHELL, isHtml));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(asset(event));
  } else if (TOP_LEVEL.includes(url.pathname)) {
    event.respondWith(networkFirst(event, url.pathname, () => true));
  }
});
