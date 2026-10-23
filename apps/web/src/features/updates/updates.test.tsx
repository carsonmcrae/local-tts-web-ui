// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for updates, What's new and release history in the UI.
 * Scope: The desktop bridge (mocked Tauri invoke and channel): the launch notice, remind me later,
 *   installing with progress and failure, checking on request, automatic checks on or off, the update
 *   status in About, and the data and log folders; in a browser, how updates arrive; release history
 *   (offline notes, an available update first, one version at a time with Older and Newer, the
 *   installed and latest marks, no notes) and What's new once after an update.
 * Does NOT belong: Release-note parsing helpers (releaseHistory.test.ts).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseNotes } from '@/lib/releaseHistory';
import { AboutUpdates } from './AboutUpdates';
import { UpdateNotice } from './UpdateNotice';
import { UpdatesProvider, useUpdates } from './UpdatesProvider';
import { WhatsNew } from './WhatsNew';

const tauri = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauri.invoke,
  Channel: class {
    onmessage: (message: unknown) => void = () => undefined;
  },
}));

const NOTES =
  'A faster reader.\n\n## New\n\n- Bookmarks.\n- Notes.\n- Search.\n- Sleep timer.\n\n## Fixed\n\n- Exports.';
const UPDATE = { version: '2.1.0', date: '2026-11-02', notes: NOTES };
const INFO = {
  version: '2.0.0',
  channel: 'stable',
  updates: 'app',
  dataDir: 'C:/data',
  logDir: 'C:/logs',
  autoCheck: true,
  lastCheckedAt: null,
};
const HISTORY: ReleaseNotes[] = [
  {
    version: '2.0.0',
    date: '2026-10-19',
    publishedAs: 'Local TTS',
    summary: 'A complete rebuild.',
    sections: [{ key: 'new', title: 'New', items: ['A reader.'] }],
  },
  {
    version: '1.0.0',
    date: '2026-03-24',
    publishedAs: 'Local TTS',
    summary: 'The first version.',
    sections: [{ key: 'new', title: 'New', items: ['Text to speech.'] }],
  },
];

type Handler = (args: Record<string, unknown>) => unknown;

function desktopCommands(handlers: Record<string, Handler | unknown> = {}) {
  const all: Record<string, Handler | unknown> = {
    desktop_info: INFO,
    update_check: { status: 'available', update: UPDATE },
    ...handlers,
  };
  tauri.invoke.mockImplementation(async (command: string, args: Record<string, unknown> = {}) => {
    const handler = all[command];
    return typeof handler === 'function' ? (handler as Handler)(args) : handler;
  });
}

function renderDesktop(ui = <UpdateNotice />) {
  return {
    user: userEvent.setup(),
    ...render(
      <UpdatesProvider>
        {ui}
        <AboutUpdates version="2.0.0" />
      </UpdatesProvider>,
    ),
  };
}

beforeEach(() => {
  (window as { __TTSNATIVE_DESKTOP__?: boolean }).__TTSNATIVE_DESKTOP__ = true;
  vi.stubGlobal('__RELEASE_HISTORY__', HISTORY);
});

afterEach(() => {
  delete (window as { __TTSNATIVE_DESKTOP__?: boolean }).__TTSNATIVE_DESKTOP__;
  tauri.invoke.mockReset();
});

