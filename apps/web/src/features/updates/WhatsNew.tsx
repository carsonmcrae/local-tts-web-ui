// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: After an update, show once what's new in the version now running.
 * Scope: Remembers the last version this device opened (per device, like the theme); when that
 *   changes to a version with release notes, opens them in a dialog once. The first start after
 *   installing shows nothing.
 * Does NOT belong: Release history (ReleaseHistoryDialog) or updating (UpdateDialog).
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { ReleaseNotes } from '@/lib/releaseHistory';
import { baseVersion, notesFor } from '@/lib/releaseHistory';
import { ReleaseNotesView } from './ReleaseNotesView';

const STORAGE_KEY = 'ttsnative.lastSeenVersion';

function remember(version: string) {
  try {
    localStorage.setItem(STORAGE_KEY, version);
  } catch {
    // storage unavailable (private window): show nothing rather than fail
  }
}

function previous(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function WhatsNew({ version }: Readonly<{ version: string }>) {
  const [release, setRelease] = useState<ReleaseNotes | null>(() => {
    const seen = previous();
    const current = baseVersion(version);
    return seen && seen !== current ? (notesFor(current) ?? null) : null;
  });
  useEffect(() => remember(baseVersion(version)), [version]);
  if (!release) return null;
  return (
    <Dialog
      open
      onOpenChange={() => setRelease(null)}
      title={`What’s new in TTSNative ${release.version}`}
      footer={
        <Button variant="primary" onClick={() => setRelease(null)}>
          Continue
        </Button>
      }
    >
      <ReleaseNotesView release={release} />
    </Dialog>
  );
}
