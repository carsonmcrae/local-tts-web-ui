// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the app shell's sign that the local speech API is in use.
 * Scope: Shown (a labelled link in the sidebar, a labelled dot on the phone's Settings tab) while
 *   another program uses the API, hidden otherwise, and opening the speech API settings from it.
 * Does NOT belong: The settings section (features/settings/speechApi.test.tsx).
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kokoro, mockApi, preferences, voice } from '@/test/render';
import { App } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

function start(active: boolean) {
  mockApi({
    'GET /api/engines': [kokoro()],
    'GET /api/preferences': preferences,
    'GET /api/voices': [voice()],
    'GET /api/documents': [],
    'GET /api/pronunciations': [],
    'GET /api/speech-api/activity': { enabled: true, active },
    'GET /api/speech-api': { enabled: true, allowNetwork: false, allowedVoices: [], hasToken: true, tokenCreatedAt: null, networkMode: false, port: 8765, maxInputChars: 4000, requestsPerMinute: 60, usage: { requests: 1, lastUsedAt: null, lastVoiceId: null, inProgress: active, active } }, // prettier-ignore
  });
  window.history.pushState({}, '', '/library');
  render(<App />);
}

describe('Speech API in-use sign', () => {
  it('shows while another program uses the API and links to its settings', async () => {
    start(true);
    const sign = await screen.findByRole('link', { name: 'Speech API in use' });
    expect(sign).toHaveAttribute('href', '/settings#speech-api');
    const tabs = screen.getAllByRole('navigation', { name: 'Main' }).at(-1) as HTMLElement;
    expect(within(tabs).getByRole('link', { name: 'Settings, speech API in use' })).toBeInTheDocument(); // prettier-ignore
    await userEvent.setup().click(sign);
    const toggle = await screen.findByRole('button', { name: /Speech API settings/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('stays hidden while nothing uses it', async () => {
    start(false);
    expect(await screen.findByText('Voices ready')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Speech API in use' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Settings' })).toHaveLength(2);
  });
});
