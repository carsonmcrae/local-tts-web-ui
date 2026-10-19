/**
 * Purpose: Vite build/dev-server and Vitest configuration for the web UI.
 * Scope: React + Tailwind plugins, the `@` alias, the loopback-only dev server that proxies /api to
 *   the local Python server (port from LTTS_API_PORT, set by scripts/dev.mjs), and unit-test setup.
 * Does NOT belong: Orchestration of the API process (scripts/dev.mjs).
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const apiPort = process.env.LTTS_API_PORT ?? '8765';
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

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
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/api/schema.gen.ts', 'src/main.tsx'],
      thresholds: { lines: 70, functions: 70, branches: 65, statements: 70 },
    },
  },
});
