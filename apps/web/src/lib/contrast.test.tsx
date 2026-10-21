// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the per-device contrast preference hook.
 * Scope: Starting from the saved choice and applying the `contrast-more` class, and working without
 *   matchMedia or with storage blocked (private mode).
 * Does NOT belong: The contrast control in Settings (settings tests) or the colour tokens.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useContrast } from './contrast';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('contrast-more');
});

describe('useContrast', () => {
  it('starts from the saved choice and applies it', () => {
    localStorage.setItem('ltts.contrast', 'more');
    const { result } = renderHook(() => useContrast());
    expect(result.current[0]).toBe('more');
    expect(document.documentElement).toHaveClass('contrast-more');
  });

  it('follows the system by default, without matchMedia and with storage blocked', () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useContrast());
    expect(result.current[0]).toBe('system');
    expect(document.documentElement).not.toHaveClass('contrast-more');
  });
});
