// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Settings → About: this version, updates and the release history.
 * Scope: Whether this is a stable release or a development build; in the desktop app the update
 *   status, Check for updates, turning automatic checks on or off, and opening the data and log
 *   folders; elsewhere, how updates arrive when running from the source code. What's new and Release
 *   history work offline from the notes built into the app.
 * Does NOT belong: The rest of About (SystemSections) or update state (UpdatesProvider).
 */
import { FolderOpen, History, RefreshCw, ScrollText, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Feedback';
import { desktop } from '@/lib/desktop';
import {
  RELEASES_URL,
  baseVersion,
  isDevelopmentBuild,
  notesFor,
  parseReleaseMarkdown,
  releaseHistory,
} from '@/lib/releaseHistory';
import { ReleaseHistoryDialog } from './ReleaseHistoryDialog';
import { UpdateDialog } from './UpdateDialog';
import type { Updates } from './UpdatesProvider';
import { useUpdates } from './UpdatesProvider';

const linkClass = 'font-medium text-accent-text underline-offset-2 hover:underline';

function status(updates: Updates): string {
  const { result, checking, info } = updates;
  if (checking) return 'Checking for updates…';
  if (result?.status === 'failed') return result.message;
  if (updates.available) return `TTSNative ${updates.available.version} is available.`;
  if (result?.status === 'upToDate') return 'TTSNative is up to date.';
  if (info?.lastCheckedAt) {
    const when = new Date(info.lastCheckedAt * 1000).toLocaleString();
    return `No newer version was found when TTSNative last checked (${when}).`;
  }
  return info?.autoCheck === false ? 'Automatic update checks are off.' : 'Not checked yet.';
}

function DesktopControls() {
  const updates = useUpdates();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" role="status">
        {status(updates)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<RefreshCw size={15} />}
          loading={updates.checking}
          onClick={() => void updates.checkNow()}
        >
          Check for updates
        </Button>
        {updates.available ? (
          <Button variant="primary" onClick={() => setOpen(true)}>
            Update to {updates.available.version}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          icon={<FolderOpen size={15} />}
          onClick={() => void desktop.openFolder('data')}
        >
          Open data folder
        </Button>
        <Button
          variant="ghost"
          icon={<FolderOpen size={15} />}
          onClick={() => void desktop.openFolder('logs')}
        >
          Open log folder
        </Button>
        <Button
          variant="ghost"
          icon={<ScrollText size={15} />}
          onClick={() => void desktop.openFolder('notices')}
        >
          Third-party notices
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-accent)]"
          checked={updates.info?.autoCheck ?? true}
          onChange={(event) => void updates.setAutoCheck(event.target.checked)}
        />
        Check for updates automatically (asks GitHub at most twice a day)
      </label>
      {updates.available ? (
        <UpdateDialog update={updates.available} open={open} onOpenChange={setOpen} />
      ) : null}
    </div>
  );
}

export function AboutUpdates({ version }: Readonly<{ version: string }>) {
  const updates = useUpdates();
  const [history, setHistory] = useState<string | false>(false);
  const development = isDevelopmentBuild(version);
  const current = notesFor(baseVersion(version));
  const available = updates.available
    ? parseReleaseMarkdown(
        updates.available.version,
        updates.available.date,
        updates.available.notes ?? '',
      )
    : null;
  return (
    <div className="mt-6 flex flex-col gap-4 border-t border-line pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Version {version}</h3>
        <Badge tone={development ? 'warning' : 'success'}>
          {development ? 'Development build' : 'Stable release'}
        </Badge>
      </div>
      {updates.desktop ? (
        <DesktopControls />
      ) : (
        <p className="text-sm text-muted">
          This copy runs from TTSNative’s source code, so it updates when you pull new code. New
          versions and the Windows app are on{' '}
          <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
            GitHub Releases
          </a>
          .
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {current ? (
          <Button icon={<Sparkles size={15} />} onClick={() => setHistory(current.version)}>
            What’s new in {current.version}
          </Button>
        ) : null}
        <Button icon={<History size={15} />} onClick={() => setHistory('')}>
          Release history
        </Button>
      </div>
      <ReleaseHistoryDialog
        open={history !== false}
        onOpenChange={(open) => !open && setHistory(false)}
        releases={releaseHistory()}
        available={available}
        installed={baseVersion(version)}
        initialVersion={history || null}
      />
    </div>
  );
}
