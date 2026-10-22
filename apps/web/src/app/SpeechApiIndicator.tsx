// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: A small sign that another program is using TTSNative voices through the local speech API.
 * Scope: Shown only while the API is making audio or has served a request in the last few seconds:
 *   a labelled link to its settings in the desktop sidebar, and a dot with a screen-reader label on
 *   the phone tab bar's Settings tab. It is not a live region, so it never interrupts.
 * Does NOT belong: The settings themselves (features/settings/SpeechApiSection).
 */
import { NavLink } from 'react-router';
import { useSpeechApiActivity } from '@/api/speechApiQueries';

const DOT = 'size-2 rounded-full bg-accent motion-safe:animate-pulse';

export function SpeechApiIndicator({ variant }: Readonly<{ variant: 'sidebar' | 'tab' }>) {
  const activity = useSpeechApiActivity();
  if (!activity.data?.active) return null;
  if (variant === 'tab') {
    return (
      <>
        <span aria-hidden="true" className={`absolute top-2 right-[calc(50%-16px)] ${DOT}`} />
        <span className="sr-only">, speech API in use</span>
      </>
    );
  }
  return (
    <NavLink
      to="/settings#speech-api"
      className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-xs text-muted hover:bg-surface-2"
    >
      <span aria-hidden="true" className={DOT} />
      <span>Speech API in use</span>
    </NavLink>
  );
}
