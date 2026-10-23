// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for a Microsoft Store copy of the desktop app and for deleting the user's data.
 * Scope: About in a Store copy (the Store keeps it up to date: no check button, no automatic-check
 *   switch, no update notice) and Delete my data (the button stays off until the tick, a failure is
 *   shown and the request can be retried, the dialog starts afresh after Cancel, and the warning about
 *   uninstalling differs between a Store copy and the direct install).
 * Does NOT belong: Updates from GitHub (updates.test.tsx).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutUpdates } from './AboutUpdates';
import { UpdateNotice } from './UpdateNotice';
import { UpdatesProvider } from './UpdatesProvider';

const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke, Channel: class {} }));

const STORE = { updates: 'store', check: { status: 'store' } } as const;
const DIRECT = { updates: 'app', check: { status: 'upToDate' } } as const;

/** The app answers as a Store copy or a direct install; `erase` answers delete_user_data. */
function app(copy: typeof STORE | typeof DIRECT, erase: () => Promise<void> = async () => {}) {
  bridge.invoke.mockImplementation(async (command: string) => {
    switch (command) {
      case 'desktop_info':
        return {
          version: '2.2.0',
          channel: 'stable',
          updates: copy.updates,
          dataDir: 'D:/data',
          logDir: 'D:/logs',
          autoCheck: true,
          lastCheckedAt: null,
        };
      case 'update_check':
        return copy.check;
      case 'delete_user_data':
        return erase();
      default:
        return undefined;
    }
  });
  const user = userEvent.setup();
  render(
    <UpdatesProvider>
      <UpdateNotice />
      <AboutUpdates version="2.2.0" />
    </UpdatesProvider>,
  );
  return user;
}

async function openDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Delete my data…' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete all your TTSNative data?' });
  return {
    dialog,
    tick: within(dialog).getByRole('checkbox', { name: /can’t be undone/ }),
    confirm: within(dialog).getByRole('button', { name: 'Delete and close TTSNative' }),
  };
}

beforeEach(() => {
  (window as { __TTSNATIVE_DESKTOP__?: boolean }).__TTSNATIVE_DESKTOP__ = true;
  vi.stubGlobal('__RELEASE_HISTORY__', []);
});

afterEach(() => {
  delete (window as { __TTSNATIVE_DESKTOP__?: boolean }).__TTSNATIVE_DESKTOP__;
  bridge.invoke.mockReset();
  vi.unstubAllGlobals();
});

describe('a Microsoft Store copy', () => {
  it('leaves updates to the Store', async () => {
    app(STORE);
    expect(
      await screen.findByText('The Microsoft Store keeps TTSNative up to date.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /automatically/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Update available' })).not.toBeInTheDocument();
  });
});

describe('Delete my data', () => {
  it('waits for the tick, shows a failure and lets the request be retried', async () => {
    let attempts = 0;
    const user = app(DIRECT, () => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('Access is denied.'))
        : new Promise(() => {});
    });
    await screen.findByText('TTSNative is up to date.');
    const { dialog, tick, confirm } = await openDelete(user);
    expect(within(dialog).getByText(/keeps this data unless you choose/)).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    await user.click(tick);
    await user.click(confirm);
    expect(await within(dialog).findByText('Access is denied.')).toBeInTheDocument();
    expect(bridge.invoke).toHaveBeenCalledWith('delete_user_data');
    await user.click(confirm);
    await waitFor(() => expect(attempts).toBe(2));
    expect(within(dialog).queryByText('Access is denied.')).not.toBeInTheDocument();
  });

  it('starts afresh after Cancel, and warns a Store copy about uninstalling', async () => {
    const user = app(STORE, () => Promise.reject('locked'));
    await screen.findByText('The Microsoft Store keeps TTSNative up to date.');
    const first = await openDelete(user);
    expect(
      within(first.dialog).getByText(/Uninstalling TTSNative from Windows keeps/),
    ).toBeInTheDocument();
    await user.click(first.tick);
    await user.click(first.confirm);
    expect(await within(first.dialog).findByText('locked')).toBeInTheDocument();
    await user.click(within(first.dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const again = await openDelete(user);
    expect(again.tick).not.toBeChecked();
    expect(within(again.dialog).queryByText('locked')).not.toBeInTheDocument();
  });
});
