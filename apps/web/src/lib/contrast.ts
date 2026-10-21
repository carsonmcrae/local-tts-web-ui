// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The contrast preference for this device: standard, or high contrast.
 * Scope: Persists the choice in localStorage, applies the `contrast-more` class on <html> (also when
 *   "system" is chosen and the OS asks for more contrast) and follows that OS setting live.
 *   public/theme-boot.js applies it before first paint. Forced-colours modes (Windows high contrast)
 *   need no choice: styles/index.css adapts to them.
 * Does NOT belong: Colour tokens (styles/index.css) or light/dark (theme.ts).
 */
import { useCallback, useEffect, useState } from 'react';

export type ContrastChoice = 'system' | 'more';
const STORAGE_KEY = 'ltts.contrast';
const QUERY = '(prefers-contrast: more)';

function readChoice(): ContrastChoice {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) === 'more' ? 'more' : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ContrastChoice): void {
  const asked = globalThis.matchMedia?.(QUERY).matches ?? false;
  document.documentElement.classList.toggle('contrast-more', choice === 'more' || asked);
}

export function useContrast(): [ContrastChoice, (choice: ContrastChoice) => void] {
  const [choice, setChoice] = useState<ContrastChoice>(readChoice);

  useEffect(() => {
    apply(choice);
    if (!globalThis.matchMedia) return undefined;
    const media = globalThis.matchMedia(QUERY);
    const onChange = () => apply(readChoice());
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);

  const update = useCallback((next: ContrastChoice) => {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable (private mode): the choice still applies for this session
    }
    setChoice(next);
  }, []);

  return [choice, update];
}
