// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Tests for the per-device theme preference hook.
 * Scope: Reading and saving the choice (including blocked storage), applying the `dark` class, and
 *   following the operating system's colour scheme when "system" is chosen.
 * Does NOT belong: Theme controls in Settings (settings tests).
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from './theme';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

/** A matchMedia stub whose dark-mode answer can be flipped, notifying change listeners. */
function systemScheme(dark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: dark,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => media);
  return {
    listeners,
    set(next: boolean) {
      media.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

describe('useTheme', () => {
  it('starts from the saved choice and applies it', () => {
    localStorage.setItem('ltts.theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('ignores unknown saved values and follows the system scheme live', () => {
    localStorage.setItem('ltts.theme', 'sepia');
    const scheme = systemScheme(true);
    const { result, unmount } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('system');
    expect(document.documentElement).toHaveClass('dark');
    act(() => scheme.set(false));
    expect(document.documentElement).not.toHaveClass('dark');
    unmount();
    expect(scheme.listeners.size).toBe(0);
  });

  it('works without matchMedia and with storage blocked', () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('system');
    expect(document.documentElement).not.toHaveClass('dark');
    act(() => result.current[1]('dark'));
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });
});
