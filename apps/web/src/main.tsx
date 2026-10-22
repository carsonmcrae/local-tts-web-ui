// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Browser entry point.
 * Scope: Loads global styles, mounts <App /> in StrictMode and, once the page has loaded,
 *   registers the service worker (production builds on secure pages only).
 * Does NOT belong: Providers or routes (app/App.tsx).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { registerServiceWorker } from '@/app/serviceWorker';
import '@/styles/index.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

window.addEventListener('load', () => void registerServiceWorker());
