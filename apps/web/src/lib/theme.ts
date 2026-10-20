// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Light/dark/system theme preference for this device.
 * Scope: Persists the choice in localStorage (per-device by design), applies the `dark` class and
 *   follows the OS setting live when "system" is selected. public/theme-boot.js applies it pre-paint.
 * Does NOT belong: Colour tokens (styles/index.css).
 */
import { useCallback, useEffect, useState } from 'react';

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
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);

  useEffect(() => {
    apply(choice);
    if (!globalThis.matchMedia) return undefined;
    const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
    // Read the stored choice at event time so every hook instance agrees on the latest setting.
    const onChange = () => apply(readChoice());
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);

  const update = useCallback((next: ThemeChoice) => {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable (private mode): the choice still applies for this session
    }
    setChoice(next);
  }, []);

  return [choice, update];
}
