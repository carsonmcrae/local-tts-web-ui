// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Settings → About: this version, updates and the release history.
 * Scope: Whether this is a stable release or a development build; in the desktop app the update
 *   status, Check for updates, turning automatic checks on or off (a Microsoft Store copy says the
 *   Store updates it instead), opening the data and log folders and deleting the user's data;
 *   elsewhere, how updates arrive when running from the source code. What's new and Release history
 *   work offline from the notes built into the app.
 * Does NOT belong: The rest of About (SystemSections) or update state (UpdatesProvider).
 */
import { FolderOpen, History, RefreshCw, ScrollText, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge, StatusRegion } from '@/components/ui/Feedback';
import { WebLink } from '@/components/ui/WebLink';
import { desktop } from '@/lib/desktop';
import {
  RELEASES_URL,
  baseVersion,
  isDevelopmentBuild,
  notesFor,
  parseReleaseMarkdown,
  releaseHistory,
} from '@/lib/releaseHistory';
import { DeleteMyData } from './DeleteMyData';
import { ReleaseHistoryDialog } from './ReleaseHistoryDialog';
import { UpdateDialog } from './UpdateDialog';
import type { Updates } from './UpdatesProvider';
import { useUpdates } from './UpdatesProvider';

/** A Microsoft Store copy: the Store updates it, so it never checks GitHub. */
function fromStore({ info, result }: Updates): boolean {
  return info?.updates === 'store' || result?.status === 'store';
}

function status(updates: Updates): string {
  const { result, checking, info } = updates;
  if (fromStore(updates)) return 'The Microsoft Store keeps TTSNative up to date.';
  if (checking) return 'Checking for updates…';
  if (result?.status === 'failed') return result.message;
  // GitHub answered without an update to offer: none published yet, or its servers had a problem.
  if (result?.status === 'noRelease') return 'No update is available right now.';
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
  const store = fromStore(updates);
  return (
    <div className="flex flex-col gap-3">
      <StatusRegion className="text-sm">{status(updates)}</StatusRegion>
      <div className="flex flex-wrap gap-2">
        {store ? null : (
          <Button
            icon={<RefreshCw size={15} />}
            loading={updates.checking}
            onClick={() => void updates.checkNow()}
          >
            Check for updates
          </Button>
        )}
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
        <DeleteMyData store={store} />
      </div>
      {store ? null : (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent)]"
            checked={updates.info?.autoCheck ?? true}
            onChange={(event) => void updates.setAutoCheck(event.target.checked)}
          />
          <span>Check for updates automatically (asks GitHub at most twice a day)</span>
        </label>
      )}
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
          versions and the Windows app are on <WebLink href={RELEASES_URL}>GitHub Releases</WebLink>
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
