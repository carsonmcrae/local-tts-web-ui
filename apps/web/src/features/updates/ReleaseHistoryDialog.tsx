// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Settings → About → Release history: every published version's notes, newest first.
 * Scope: The notes built into this copy of the app (so history works offline), with a newer version
 *   found by an update check shown first and marked as available; opening at one version scrolls to
 *   it (What's new uses that).
 * Does NOT belong: Update installation (UpdateDialog) or reading the notes (lib/releaseHistory.ts).
 */
import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/Feedback';
import { Dialog } from '@/components/ui/Dialog';
import type { ReleaseNotes } from '@/lib/releaseHistory';
import { RELEASES_URL } from '@/lib/releaseHistory';
import { ReleaseNotesView } from './ReleaseNotesView';

interface ReleaseHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releases: readonly ReleaseNotes[];
  /** A newer version from the update check, not yet installed. */
  available?: ReleaseNotes | null;
  /** Scroll to this version when the dialog opens. */
  focusVersion?: string | null;
}

export function ReleaseHistoryDialog({
  open,
  onOpenChange,
  releases,
  available = null,
  focusVersion = null,
}: Readonly<ReleaseHistoryDialogProps>) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!open || !focusVersion) return;
    const timer = window.setTimeout(() => {
      list.current?.querySelector(`[data-version="${focusVersion}"]`)?.scrollIntoView();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [open, focusVersion]);

  const shown = available && !releases.some((r) => r.version === available.version);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Release history"
      description="What changed in each version of TTSNative."
      size="lg"
    >
      {releases.length || shown ? (
        <ol ref={list} className="flex flex-col divide-y divide-line">
          {shown ? (
            <li data-version={available.version} className="flex flex-col gap-2 pb-6">
              <Badge tone="accent" className="self-start">
                Available update
              </Badge>
              <ReleaseNotesView release={available} heading />
            </li>
          ) : null}
          {releases.map((release) => (
            <li key={release.version} data-version={release.version} className="py-6 first:pt-0">
              <ReleaseNotesView release={release} heading />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">
          This copy of TTSNative was built without release notes. They are on{' '}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            GitHub
          </a>
          .
        </p>
      )}
    </Dialog>
  );
}
