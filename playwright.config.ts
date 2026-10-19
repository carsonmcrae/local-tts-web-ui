/**
 * Purpose: Playwright configuration for end-to-end tests against the real app and real models.
 * Scope: Two isolated production-style servers (with models on :8799, without on :8798), desktop
 *   Chromium for the full suite, Firefox/WebKit for @cross-browser specs, Pixel 7 and iPhone 13
 *   emulation for @mobile specs, fake microphone flags for recording tests.
 * Does NOT belong: Unit tests (Vitest/pytest) or building the UI (`npm run test:e2e` builds first).
 */
import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8799',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      grepInvert: /@mobile/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
        },
      },
    },
    { name: 'firefox', grep: /@cross-browser/, use: devices['Desktop Firefox'] },
    { name: 'webkit', grep: /@cross-browser/, use: devices['Desktop Safari'] },
    { name: 'mobile-chrome', grep: /@mobile/, use: devices['Pixel 7'] },
    { name: 'mobile-safari', grep: /@mobile/, use: devices['iPhone 13'] },
  ],
  webServer: [
    {
      command: 'node scripts/e2e-server.mjs --port 8799',
      url: 'http://127.0.0.1:8799/api/health',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'node scripts/e2e-server.mjs --port 8798 --no-models',
      url: 'http://127.0.0.1:8798/api/health',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
