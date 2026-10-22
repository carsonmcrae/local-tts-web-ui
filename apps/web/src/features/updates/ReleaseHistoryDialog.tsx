// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Settings → About → Release history: every published version's notes, one version at a time.
 * Scope: The list of versions (a newer version found by an update check first, then the notes built
 *   into this copy of the app so history works offline, newest first), the selected version's notes
 *   and date, Older / Newer to step through them, and a mark on the available update, the installed
 *   version and the latest one. Opens at a version (What's new) or at the newest.
 * Does NOT belong: Update installation (UpdateDialog) or reading the notes (lib/releaseHistory.ts).
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Feedback';
import { WebLink } from '@/components/ui/WebLink';
import { cn } from '@/lib/cn';
import type { ReleaseNotes } from '@/lib/releaseHistory';
import { RELEASES_URL } from '@/lib/releaseHistory';
import { ReleaseNotesView } from './ReleaseNotesView';

interface Marks {
  /** The version an update check found, not yet installed. */
  available: string | null;
  /** The version this copy of TTSNative runs. */
  installed: string | null;
}

interface Mark {
  label: string;
  tone: 'accent' | 'success' | 'neutral';
}

/** What sets a version apart in the list, if anything. */
function markFor(release: ReleaseNotes, index: number, marks: Marks): Mark | null {
  if (release.version === marks.available) return { label: 'Available update', tone: 'accent' };
  if (release.version === marks.installed) return { label: 'Installed', tone: 'success' };
  if (index === 0) return { label: 'Latest', tone: 'neutral' };
  return null;
}

interface VersionListProps {
  releases: readonly ReleaseNotes[];
  selected: ReleaseNotes;
  marks: Marks;
  onSelect: (version: string) => void;
}

/** Every version as a chip (a column beside the notes on wider screens, a wrapping row on phones). */
function VersionList({ releases, selected, marks, onSelect }: Readonly<VersionListProps>) {
  return (
    <nav aria-label="Versions" className="shrink-0 sm:w-44">
      <ol className="flex flex-wrap gap-1.5 sm:flex-col">
        {releases.map((release, index) => {
          const mark = markFor(release, index, marks);
          const current = release.version === selected.version;
          return (
            <li key={release.version}>
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                aria-label={mark ? `${release.version} ${mark.label}` : release.version}
                onClick={() => onSelect(release.version)}
                className={cn(
                  'flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm transition-colors',
                  current
                    ? 'border-accent bg-accent-soft font-semibold text-accent-text'
                    : 'border-line text-text hover:bg-surface-2',
                )}
              >
                <span>{release.version}</span>
                {mark ? (
                  <span className="text-[11px] font-medium text-muted">{mark.label}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function NoNotes() {
  return (
    <p className="text-sm text-muted">
      This copy of TTSNative was built without release notes. They are on{' '}
      <WebLink href={RELEASES_URL}>GitHub</WebLink>.
    </p>
  );
}

interface ReleaseBrowserProps {
  releases: readonly ReleaseNotes[];
  /** Start at this version; at the newest when it is unknown. */
  initialVersion: string | null;
  marks: Marks;
}

function ReleaseBrowser({ releases, initialVersion, marks }: Readonly<ReleaseBrowserProps>) {
  const [version, setVersion] = useState(initialVersion);
  const index = Math.max(
    0,
    releases.findIndex((release) => release.version === version),
  );
  const selected = releases[index];
  if (!selected) return <NoNotes />;
  const older = releases[index + 1];
  const newer = releases[index - 1];
  const mark = markFor(selected, index, marks);
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
      <VersionList releases={releases} selected={selected} marks={marks} onSelect={setVersion} />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {mark ? (
          <Badge tone={mark.tone} className="self-start">
            {mark.label}
          </Badge>
        ) : null}
        <ReleaseNotesView release={selected} heading />
        <nav
          aria-label="Browse versions"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-sm"
        >
          {older ? (
            <Button
              size="sm"
              icon={<ChevronLeft size={15} />}
              onClick={() => setVersion(older.version)}
            >
              Older: {older.version}
            </Button>
          ) : (
            <span className="text-muted">No older releases</span>
          )}
          {newer ? (
            <Button size="sm" onClick={() => setVersion(newer.version)}>
              Newer: {newer.version}
              <ChevronRight size={15} />
            </Button>
          ) : (
            <span className="text-muted">This is the latest</span>
          )}
        </nav>
      </div>
    </div>
  );
}

interface ReleaseHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releases: readonly ReleaseNotes[];
  /** A newer version from the update check, not yet installed. */
  available?: ReleaseNotes | null;
  /** The version this copy of TTSNative runs (the release a development build is based on). */
  installed?: string | null;
  /** Open at this version; otherwise at the newest. */
  initialVersion?: string | null;
}

export function ReleaseHistoryDialog({
  open,
  onOpenChange,
  releases,
  available = null,
  installed = null,
  initialVersion = null,
}: Readonly<ReleaseHistoryDialogProps>) {
  const known =
    available !== null && releases.some((release) => release.version === available.version);
  const entries = available && !known ? [available, ...releases] : releases;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Release history"
      description="What changed in each version of TTSNative, one version at a time."
      size="lg"
    >
      <ReleaseBrowser
        releases={entries}
        initialVersion={initialVersion}
        marks={{ available: available ? available.version : null, installed }}
      />
    </Dialog>
  );
}
