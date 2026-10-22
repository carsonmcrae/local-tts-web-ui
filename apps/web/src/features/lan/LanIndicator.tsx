// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: A standing sign in the sidebar, on this computer, while LAN mode lets other devices in.
 * Scope: Shown only on this computer's own address (localhost) and only while LAN mode is on: the
 *   network it is open on, as a link to its settings. It checks every 15 s while on, so it goes
 *   away when LAN mode turns itself off. Phones and tablets never ask (the status is refused there).
 *   It is not a live region, so it never interrupts.
 * Does NOT belong: The settings themselves (features/settings/LanSection) or the server's checks.
 */
import { NavLink } from 'react-router';
import { useLanWhileOn } from '@/api/lanQueries';

const THIS_COMPUTER = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Whether this page was opened on this computer itself rather than over the network. */
export function onThisComputer(hostname: string = globalThis.location.hostname): boolean {
  return THIS_COMPUTER.has(hostname);
}

export function LanIndicator() {
  const status = useLanWhileOn(onThisComputer());
  if (!status.data?.enabled) return null;
  const where = status.data.interface ?? 'your network';
  return (
    <NavLink
      to="/settings#lan"
      className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-xs text-muted hover:bg-surface-2"
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warning" />
      <span className="min-w-0">
        LAN mode on ({where})
        <span className="sr-only">
          : devices on this network can reach TTSNative and ask to pair
        </span>
      </span>
    </NavLink>
  );
}
