// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Vite build/dev-server and Vitest configuration for the web UI.
 * Scope: React + Tailwind plugins, the `@` alias, the licence banner on every bundle and the
 *   third-party licence files (bundled packages, and the fonts' OFL texts), the loopback-only dev
 *   server that proxies /api to the local Python server (port from LTTS_API_PORT, set by
 *   scripts/dev.mjs), and unit-test setup.
 * Does NOT belong: Orchestration of the API process (scripts/dev.mjs).
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const apiPort = process.env.LTTS_API_PORT ?? '8765';
const BANNER = '/*! TTSNative | Copyright (c) 2026 Carson McRae | MIT License */';
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

/** The fonts are imported from CSS, which Vite's licence file doesn't cover: ship their OFL texts too. */
function fontLicenses(): Plugin {
  const fonts = ['inter', 'literata'];
  return {
    name: 'font-licenses',
    apply: 'build',
    generateBundle() {
      const texts = fonts.map((font) =>
        readFileSync(
          new URL(`../../node_modules/@fontsource-variable/${font}/LICENSE`, import.meta.url),
          'utf8',
        ),
      );
      this.emitFile({ type: 'asset', fileName: 'FONT-LICENSES.txt', source: texts.join('\n\n') });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), fontLicenses()],
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
    // The MIT notice travels with every bundle (added after minification), and the licences of
    // the bundled packages and fonts ship next to the build (MIT, ISC and OFL require that).
    rolldownOptions: { output: { postBanner: BANNER } },
    license: { fileName: 'THIRD-PARTY-LICENSES.md' },
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
