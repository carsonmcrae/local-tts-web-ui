// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Browser entry point.
 * Scope: Loads global styles and mounts <App /> in StrictMode.
 * Does NOT belong: Providers or routes (app/App.tsx).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import '@/styles/index.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
