// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the optional Audiobookshelf connection in Settings.
 * Scope: Testing the connection (which saves the address and key first), choosing a library and a
 *   folder (none, for a library without one), saving without ever showing the key, keeping a saved
 *   key when the field is left empty, checking the address and key before sending them, a failed
 *   test, a key that sees no libraries, a refused save, and forgetting everything after a
 *   confirmation. Also that the section is in the settings index.
 * Does NOT belong: Sending an export (features/exports/exports.test.tsx).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShelfLibrary, ShelfSettings, ShelfSettingsInput } from '@/api/types';
import { json, kokoro, mockApi, preferences, renderWithApp, voice } from '@/test/render';
import { AudiobookshelfSection } from './AudiobookshelfSection';
import SettingsPage from './SettingsPage';

afterEach(() => vi.unstubAllGlobals());

const KEY = 'secret-key-0123456789';
const libraries: ShelfLibrary[] = [
  { id: 'books', name: 'Audiobooks', folders: [{ id: 'f1', path: '/audiobooks' }] },
  { id: 'talks', name: 'Talks', folders: [{ id: 'f2', path: '/talks' }, { id: 'f3', path: '/talks/new' }] }, // prettier-ignore
  { id: 'empty', name: 'Empty shelf', folders: [] },
];

function setup(
  initial: ShelfSettings = { configured: false, hasKey: false },
  test: unknown = libraries,
  overrides: Record<string, unknown> = {},
) {
  let settings = initial;
  const api = mockApi({
    'GET /api/integrations/audiobookshelf': () => settings,
    'PUT /api/integrations/audiobookshelf': (_url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as ShelfSettingsInput;
      settings = { configured: true, url: body.url, libraryId: body.libraryId ?? null, folderId: body.folderId ?? null, hasKey: settings.hasKey || Boolean(body.apiKey) }; // prettier-ignore
      return settings;
    },
    'POST /api/integrations/audiobookshelf/test': () => test,
    'DELETE /api/integrations/audiobookshelf': () => {
      settings = { configured: false, hasKey: false };
      return new Response(null, { status: 204 });
    },
    ...overrides,
  });
  renderWithApp(<AudiobookshelfSection />);
  const saves = () =>
    api.calls
      .filter((call) => call.method === 'PUT')
      .map((call) => JSON.parse(String(call.body)) as ShelfSettingsInput);
  const tests = () =>
    api.calls
      .filter((call) => call.method === 'POST' && call.path.endsWith('/test'))
      .map((call) => JSON.parse(String(call.body)) as ShelfSettingsInput);
  return { ...api, saves, tests, user: userEvent.setup() };
}

