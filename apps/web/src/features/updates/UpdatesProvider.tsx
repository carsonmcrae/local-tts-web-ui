// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: One shared view of TTSNative updates for the whole UI.
 * Scope: In the desktop app: its version and settings, an automatic check when the UI opens and every
 *   six hours (the app itself limits real checks to one per 12 hours and remembers what it found),
 *   checking on request, remind me later, turning automatic checks on or off, and installing with
 *   download / verify / install progress and plain failure messages. In a browser it reports that
 *   updates come from the source code instead.
 * Does NOT belong: How updates are shown (UpdateNotice, UpdateDialog, AboutUpdates) or the commands
 *   themselves (lib/desktop.ts).
 */
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CheckResult, DesktopInfo, FoundUpdate } from '@/lib/desktop';
import { desktop, isDesktop } from '@/lib/desktop';

const RECHECK_MS = 6 * 60 * 60 * 1000;

export type InstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; percent: number | null }
  | { phase: 'verifying' }
  | { phase: 'installing' }
  | { phase: 'failed'; message: string };

export interface Updates {
  desktop: boolean;
  info: DesktopInfo | null;
  result: CheckResult | null;
  /** A newer version found by the last check (also while reminded later). */
  available: FoundUpdate | null;
  checking: boolean;
  install: InstallState;
  /** The notice is hidden for this session (after Remind me later). */
  dismissed: boolean;
  checkNow: () => Promise<void>;
  /** Hide the notice and don't announce this version again for three days. */
  remindLater: (version: string) => Promise<void>;
  installNow: () => Promise<void>;
  setAutoCheck: (enabled: boolean) => Promise<void>;
}

const nothing = async () => undefined;

/** Outside the desktop app (a browser, or a screen rendered on its own) there is nothing to update. */
const BROWSER_UPDATES: Updates = {
  desktop: false,
  info: null,
  result: null,
  available: null,
  checking: false,
  install: { phase: 'idle' },
  dismissed: true,
  checkNow: nothing,
  remindLater: nothing,
  installNow: nothing,
  setAutoCheck: nothing,
};

const UpdatesContext = createContext<Updates>(BROWSER_UPDATES);

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function UpdatesProvider({ children }: Readonly<{ children: ReactNode }>) {
  const inDesktop = isDesktop();
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [install, setInstall] = useState<InstallState>({ phase: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async (manual: boolean) => {
    setChecking(true);
    try {
      const found = await desktop.check(manual);
      setResult(found);
      if (manual) setDismissed(false);
    } catch (error) {
      setResult({ status: 'failed', message: message(error) });
    } finally {
      setChecking(false);
      setInfo(await desktop.info().catch(() => null));
    }
  }, []);

  useEffect(() => {
    if (!inDesktop) return undefined;
    const first = globalThis.setTimeout(() => void check(false), 0);
    const timer = globalThis.setInterval(() => void check(false), RECHECK_MS);
    return () => {
      globalThis.clearTimeout(first);
      globalThis.clearInterval(timer);
    };
  }, [inDesktop, check]);

  const available =
    result?.status === 'available' || result?.status === 'snoozed' ? result.update : null;

  const value = useMemo<Updates>(
    () => ({
      desktop: inDesktop,
      info,
      result,
      available,
      checking,
      install,
      dismissed: dismissed || result?.status === 'snoozed',
      checkNow: () => check(true),
      remindLater: async (version: string) => {
        setDismissed(true);
        await desktop.snooze(version).catch(() => undefined);
      },
      installNow: async () => {
        setInstall({ phase: 'downloading', percent: null });
        try {
          await desktop.install((event) => {
            if (event.event === 'downloading') {
              const percent = event.total
                ? Math.round((100 * event.downloaded) / event.total)
                : null;
              setInstall({ phase: 'downloading', percent });
            } else {
              setInstall({ phase: event.event });
            }
          });
        } catch (error) {
          setInstall({ phase: 'failed', message: message(error) });
        }
      },
      setAutoCheck: async (enabled: boolean) => {
        await desktop.setAutoCheck(enabled);
        setInfo((current) => (current ? { ...current, autoCheck: enabled } : current));
      },
    }),
    [inDesktop, info, result, available, checking, install, dismissed, check],
  );
  return <UpdatesContext.Provider value={value}>{children}</UpdatesContext.Provider>;
}

export function useUpdates(): Updates {
  return useContext(UpdatesContext);
}
