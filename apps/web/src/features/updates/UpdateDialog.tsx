// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Read about an available update and install it, only after the user agrees.
 * Scope: The new version's notes, what installing does (TTSNative closes, installs the verified update
 *   and reopens; documents, voices and settings are kept), then download / verify / install progress,
 *   and a plain explanation with Try again and the website as a fallback if anything fails.
 * Does NOT belong: Deciding when to check (UpdatesProvider) or the launch notice (UpdateNotice).
 */
import { Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner, ProgressBar, StatusRegion } from '@/components/ui/Feedback';
import { WebLink } from '@/components/ui/WebLink';
import type { FoundUpdate } from '@/lib/desktop';
import { parseReleaseMarkdown } from '@/lib/releaseHistory';
import { ReleaseNotesView } from './ReleaseNotesView';
import type { InstallState } from './UpdatesProvider';
import { useUpdates } from './UpdatesProvider';

const WEBSITE = 'https://ttsnative.com/#download';

/** The website's download section, for installing by hand when the update fails. */
function WebsiteLink() {
  return (
    <WebLink href={WEBSITE} className="inline-flex items-center gap-1">
      ttsnative.com <ExternalLink size={12} aria-hidden="true" />
    </WebLink>
  );
}

function Progress({ install }: Readonly<{ install: InstallState }>) {
  if (install.phase === 'idle' || install.phase === 'failed') return null;
  const text = {
    downloading:
      install.phase === 'downloading' && install.percent !== null
        ? `Downloading the update… ${install.percent}%`
        : 'Downloading the update…',
    verifying: 'Checking the update’s signature…',
    installing: 'Starting the installer. TTSNative will close and reopen in a moment.',
  }[install.phase];
  const value = install.phase === 'downloading' ? (install.percent ?? 0) / 100 : 1;
  return (
    <StatusRegion className="flex flex-col gap-2 text-sm">
      <span>{text}</span>
      <ProgressBar value={value} label="Update progress" />
    </StatusRegion>
  );
}

export function UpdateDialog({
  update,
  open,
  onOpenChange,
}: Readonly<{ update: FoundUpdate; open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { install, installNow } = useUpdates();
  const busy = install.phase !== 'idle' && install.phase !== 'failed';
  const notes = parseReleaseMarkdown(update.version, update.date, update.notes ?? '');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title={`TTSNative ${update.version} is available`}
      description="Installing closes TTSNative, installs the verified update and opens it again. Your documents, voices and settings are kept."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={busy}>
            Not now
          </Button>
          <Button
            variant="primary"
            icon={<Download size={16} />}
            loading={busy}
            onClick={() => void installNow()}
          >
            {install.phase === 'failed' ? 'Try again' : 'Install and restart'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Progress install={install} />
        {install.phase === 'failed' ? (
          <Banner tone="error" title="The update wasn’t installed">
            {install.message} You can also download the installer from <WebsiteLink />.
          </Banner>
        ) : null}
        {notes.summary || notes.sections.length ? (
          <ReleaseNotesView release={notes} />
        ) : (
          <p className="text-sm text-muted">This version has no release notes yet.</p>
        )}
      </div>
    </Dialog>
  );
}