describe('Audiobookshelf settings', () => {
  it('tests the connection, picks a library and folder and saves, never showing the key', async () => {
    const { saves, tests, user } = setup();
    const section = await screen.findByRole('region', { name: 'Audiobookshelf' });
    const key = await within(section).findByLabelText('API key');
    expect(key).toHaveAttribute('type', 'password');
    expect(within(section).queryByRole('button', { name: 'Forget' })).not.toBeInTheDocument();
    await user.type(within(section).getByLabelText('Server address'), 'http://192.168.1.20:13378');
    await user.type(key, KEY);
    await user.click(within(section).getByRole('button', { name: 'Test connection' }));
    expect(await within(section).findByText('Connected. Choose where new audiobooks go.')).toBeInTheDocument(); // prettier-ignore
    expect(saves()).toEqual([]); // a test saves nothing
    expect(tests()).toEqual([{ url: 'http://192.168.1.20:13378', apiKey: KEY, libraryId: null, folderId: null }]); // prettier-ignore
    expect(within(section).getByLabelText('Library')).toHaveValue('books');
    expect(within(section).getByLabelText('Folder')).toHaveValue('f1');
    await user.selectOptions(within(section).getByLabelText('Library'), 'talks');
    expect(within(section).getByLabelText('Folder')).toHaveValue('f2');
    await user.selectOptions(within(section).getByLabelText('Library'), 'empty');
    expect(within(section).getByLabelText('Folder')).toBeEmptyDOMElement(); // nothing to choose
    await user.selectOptions(within(section).getByLabelText('Library'), 'talks');
    await user.selectOptions(within(section).getByLabelText('Folder'), '/talks/new');
    await user.click(within(section).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Audiobookshelf saved')).toBeInTheDocument();
    expect(saves()).toEqual([{ url: 'http://192.168.1.20:13378', apiKey: KEY, libraryId: 'talks', folderId: 'f3' }]); // prettier-ignore
    expect(key).toHaveValue('');
    expect(within(section).getByText('Saved, leave empty to keep it.')).toBeInTheDocument();
    expect(within(section).getByText('Set up')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(KEY);
    expect(section).toHaveTextContent('Uploads go only to this server');
    expect(section).toHaveTextContent('The API key is stored on this computer');
  });

  it('keeps a saved key, checks the address first and explains a failed test', async () => {
    const saved: ShelfSettings = { configured: true, url: 'http://shelf.local', libraryId: 'books', folderId: 'f1', hasKey: true }; // prettier-ignore
    const refused = json({ error: { code: 'audiobookshelf_error', message: 'Audiobookshelf refused the API key.' } }, 502); // prettier-ignore
    const { saves, tests, user } = setup(saved, refused);
    const section = await screen.findByRole('region', { name: 'Audiobookshelf' });
    expect(await within(section).findByLabelText('Server address')).toHaveValue(
      'http://shelf.local',
    );
    expect(within(section).getByLabelText('API key')).toHaveValue('');
    expect(within(section).getByText('Saved, leave empty to keep it.')).toBeInTheDocument();
    expect(within(section).getByText(/A library and folder are saved/)).toBeInTheDocument();
    const address = within(section).getByLabelText('Server address');
    await user.clear(address);
    await user.type(address, 'shelf.local');
    await user.click(within(section).getByRole('button', { name: 'Save' }));
    expect(within(section).getByRole('alert')).toHaveTextContent(
      'starting with http:// or https://',
    );
    expect(saves()).toEqual([]);
    await user.clear(address);
    await user.type(address, 'https://shelf.local');
    await user.click(within(section).getByRole('button', { name: 'Test connection' }));
    expect(await within(section).findByRole('alert')).toHaveTextContent('Audiobookshelf refused the API key.'); // prettier-ignore
    expect(tests()).toEqual([{ url: 'https://shelf.local', libraryId: 'books', folderId: 'f1' }]);
    expect(saves()).toEqual([]);
    expect(within(section).queryByLabelText('Library')).not.toBeInTheDocument();
  });

  it('asks for a key, rejects a short one, warns of a key without libraries and explains a refused save', async () => {
    const { calls, user } = setup({ configured: false, hasKey: false }, [], {
      'PUT /api/integrations/audiobookshelf': () =>
        json({ error: { code: 'refused', message: 'The settings are locked.' } }, 423),
    });
    const section = await screen.findByRole('region', { name: 'Audiobookshelf' });
    await user.type(await within(section).findByLabelText('Server address'), 'http://shelf.local');
    const test = within(section).getByRole('button', { name: 'Test connection' });
    await user.click(test);
    expect(within(section).getByRole('alert')).toHaveTextContent('Enter the API key.');
    await user.type(within(section).getByLabelText('API key'), 'short');
    await user.click(test);
    expect(within(section).getByRole('alert')).toHaveTextContent('That API key looks too short.');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    await user.type(within(section).getByLabelText('API key'), '-but-long-enough');
    await user.click(test);
    expect(await within(section).findByText('Connected, but no libraries')).toBeInTheDocument();
    expect(within(section).queryByLabelText('Library')).not.toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Save' }));
    expect(await within(section).findByRole('alert')).toHaveTextContent('The settings are locked.');
  }); // prettier-ignore

  it('forgets the address and key after a confirmation', async () => {
    const { calls, user } = setup({ configured: true, url: 'http://shelf.local', hasKey: true });
    const section = await screen.findByRole('region', { name: 'Audiobookshelf' });
    await user.click(await within(section).findByRole('button', { name: 'Forget' }));
    const confirm = await screen.findByRole('dialog', { name: 'Forget Audiobookshelf?' });
    await user.click(within(confirm).getByRole('button', { name: 'Forget' }));
    expect(await screen.findByText('Audiobookshelf forgotten')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
    expect(within(section).getByLabelText('Server address')).toHaveValue('');
    await waitFor(() => expect(within(section).queryByRole('button', { name: 'Forget' })).not.toBeInTheDocument()); // prettier-ignore
  });

  it('is listed in the settings index', async () => {
    mockApi({
      'GET /api/engines': [kokoro()],
      'GET /api/preferences': preferences,
      'GET /api/voices': [voice()],
      'GET /api/pronunciations': [],
      'GET /api/integrations/audiobookshelf': { configured: false, hasKey: false },
    });
    renderWithApp(<SettingsPage />);
    const index = await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(within(index).getByRole('link', { name: 'Audiobookshelf' })).toHaveAttribute('href', '#audiobookshelf'); // prettier-ignore
    expect(await screen.findByRole('region', { name: 'Audiobookshelf' })).toBeInTheDocument();
  });
});
