// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the sidebar sign that LAN mode is on (features/lan/LanIndicator.tsx).
 * Scope: Shown on this computer while LAN mode is on, with the network it is open on and a link to
 *   its settings; gone once it turns itself off (checked every 15 s); never shown, or asked for, on a
 *   phone or tablet.
 * Does NOT belong: The settings section (features/settings/lan.test.tsx).
 */
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithApp } from '@/test/render';
import { LanIndicator, onThisComputer } from './LanIndicator';

afterEach(() => vi.useRealTimers());

const status = (enabled: boolean) => ({
  enabled, address: enabled ? '192.168.1.20' : null, interface: enabled ? 'Wi-Fi' : null, port: 8765,
  url: enabled ? 'http://192.168.1.20:8765' : null, addresses: [], devices: [], pairing: null,
}); // prettier-ignore

describe('LAN mode sign', () => {
  it('shows the network LAN mode is open on, and goes once it turns itself off', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = status(true);
    const api = mockApi({ 'GET /api/lan': () => current });
    renderWithApp(<LanIndicator />);
    const link = await screen.findByRole('link', { name: /^LAN mode on \(Wi-Fi\)/ });
    expect(link).toHaveAttribute('href', '/settings#lan');
    expect(link).toHaveAccessibleName(
      'LAN mode on (Wi-Fi): devices on this network can reach TTSNative and ask to pair',
    );
    current = status(false);
    await act(() => vi.advanceTimersByTimeAsync(15_500));
    await waitFor(() => expect(screen.queryByRole('link')).not.toBeInTheDocument());
    const asked = api.calls.filter((call) => call.path === '/api/lan').length;
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(api.calls.filter((call) => call.path === '/api/lan')).toHaveLength(asked); // off: no polling
  });

  it('says "your network" when the computer cannot name the network it is open on', async () => {
    mockApi({ 'GET /api/lan': { ...status(true), interface: null } });
    renderWithApp(<LanIndicator />);
    expect(
      await screen.findByRole('link', { name: /^LAN mode on \(your network\)/ }),
    ).toBeInTheDocument();
  });

  it('is only for this computer, never a phone or tablet', () => {
    expect(onThisComputer('localhost') && onThisComputer('127.0.0.1') && onThisComputer('[::1]')).toBe(true); // prettier-ignore
    expect(onThisComputer('192.168.1.20')).toBe(false);
  });
});
