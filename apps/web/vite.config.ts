// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Vite build/dev-server and Vitest configuration for the web UI.
 * Scope: React + Tailwind plugins, the `@` alias, the licence banner on every bundle, the loopback-only dev server that proxies /api to
 *   the local Python server (port from LTTS_API_PORT, set by scripts/dev.mjs), and unit-test setup.
 * Does NOT belong: Orchestration of the API process (scripts/dev.mjs).
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const apiPort = process.env.LTTS_API_PORT ?? '8765';
const BANNER =
  '/*! Local TTS Web UI | Copyright (c) 2026 Carson McRae | MIT License | ' +
  'https://github.com/carsonmcrae/local-tts-web-ui | ltts-origin-c44dbf7e-6172-4e3a-a46a-636998263e03 */';
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
    },
  },
  preview: { host: '127.0.0.1' },
  build: {
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    // Every bundle names its origin (see ATTRIBUTION.md), added after minification.
    rolldownOptions: { output: { postBanner: BANNER } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/api/schema.gen.ts', 'src/main.tsx'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
