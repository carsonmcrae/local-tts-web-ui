// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The Exports screen: every recent audiobook export and what can be done with it.
 * Scope: Exports grouped so stopped ones (paused, interrupted when the app closed, or failed) come
 *   first with Resume, then running ones (refreshed while they run), then finished and canceled
 *   ones. Each shows its status, saved sentences, working size and the same actions as the export
 *   dialog. An empty state explains how to make one.
 * Does NOT belong: Starting exports (the reader's export dialog) or one export's actions
 *   (ExportStatus).
 */
import { BookHeadphones } from 'lucide-react';
import { Link } from 'react-router';
import { describeError } from '@/api/client';
import { useExports } from '@/api/exportQueries';
import { isJobActive } from '@/api/queries';
import type { ExportOut } from '@/api/types';
import { buttonClasses } from '@/components/ui/Button';
import { Badge, Banner, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Layout';
import { formatBytes, formatRelativeDate } from '@/lib/format';
import { ExportStatus } from './ExportStatus';
import { FORMATS, RESUMABLE, savedText, STATUS } from './exportText';

function ExportCard({ item }: Readonly<{ item: ExportOut }>) {
  const { job } = item;
  const status = STATUS[job.status];
  const finished = job.status === 'succeeded';
  const stopped = RESUMABLE.has(job.status); // their status says what is saved
  const facts = [
    FORMATS[item.format].name,
    formatRelativeDate(job.createdAt),
    isJobActive(job) ? savedText(item.savedSentences, item.sentences) : null,
    `${formatBytes(item.workingBytes)} on disk`,
  ].filter(Boolean);
  return (
    <li className="rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-soft">
      <article aria-label={item.title || 'Untitled export'}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-medium break-words">{item.title || 'Untitled export'}</h3>
          <Badge tone={status.tone} className="mt-0.5">
            {status.label}
          </Badge>
        </div>
        <p className="mt-0.5 text-[13px] text-muted">{facts.join(' · ')}</p>
        <div className="mt-3">
          <ExportStatus
            job={job}
            saved={stopped ? item : undefined}
            deletable
            removed={finished && item.workingBytes === 0}
          />
        </div>
      </article>
    </li>
  );
}

function Group({
  id,
  title,
  description,
  items,
}: Readonly<{ id: string; title: string; description?: string; items: readonly ExportOut[] }>) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <div>
        <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <ExportCard key={item.job.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

export default function ExportsPage() {
  const exports = useExports();
  const items = exports.data ?? [];
  const stopped = items.filter((item) => RESUMABLE.has(item.job.status));
  const running = items.filter((item) => isJobActive(item.job));
  const earlier = items.filter((item) => !stopped.includes(item) && !running.includes(item));
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title="Exports"
        description="Audiobooks you've made. An export that stops keeps its finished sentences, so Resume carries on where it left off."
      />
      {exports.isPending ? <Skeleton className="h-32" /> : null}
      {exports.isError ? <Banner tone="error">{describeError(exports.error)}</Banner> : null}
      {exports.isSuccess && items.length === 0 ? (
        <EmptyState
          icon={<BookHeadphones size={26} />}
          title="No exports yet"
          actions={
            <Link to="/library" className={buttonClasses('primary')}>
              Go to your library
            </Link>
          }
        >
          Open a document and choose Export audio in the player to make an MP3, an M4B audiobook or
          a read-along EPUB.
        </EmptyState>
      ) : null}
      <div className="flex flex-col gap-8">
        <Group
          id="stopped"
          title="Ready to resume"
          description="These stopped before they finished. Their saved sentences are kept."
          items={stopped}
        />
        <Group id="running" title="In progress" items={running} />
        <Group id="earlier" title="Earlier" items={earlier} />
      </div>
    </div>
  );
}
