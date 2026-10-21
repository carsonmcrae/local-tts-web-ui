// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: One of the books that ship with the app, as Explore shows it.
 * Scope: Cover (or a plain cover drawn from the title and author), title, author and year, type and
 *   genres, chapters and listening time, the description, a content note where the catalog has one,
 *   a rights note where the work is public domain in the United States only, and the actions: Read
 *   (opens the book, adding it to the library the first time), Continue when it is already there,
 *   Hide, and Show again for a hidden work.
 * Does NOT belong: Fetching (api/catalogQueries.ts) or the page's grouping (ExplorePage.tsx).
 */
import { BookOpen, EyeOff, Sparkles, Undo2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { describeError } from '@/api/client';
import { useHideWork, useOpenWork, workCoverUrl } from '@/api/catalogQueries';
import type { BundledWork } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Feedback';
import { genreLabel, typeLabel } from '@/features/library/vocabulary';
import { cn } from '@/lib/cn';
import { formatDuration, pluralize } from '@/lib/format';

function genreNames(work: BundledWork): string {
  return work.genres.map(genreLabel).join(', ');
}

/** A cover image, or a plain cover made of the title and author when the catalog ships none. */
function WorkCover({ work, className }: Readonly<{ work: BundledWork; className?: string }>) {
  if (work.hasCover) {
    return (
      <img
        src={workCoverUrl(work.workId)}
        alt=""
        loading="lazy"
        className={cn('aspect-[2/3] w-full rounded-[8px] object-cover shadow-soft', className)}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex aspect-[2/3] w-full flex-col justify-between rounded-[8px] border border-line bg-gradient-to-br from-accent-soft to-surface-2 p-3 shadow-soft',
        className,
      )}
    >
      <p className="font-serif text-[15px] leading-snug font-semibold text-text">{work.title}</p>
      <p className="text-xs text-muted">{work.authors.join(', ')}</p>
    </div>
  );
}

export function WorkCard({ work }: Readonly<{ work: BundledWork }>) {
  const open = useOpenWork();
  const hide = useHideWork();
  const navigate = useNavigate();
  const inLibrary = Boolean(work.documentId);
  const read = () => {
    if (work.documentId) {
      void navigate(`/read/${work.documentId}`);
      return;
    }
    open.mutate(work.workId, { onSuccess: (doc) => void navigate(`/read/${doc.id}`) });
  };
  return (
    <li
      className={cn(
        'flex gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-soft',
        work.hidden && 'opacity-70',
      )}
    >
      <div className="w-24 shrink-0 sm:w-28">
        <WorkCover work={work} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-serif text-lg leading-snug font-semibold">{work.title}</h3>
        <p className="mt-0.5 text-[13px] text-muted">
          {work.authors.join(', ')} · {work.firstPublished}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {typeLabel(work.documentType)} · {genreNames(work)} ·{' '}
          {pluralize(work.chapterCount, 'chapter')} · ~{formatDuration(work.estimatedSeconds)}{' '}
          listen
        </p>
        {work.description ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed">{work.description}</p>
        ) : null}
        {work.featured ? (
          <p className="mt-2 flex items-start gap-1.5 text-[13px] text-accent-text">
            <Sparkles size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{work.featured.blurb}</span>
          </p>
        ) : null}
        {work.contentNotes.map((note) => (
          <p key={note} className="mt-2 text-[13px] text-muted">
            <Badge tone="warning" className="mr-1.5">
              Note
            </Badge>
            {note}
          </p>
        ))}
        {!work.rightsWorldwide && work.rightsLimits ? (
          <p className="mt-2 text-[13px] text-muted">{work.rightsLimits}</p>
        ) : null}
        {open.isError ? (
          <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
            {describeError(open.error)}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          {work.hidden ? (
            <Button
              size="sm"
              icon={<Undo2 size={14} />}
              loading={hide.isPending}
              onClick={() => hide.mutate({ workId: work.workId, hidden: false })}
            >
              Show again
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="primary"
                icon={<BookOpen size={14} />}
                loading={open.isPending}
                onClick={read}
              >
                {inLibrary ? 'Continue' : 'Read'}
              </Button>
              {inLibrary ? <Badge tone="success">In your library</Badge> : null}
              <Button
                size="sm"
                variant="ghost"
                icon={<EyeOff size={14} />}
                loading={hide.isPending}
                onClick={() => hide.mutate({ workId: work.workId, hidden: true })}
              >
                Hide
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
