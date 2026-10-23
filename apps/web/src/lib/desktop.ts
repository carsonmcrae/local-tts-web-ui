// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The bridge to the Windows desktop app, when the UI runs inside it.
 * Scope: Detecting the desktop window (the app marks it before any page script runs) and typed calls
 *   to the commands it allows this page: version and folders, update checks (automatic or on request),
 *   remind me later, automatic checks on or off, installing an update with progress events, and
 *   deleting the user's data (the app closes to do it).
 * Does NOT belong: Update UI or timing (features/updates) or anything that works in a browser.
 */
import { Channel, invoke } from '@tauri-apps/api/core';

export interface DesktopInfo {
  version: string;
  channel: 'stable' | 'development';
  /** Who updates this copy: its own updater (`app`) or the Microsoft Store (`store`). */
  updates: 'app' | 'store';
  dataDir: string;
  logDir: string;
  autoCheck: boolean;
  /** Seconds since the Unix epoch. */
  lastCheckedAt: number | null;
}

export interface FoundUpdate {
  version: string;
  date: string | null;
  /** The release's user-facing notes as Markdown. */
  notes: string | null;
}

export type CheckResult =
  | { status: 'available' | 'snoozed'; update: FoundUpdate }
  | { status: 'upToDate' | 'noRelease' | 'disabled' | 'notDue' | 'store' }
  | { status: 'failed'; message: string };

export type InstallEvent =
  | { event: 'downloading'; downloaded: number; total: number | null }
  | { event: 'verifying' }
  | { event: 'installing' };

export function isDesktop(): boolean {
  return (globalThis as { __TTSNATIVE_DESKTOP__?: boolean }).__TTSNATIVE_DESKTOP__ === true;
}

export const desktop = {
  info: () => invoke<DesktopInfo>('desktop_info'),
  check: (manual: boolean) => invoke<CheckResult>('update_check', { manual }),
  snooze: (version: string) => invoke<void>('update_snooze', { version }),
  setAutoCheck: (enabled: boolean) => invoke<void>('update_set_auto', { enabled }),
  openFolder: (which: 'data' | 'logs' | 'notices') => invoke<void>('open_folder', { which }),
  /** Stops the server and closes the app; the user's folders are deleted once it has closed. */
  deleteUserData: () => invoke<void>('delete_user_data'),
  /** Downloads, verifies and starts the installer; on success the app closes and reopens itself. */
  install: (onEvent: (event: InstallEvent) => void) => {
    const channel = new Channel<InstallEvent>();
    channel.onmessage = onEvent;
    return invoke<void>('update_install', { onEvent: channel });
  },
};
