// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Light/dark/system theme preference for this device.
 * Scope: Persists the choice in localStorage (per-device by design), applies the `dark` class and
 *   follows the OS setting live when "system" is selected. public/theme-boot.js applies it pre-paint.
 * Does NOT belong: Colour tokens (styles/index.css).
 */
import { useDeviceChoice } from './deviceChoice';

export type ThemeChoice = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'ltts.theme';

function readChoice(): ThemeChoice {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice): void {
  const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dark = choice === 'dark' || (choice === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  return useDeviceChoice(STORAGE_KEY, '(prefers-color-scheme: dark)', readChoice, apply);
}
