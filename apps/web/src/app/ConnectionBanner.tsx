// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: A small "Reconnecting…" banner while the server can't be reached, and getting back.
 * Scope: Shown when a request fails because nothing answered (the computer is asleep, off, or the
 *   app stopped), in a polite live region. It checks again with a growing wait (1 s up to 30 s),
 *   explains after a few tries, offers "Retry now", disappears as soon as anything answers, and
 *   then refreshes the app's data.
 * Does NOT belong: Error responses from a server that does answer (they show where they happen) or
 *   tracking reachability (api/connection.ts).
 */
import { useQueryClient } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, ApiError } from '@/api/client';
import { isServerReachable, subscribeToConnection } from '@/api/connection';
import { Button } from '@/components/ui/Button';
import { StatusRegion } from '@/components/ui/Feedback';

const EXPLAIN_AFTER = 2; // failed checks

/** 1 s, 2 s, 4 s, 8 s, 16 s, then every 30 s. */
const waitAfter = (failures: number) => Math.min(1000 * 2 ** failures, 30_000);

interface Round {
  failures: number;
  wait: number;
}

/** One more failed check: wait longer before the next. */
const failedAgain = ({ failures }: Round): Round => ({
  failures: failures + 1,
  wait: waitAfter(failures + 1),
});

function Reconnecting() {
  const [round, setRound] = useState<Round>({ failures: 0, wait: waitAfter(0) });
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      // Any answer (even a refusal) means the server is back; this component then goes away.
      void api('/api/health').catch((error: unknown) => {
        if (cancelled || !(error instanceof ApiError && error.status === 0)) return;
        setRound(failedAgain);
      });
    }, round.wait);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [round]);
  const explain = round.failures >= EXPLAIN_AFTER;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm">
      <WifiOff size={16} aria-hidden="true" className="shrink-0 text-warning" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Reconnecting…</span>
        {explain ? (
          <span className="text-muted">
            {' '}
            TTSNative isn&apos;t reachable. Is the computer on and the app running?
          </span>
        ) : null}
      </p>
      {explain ? (
        <Button
          size="sm"
          variant="ghost"
          className="max-sm:h-11"
          onClick={() => setRound(({ failures }) => ({ failures, wait: 0 }))}
        >
          Retry now
        </Button>
      ) : null}
    </div>
  );
}

export function ConnectionBanner() {
  const reachable = useSyncExternalStore(subscribeToConnection, isServerReachable);
  const client = useQueryClient();
  // Back again: fetch what failed (and anything else on screen) once more.
  useEffect(
    () =>
      subscribeToConnection(() => {
        if (isServerReachable()) void client.invalidateQueries();
      }),
    [client],
  );
  return <StatusRegion label="Connection">{reachable ? null : <Reconnecting />}</StatusRegion>;
}
