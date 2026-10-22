// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for how the whole app treats a phone or tablet in LAN mode.
 * Scope: An unpaired device is sent to /pair once (however many requests were refused), the entry
 *   it came from is replaced (no loop on Back), and after pairing it returns there with fresh data;
 *   an action refused on the network shows the server's own message.
 * Does NOT belong: The pairing page's own behaviour (features/lan/pair.test.tsx).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, describeError } from '@/api/client';
import { json, kokoro, mockApi, preferences } from '@/test/render';
import { App } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const UNPAIRED = { code: 'device_not_paired', message: 'Pair this device first: open the pairing link shown on the computer.' }; // prettier-ignore

describe('A phone or tablet in LAN mode', () => {
  it('is sent to pairing once, then back where it was', async () => {
    let paired = false;
    const guarded = (body: unknown) => () => (paired ? json(body) : json({ error: UNPAIRED }, 401));
    const { calls } = mockApi({
      'GET /api/engines': guarded([kokoro()]),
      'GET /api/preferences': guarded(preferences),
      'GET /api/speech-api/activity': guarded({ active: false }),
      'GET /api/lan/device': () => ({ paired, name: paired ? 'iPhone' : null }),
      'POST /api/lan/pair': () => {
        paired = true;
        return json({ id: 'd'.repeat(32), name: 'iPhone', createdAt: '2026-10-21T09:00:00+00:00', lastSeenAt: null }, 201); // prettier-ignore
      },
    });
    window.history.pushState({}, '', '/missing/page?from=test');
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Pair this device' })).toBeInTheDocument(); // prettier-ignore
    expect(window.location.pathname).toBe('/pair');
    const state = window.history.state as { usr?: { from?: string } };
    expect(state.usr?.from).toBe('/missing/page?from=test');
    await waitFor(() => expect(calls.filter((call) => call.path === '/api/lan/device')).toHaveLength(1)); // prettier-ignore

    await user.type(screen.getByLabelText('Pairing code'), 'ABCDEFGH');
    await user.click(screen.getByRole('button', { name: 'Pair this device' }));
    expect(await screen.findByText("This page doesn't exist")).toBeInTheDocument();
    expect(window.location.pathname).toBe('/missing/page');
    expect(window.location.search).toBe('?from=test');
    expect(await screen.findByText('Voices ready')).toBeInTheDocument(); // fetched again, now paired
  });

  it('stays put when a request is refused on the pairing page itself', async () => {
    mockApi({
      'GET /api/lan/device': { paired: false, name: null },
      'GET /api/documents': json({ error: UNPAIRED }, 401),
    });
    window.history.pushState({}, '', '/pair');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Pair this device' })).toBeInTheDocument(); // prettier-ignore
    await expect(api('/api/documents')).rejects.toMatchObject({ code: 'device_not_paired' });
    expect(window.location.pathname).toBe('/pair');
    expect((window.history.state as { usr?: unknown }).usr).toBeUndefined();
  });

  it('shows the server’s message when an action must be done on the computer', async () => {
    mockApi({
      'DELETE /api/documents/': json({ error: { code: 'not_allowed_remotely', message: 'Do this on the computer running TTSNative.' } }, 403), // prettier-ignore
    });
    const refused = await api(`/api/documents/${'a'.repeat(32)}`, { method: 'DELETE' }).catch(
      (error: unknown) => error,
    );
    expect(describeError(refused)).toBe('Do this on the computer running TTSNative.');
    expect(window.location.pathname).toBe('/'); // not a pairing problem: nowhere to go
  });
});
