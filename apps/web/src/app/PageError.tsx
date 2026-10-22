// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: What a page shows instead of crashing, inside the app's chrome.
 * Scope: A part of the app that couldn't be fetched (most often because the server isn't reachable,
 *   for example when the app was opened from the offline copy, or because the app was updated)
 *   gets a plain explanation; any other failure gets its message. Both offer Retry, which loads the
 *   page again from the server.
 * Does NOT belong: Errors from API requests (shown where they happen) or the reconnect banner.
 */
import { AlertTriangle, WifiOff } from 'lucide-react';
import { useLocation, useRouteError } from 'react-router';
import { describeError } from '@/api/client';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { usePageTitle } from '@/components/ui/Layout';

/** Chromium, Firefox and Safari word a failed lazy import differently. */
const UNFETCHED = /dynamically imported module|importing a module script failed|module script/i;

export function PageError() {
  const error = useRouteError();
  const { pathname, search } = useLocation();
  const unfetched = error instanceof Error && UNFETCHED.test(error.message);
  const title = unfetched ? "This page couldn't load" : 'Something went wrong';
  usePageTitle(title);
  return (
    <EmptyState
      icon={unfetched ? <WifiOff size={26} /> : <AlertTriangle size={26} />}
      title={title}
      actions={
        // A full page load, not an in-app link: it fetches the app again.
        <a href={`${pathname}${search}`} className={buttonClasses('primary', 'md', 'max-sm:h-11')}>
          Retry
        </a>
      }
    >
      {unfetched
        ? "TTSNative isn't reachable — is the computer on and the app running? If it was just updated, Retry loads the new version."
        : describeError(error)}
    </EmptyState>
  );
}
