/**
 * Purpose: Global Vitest setup for DOM tests.
 * Scope: jest-dom matchers, automatic cleanup, and jsdom gaps the app relies on (matchMedia,
 *   object URLs, scrollIntoView, HTMLMediaElement play/pause).
 * Does NOT belong: Per-test fixtures (src/test/render.tsx).
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

URL.createObjectURL = vi.fn(() => 'blob:mock');
URL.revokeObjectURL = vi.fn();
Element.prototype.scrollIntoView = vi.fn();
window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
window.HTMLMediaElement.prototype.pause = vi.fn();

(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = 'test';
