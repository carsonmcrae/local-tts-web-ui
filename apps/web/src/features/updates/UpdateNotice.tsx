// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tell the user, without interrupting them, that a new version of TTSNative is available.
 * Scope: A slim notice at the top of every screen in the desktop app with the version, the first
 *   lines of what's new, and View release notes, Update now and Remind me later (three days, for that
 *   version). Hidden after Remind me later, while reminded, and outside the desktop app.
 * Does NOT belong: The update itself (UpdateDialog) or when checks run (UpdatesProvider).
 */
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { parseReleaseMarkdown } from '@/lib/releaseHistory';
import { UpdateDialog } from './UpdateDialog';
import { useUpdates } from './UpdatesProvider';

const PREVIEW_LINES = 3;

export function UpdateNotice() {
  const { available, dismissed, remindLater } = useUpdates();
  const [open, setOpen] = useState(false);
  if (!available) return null;
  const highlights = parseReleaseMarkdown(available.version, available.date, available.notes ?? '')
    .sections.flatMap((section) => section.items)
    .slice(0, PREVIEW_LINES);
  return (
    <>
      {dismissed ? null : (
        <section
          aria-label="Update available"
          className="flex flex-col gap-3 border-b border-line bg-accent-soft px-4 py-3 text-sm sm:flex-row sm:items-center sm:px-8"
        >
          <Sparkles
            size={18}
            className="hidden shrink-0 text-accent-text sm:block"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">TTSNative {available.version} is available</p>
            {highlights.length ? (
              <ul className="mt-0.5 list-disc pl-5 text-muted">
                {highlights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => void remindLater(available.version)}>
              Remind me later
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              View release notes
            </Button>
            <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
              Update now
            </Button>
          </div>
        </section>
      )}
      <UpdateDialog update={available} open={open} onOpenChange={setOpen} />
    </>
  );
}