describe('in the desktop app', () => {
  it('announces an update with its first lines, and reminds later for that version', async () => {
    desktopCommands();
    const { user } = renderDesktop();
    const notice = await screen.findByRole('region', { name: 'Update available' });
    expect(within(notice).getByText('TTSNative 2.1.0 is available')).toBeInTheDocument();
    expect(
      within(notice)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Bookmarks.', 'Notes.', 'Search.']);
    expect(tauri.invoke).toHaveBeenCalledWith('update_check', { manual: false });
    await user.click(within(notice).getByRole('button', { name: 'Remind me later' }));
    expect(tauri.invoke).toHaveBeenCalledWith('update_snooze', { version: '2.1.0' });
    expect(screen.queryByRole('region', { name: 'Update available' })).not.toBeInTheDocument();
    expect(screen.getByText('TTSNative 2.1.0 is available.')).toBeInTheDocument();
  });

  it('installs only after confirmation, showing each step', async () => {
    let finish: () => void = () => undefined;
    desktopCommands({
      update_install: ({ onEvent }: Record<string, unknown>) => {
        const channel = onEvent as { onmessage: (event: unknown) => void };
        channel.onmessage({ event: 'downloading', downloaded: 50, total: 100 });
        return new Promise<void>((resolve) => {
          finish = () => {
            channel.onmessage({ event: 'downloading', downloaded: 60, total: null });
            resolve();
          };
        });
      },
    });
    const { user } = renderDesktop();
    await user.click(await screen.findByRole('button', { name: 'Update now' }));
    const dialog = await screen.findByRole('dialog', { name: 'TTSNative 2.1.0 is available' });
    expect(within(dialog).getByText('A faster reader.')).toBeInTheDocument();
    expect(tauri.invoke).not.toHaveBeenCalledWith('update_install', expect.anything());
    await user.click(within(dialog).getByRole('button', { name: 'Install and restart' }));
    expect(await within(dialog).findByText('Downloading the update… 50%')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(dialog).toBeInTheDocument();
    finish();
    expect(await within(dialog).findByText('Downloading the update…')).toBeInTheDocument();
  });

  it('shows verification and installation, and explains a failed update', async () => {
    desktopCommands({
      update_install: ({ onEvent }: Record<string, unknown>) => {
        const channel = onEvent as { onmessage: (event: unknown) => void };
        channel.onmessage({ event: 'verifying' });
        channel.onmessage({ event: 'installing' });
        return Promise.reject(new Error('The signature did not match.'));
      },
    });
    const { user } = renderDesktop();
    await user.click(await screen.findByRole('button', { name: 'View release notes' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Install and restart' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('The update wasn’t installed');
    expect(alert).toHaveTextContent('The signature did not match.');
    expect(within(alert).getByRole('link', { name: /ttsnative\.com/ })).toHaveAttribute(
      'href',
      'https://ttsnative.com/#download',
    );
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('checks on request, opens the update from About, and controls checks and folders', async () => {
    desktopCommands({
      update_check: { status: 'upToDate' },
      update_set_auto: undefined,
      open_folder: undefined,
    });
    const { user } = renderDesktop(<span />);
    expect(await screen.findByText('TTSNative is up to date.')).toBeInTheDocument();
    tauri.invoke.mockImplementation(async (command: string) =>
      command === 'update_check'
        ? { status: 'available', update: { ...UPDATE, notes: null } }
        : INFO,
    );
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(tauri.invoke).toHaveBeenCalledWith('update_check', { manual: true });
    await user.click(await screen.findByRole('button', { name: 'Update to 2.1.0' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('This version has no release notes yet.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Not now' }));
    desktopCommands({ update_set_auto: undefined, open_folder: undefined });
    await user.click(screen.getByRole('checkbox', { name: /Check for updates automatically/ }));
    expect(tauri.invoke).toHaveBeenCalledWith('update_set_auto', { enabled: false });
    expect(
      screen.getByRole('checkbox', { name: /Check for updates automatically/ }),
    ).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Open data folder' }));
    await user.click(screen.getByRole('button', { name: 'Open log folder' }));
    await user.click(screen.getByRole('button', { name: 'Third-party notices' }));
    expect(tauri.invoke).toHaveBeenCalledWith('open_folder', { which: 'data' });
    expect(tauri.invoke).toHaveBeenCalledWith('open_folder', { which: 'logs' });
    expect(tauri.invoke).toHaveBeenCalledWith('open_folder', { which: 'notices' });
  });

  it.each([
    [{ status: 'failed', message: 'No connection.' }, INFO, 'No connection.'],
    [{ status: 'noRelease' }, INFO, 'No update is available right now.'],
    [{ status: 'notDue' }, { ...INFO, lastCheckedAt: 1_790_000_000 }, 'No newer version was found'],
    [{ status: 'disabled' }, { ...INFO, autoCheck: false }, 'Automatic update checks are off.'],
    [{ status: 'notDue' }, INFO, 'Not checked yet.'],
    [{ status: 'snoozed', update: UPDATE }, INFO, 'TTSNative 2.1.0 is available.'],
  ])('describes the update status %#', async (result, info, text) => {
    desktopCommands({ update_check: result, desktop_info: info });
    renderDesktop();
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Update available' })).not.toBeInTheDocument();
  });

  it('reports a check that throws, and keeps working when the app info is unavailable', async () => {
    tauri.invoke.mockImplementation(async (command: string) => {
      if (command === 'update_check') throw 'offline';
      throw new Error('no info');
    });
    const { user } = renderDesktop();
    expect(await screen.findByText('offline')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /automatically/ })).toBeChecked();
    tauri.invoke.mockResolvedValue(undefined);
    await user.click(screen.getByRole('checkbox', { name: /automatically/ }));
    expect(tauri.invoke).toHaveBeenCalledWith('update_set_auto', { enabled: false });
  });

  it('hides the notice even if the reminder could not be saved, and closes an idle dialog', async () => {
    desktopCommands({
      update_check: { status: 'available', update: { ...UPDATE, notes: null } },
      update_snooze: () => Promise.reject(new Error('disk full')),
    });
    const { user } = renderDesktop();
    const notice = await screen.findByRole('region', { name: 'Update available' });
    expect(within(notice).queryByRole('list')).not.toBeInTheDocument();
    await user.click(within(notice).getByRole('button', { name: 'View release notes' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(within(notice).getByRole('button', { name: 'Remind me later' }));
    expect(screen.queryByRole('region', { name: 'Update available' })).not.toBeInTheDocument();
  });

  it('shows an available update without a date or summary in the history', async () => {
    desktopCommands({
      update_check: {
        status: 'available',
        update: { version: '2.2.0', date: null, notes: '## Fixed\n\n- A fix.' },
      },
    });
    const { user } = renderDesktop(<span />);
    await screen.findByText('TTSNative 2.2.0 is available.');
    await user.click(screen.getByRole('button', { name: 'Release history' }));
    const latest = within(await screen.findByRole('dialog')).getByRole('article', {
      name: 'TTSNative 2.2.0',
    });
    expect(within(latest).getByText('A fix.')).toBeInTheDocument();
    expect(within(latest).queryByText(/2026/)).not.toBeInTheDocument();
  });

  it('checks again every six hours while open', async () => {
    const timers: (() => void)[] = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((callback: () => void) => {
      timers.push(callback);
      return 1;
    }) as typeof window.setInterval);
    desktopCommands({ update_check: { status: 'upToDate' } });
    const { unmount } = renderDesktop();
    await screen.findByText('TTSNative is up to date.');
    timers[0]?.();
    await waitFor(() =>
      expect(tauri.invoke.mock.calls.filter(([c]) => c === 'update_check')).toHaveLength(2),
    );
    unmount();
  });
});

describe('in a browser', () => {
  beforeEach(() => {
    delete (window as { __TTSNATIVE_DESKTOP__?: boolean }).__TTSNATIVE_DESKTOP__;
  });

  it('explains how updates arrive and offers the release history offline', async () => {
    const user = userEvent.setup();
    render(<AboutUpdates version="2.0.0" />);
    expect(screen.getByText('Stable release')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub Releases' })).toHaveAttribute(
      'href',
      'https://github.com/carsonmcrae/ttsnative/releases',
    );
    expect(tauri.invoke).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'What’s new in 2.0.0' }));
    const dialog = await screen.findByRole('dialog', { name: 'Release history' });
    expect(within(dialog).getByRole('heading', { name: 'Local TTS 2.0.0' })).toBeInTheDocument();
    expect(within(dialog).getByText('October 19, 2026')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '2.0.0 Installed' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(dialog).getByRole('link', { name: /Release page on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/carsonmcrae/ttsnative/releases/tag/v2.0.0',
    );
    expect(within(dialog).getByText('This is the latest')).toBeInTheDocument();
    // Step back to the oldest release and forward again.
    await user.click(within(dialog).getByRole('button', { name: 'Older: 1.0.0' }));
    expect(within(dialog).getByRole('heading', { name: 'Local TTS 1.0.0' })).toBeInTheDocument();
    expect(within(dialog).getByText('No older releases')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Installed')).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Newer: 2.0.0' }));
    expect(within(dialog).getByRole('heading', { name: 'Local TTS 2.0.0' })).toBeInTheDocument();
    expect(within(dialog).getAllByText('Installed')).toHaveLength(2);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks development builds and copes with an app built without notes', async () => {
    vi.stubGlobal('__RELEASE_HISTORY__', undefined);
    const user = userEvent.setup();
    render(<AboutUpdates version="2.1.0-dev.4+feat.abc" />);
    expect(screen.getByText('Development build')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /What’s new/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Release history' }));
    expect(await screen.findByText(/built without release notes/)).toBeInTheDocument();
  });

  it('marks the newest notes as the latest in a development build', async () => {
    const user = userEvent.setup();
    render(<AboutUpdates version="2.1.0-dev.4+feat.abc" />);
    expect(screen.queryByRole('button', { name: /What’s new/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Release history' }));
    const dialog = await screen.findByRole('dialog', { name: 'Release history' });
    expect(within(dialog).getByRole('heading', { name: 'Local TTS 2.0.0' })).toBeInTheDocument();
    expect(within(dialog).getAllByText('Latest')).toHaveLength(2);
    expect(within(dialog).queryByText('Installed')).not.toBeInTheDocument();
  });

  it('does nothing when asked to update outside the desktop app', async () => {
    function Probe() {
      const updates = useUpdates();
      return (
        <button
          type="button"
          onClick={() =>
            void Promise.all([
              updates.checkNow(),
              updates.remindLater('2.1.0'),
              updates.installNow(),
              updates.setAutoCheck(false),
            ])
          }
        >
          probe
        </button>
      );
    }
    render(<Probe />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'probe' }));
    expect(tauri.invoke).not.toHaveBeenCalled();
  });
});

describe('release history with an available update', () => {
  const chips = (versions: HTMLElement) =>
    within(versions)
      .getAllByRole('button')
      .map((chip) => chip.getAttribute('aria-label'));

  it('lists the newer version first and steps through every version', async () => {
    desktopCommands();
    const { user } = renderDesktop(<span />);
    await screen.findByText('TTSNative 2.1.0 is available.');
    await user.click(screen.getByRole('button', { name: 'Release history' }));
    const dialog = await screen.findByRole('dialog', { name: 'Release history' });
    const versions = within(dialog).getByRole('navigation', { name: 'Versions' });
    expect(chips(versions)).toEqual(['2.1.0 Available update', '2.0.0 Installed', '1.0.0']);
    expect(within(dialog).getByRole('article', { name: 'TTSNative 2.1.0' })).toBeInTheDocument();
    expect(within(dialog).getAllByText('Available update')).toHaveLength(2);
    expect(within(dialog).getByText('This is the latest')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Older: 2.0.0' }));
    expect(within(dialog).getByRole('article', { name: 'Local TTS 2.0.0' })).toBeInTheDocument();
    expect(within(dialog).getAllByText('Installed')).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'Older: 1.0.0' }));
    expect(within(dialog).getByRole('article', { name: 'Local TTS 1.0.0' })).toBeInTheDocument();
    expect(within(dialog).getByText('No older releases')).toBeInTheDocument();
    expect(within(versions).getByRole('button', { name: '1.0.0' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Newer: 2.0.0' }));
    await user.click(within(versions).getByRole('button', { name: '2.1.0 Available update' }));
    expect(within(dialog).getByRole('article', { name: 'TTSNative 2.1.0' })).toBeInTheDocument();
  });

  it('does not list an update twice when its notes are already built in', async () => {
    desktopCommands({
      update_check: { status: 'available', update: { ...UPDATE, version: '2.0.0' } },
    });
    const { user } = renderDesktop(<span />);
    await screen.findByText('TTSNative 2.0.0 is available.');
    await user.click(screen.getByRole('button', { name: 'Release history' }));
    const dialog = await screen.findByRole('dialog', { name: 'Release history' });
    const versions = within(dialog).getByRole('navigation', { name: 'Versions' });
    expect(chips(versions)).toEqual(['2.0.0 Available update', '1.0.0']);
  });
});

describe("What's new", () => {
  it('opens once after an update to a version with notes', async () => {
    localStorage.setItem('ttsnative.lastSeenVersion', '1.0.0');
    const user = userEvent.setup();
    const { unmount } = render(<WhatsNew version="2.0.0" />);
    const dialog = await screen.findByRole('dialog', { name: 'What’s new in TTSNative 2.0.0' });
    expect(within(dialog).getByText('A complete rebuild.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
    render(<WhatsNew version="2.0.0" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('ttsnative.lastSeenVersion')).toBe('2.0.0');
  });

  it('stays quiet after an update to a version without notes', () => {
    localStorage.setItem('ttsnative.lastSeenVersion', '2.0.0');
    render(<WhatsNew version="2.5.0-dev.1+x.y" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('ttsnative.lastSeenVersion')).toBe('2.5.0');
  });

  it('stays quiet on first start, when dismissed, and when storage is unavailable', async () => {
    const { unmount } = render(<WhatsNew version="2.0.0" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('ttsnative.lastSeenVersion')).toBe('2.0.0');
    unmount();
    localStorage.setItem('ttsnative.lastSeenVersion', '1.0.0');
    const second = render(<WhatsNew version="2.0.0" />);
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    second.unmount();
    const blocked = () => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    };
    for (const method of ['getItem', 'setItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(blocked);
    }
    render(<WhatsNew version="3.0.0" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
