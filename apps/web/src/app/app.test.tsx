// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the application root: lazy routes and the shell's engine status.
 * Scope: Opening a document by URL through the real router (lazy page with a loading state), moving
 *   between the main sections with the navigation, and the sidebar status while the default voices
 *   are installing.
 * Does NOT belong: Page behaviour (feature tests) or the not-found/offline cases (flows.test.tsx).
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  documentDetail,
  json,
  kokoro,
  mockApi,
  preferences,
  readerRoutes,
  voice,
} from '@/test/render';
import { App } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

describe('App', () => {
  it('opens a document from its URL and reports voices that are still installing', async () => {
    const doc = documentDetail();
    mockApi({
      'GET /api/engines': [kokoro({ status: 'installing' })],
      'GET /api/preferences': preferences,
      'GET /api/voices': [voice()],
      'PUT /api/documents/': {},
      ...readerRoutes(doc),
    });
    window.history.pushState({}, '', `/read/${doc.id}`);
    render(<App />);
    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'The Lighthouse' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Installing voices…')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Studio' })).toHaveLength(1);
  });

  it('moves between the main sections from the navigation', async () => {
    mockApi({
      'GET /api/engines': [kokoro()],
      'GET /api/preferences': preferences,
      'GET /api/voices': [voice()],
      'GET /api/voice-profiles': [],
      'GET /api/system': () => json({ error: { code: 'starting', message: 'Starting.' } }, 503),
      'GET /api/documents': [],
    });
    window.history.pushState({}, '', '/');
    const user = userEvent.setup();
    render(<App />);
    const [nav] = await screen.findAllByRole('navigation', { name: 'Main' });
    const go = async (link: string, heading: string) => {
      await user.click(within(nav as HTMLElement).getByRole('link', { name: link }));
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    };
    await go('Voices', 'Voices');
    await go('Voice Studio', 'Voice Studio');
    await go('Settings', 'Settings');
    await go('Library', 'Library');
  });
});
