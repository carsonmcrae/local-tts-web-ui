// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: A display choice kept on this device that also follows a system setting (a media query).
 * Scope: Holds the choice, applies it now and whenever the system setting changes (reading the saved
 *   choice at that moment, so every hook instance agrees), and saves changes in localStorage; without
 *   storage (private mode) a change still applies for the session. Used by the theme and contrast.
 * Does NOT belong: What a choice does to the page (theme.ts, contrast.ts).
 */
import { useCallback, useEffect, useState } from 'react';

export function useDeviceChoice<T extends string>(
  key: string,
  query: string,
  read: () => T,
  apply: (choice: T) => void,
): [T, (choice: T) => void] {
  const [choice, setChoice] = useState<T>(read);

  useEffect(() => {
    apply(choice);
    if (!globalThis.matchMedia) return undefined;
    const media = globalThis.matchMedia(query);
    const onChange = () => apply(read());
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice, query, read, apply]);

  const update = useCallback(
    (next: T) => {
      try {
        globalThis.localStorage.setItem(key, next);
      } catch {
        // storage unavailable (private mode): the choice still applies for this session
      }
      setChoice(next);
    },
    [key],
  );

  return [choice, update];
}
