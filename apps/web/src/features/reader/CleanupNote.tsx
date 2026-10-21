// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The reader's note on what isn't read aloud, and the place to review and undo it.
 * Scope: One quiet, collapsed line saying what is skipped when reading: the running headers,
 *   footers, page numbers and footnote markers the cleanup found at import, and sentences skipped
 *   by hand. Opened, it lists them by reason (each a button that shows it in the text) with "Read
 *   them all again" (undo the cleanup) or "Skip them again". Hidden when nothing was found. Shown
 *   after the document's other warnings, in place of the notice the cleanup added to them.
 * Does NOT belong: Skipping one sentence (StyleSentencesDialog) or fetching (cleanupQueries).
 */
import { ChevronDown, ChevronRight, EyeOff } from 'lucide-react';
import { describeError } from '@/api/client';
import type { CleanupItem, CleanupReason } from '@/api/cleanupQueries';
import { useCleanup, useCleanupAction } from '@/api/cleanupQueries';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';

const REASONS: readonly { reason: CleanupReason; one: string; many: string; title: string }[] = [
  { reason: 'header', one: 'running header', many: 'running headers', title: 'Running headers' },
  { reason: 'footer', one: 'running footer', many: 'running footers', title: 'Running footers' },
  { reason: 'page_number', one: 'page number', many: 'page numbers', title: 'Page numbers' },
  {
    reason: 'footnote',
    one: 'footnote marker',
    many: 'footnote markers',
    title: 'Footnote markers',
  },
  {
    reason: 'manual',
    one: 'sentence you chose',
    many: 'sentences you chose',
    title: 'Skipped by you',
  },
];
const LISTED = 100; // sentences listed for each reason
// Touch targets are 44px on phones, compact with a pointer.
const ROW = 'min-h-11 sm:min-h-8';

/** How many things items stand for: footnote markers one by one, anything else by the sentence. */
const size = (items: readonly CleanupItem[]) =>
  items.reduce(
    (sum, item) => sum + (item.reason === 'footnote' ? (item.markers?.length ?? 0) : 1),
    0,
  );

/** "20 running headers, 22 page numbers" for the given items. */
function phrase(items: readonly CleanupItem[]): string {
  return REASONS.map(({ reason, one, many }) => {
    const count = size(items.filter((item) => item.reason === reason));
    return count ? `${count.toString()} ${count === 1 ? one : many}` : '';
  })
    .filter(Boolean)
    .join(', ');
}

function ReasonList({
  title,
  items,
  onJump,
}: Readonly<{
  title: string;
  items: readonly CleanupItem[];
  onJump: (segment: number, section: number) => void;
}>) {
  const hidden = items.length - LISTED;
  return (
    <details className="group/list">
      <summary
        className={`flex ${ROW} cursor-pointer items-center gap-1.5 font-medium select-none`}
      >
        <ChevronRight
          size={14}
          className="shrink-0 text-muted group-open/list:rotate-90 motion-safe:transition-transform"
        />
        {title} <span className="font-normal text-muted">({size(items)})</span>
      </summary>
      <ul className="mt-1 flex flex-col">
        {items.slice(0, LISTED).map((item) => (
          <li key={`${item.reason}-${item.index.toString()}`}>
            <button
              type="button"
              title={item.text}
              className={`flex ${ROW} w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 text-left hover:bg-surface-3`}
              onClick={() => onJump(item.index, item.sectionIndex)}
            >
              {/* The spaces keep the parts apart in the accessible name; flex layout ignores them. */}
              <span className="sr-only">Show in the text:</span>{' '}
              <span className="min-w-0 flex-1 truncate">{item.text}</span>{' '}
              {item.markers?.length ? (
                <span className="shrink-0 text-xs text-muted">
                  not read: {item.markers.join(' ')}
                </span>
              ) : null}{' '}
              {item.applied ? null : (
                <span className="shrink-0 text-xs text-muted">read aloud</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 ? <p className="px-2 text-xs text-muted">And {hidden.toString()} more.</p> : null}
    </details>
  );
}

interface NoteProps {
  documentId: string;
  /** Show a sentence in the text. */
  onJump: (segment: number, section: number) => void;
  /** What is read changed: the player fetches its audio again. */
  onChanged: () => void;
}

export function CleanupNote({ documentId, onJump, onChanged }: Readonly<NoteProps>) {
  const report = useCleanup(documentId);
  const action = useCleanupAction(documentId);
  const items = Array.isArray(report.data?.items) ? report.data.items : [];
  if (items.length === 0) return null;
  const automatic = items.filter((item) => item.reason !== 'manual');
  const skipped = items.filter((item) => item.applied);
  const summary = skipped.length
    ? `Skipped when reading aloud: ${phrase(skipped)}.`
    : `Everything is read aloud, including ${phrase(items)} found when it was added.`;
  const run = (which: 'undo' | 'apply') => action.mutate(which, { onSuccess: onChanged });
  const busy = (which: 'undo' | 'apply') => action.isPending && action.variables === which;

  return (
    <details className="group mb-6 rounded-[var(--radius-lg)] border border-line bg-surface-2 text-sm">
      <summary
        className={`flex ${ROW} cursor-pointer items-center gap-2 px-4 py-2 text-muted select-none`}
      >
        <EyeOff size={15} className="shrink-0" />
        <span className="min-w-0 flex-1">{summary}</span>
        <span className="shrink-0 font-medium text-accent-text group-open:hidden">Review</span>
        <ChevronDown
          size={15}
          className="shrink-0 group-open:rotate-180 motion-safe:transition-transform"
        />
      </summary>
      <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
        {REASONS.map(({ reason, title }) => {
          const group = items.filter((item) => item.reason === reason);
          return group.length ? (
            <ReasonList key={reason} title={title} items={group} onJump={onJump} />
          ) : null;
        })}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {automatic.some((item) => item.applied) ? (
            <Button
              size="sm"
              className="h-11 sm:h-8"
              loading={busy('undo')}
              onClick={() => run('undo')}
            >
              Read them all again
            </Button>
          ) : null}
          {automatic.some((item) => !item.applied) ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-11 sm:h-8"
              loading={busy('apply')}
              onClick={() => run('apply')}
            >
              Skip them again
            </Button>
          ) : null}
        </div>
        {items.some((item) => item.reason === 'manual') ? (
          <p className="text-xs text-muted">
            Sentences you skipped stay skipped: select one and choose Voice &amp; effect to read it
            again.
          </p>
        ) : null}
        {action.isError ? <Banner tone="error">{describeError(action.error)}</Banner> : null}
      </div>
    </details>
  );
}

/** The document's warnings, with the cleanup's own notice shown as its review note instead. */
export function DocumentNotices({
  warnings,
  ...note
}: Readonly<NoteProps & { warnings: readonly string[] }>) {
  const notice = useCleanup(note.documentId).data?.notice;
  return (
    <>
      {warnings
        .filter((warning) => warning !== notice)
        .map((warning) => (
          <Banner key={warning} tone="warning" className="mb-6">
            {warning}
          </Banner>
        ))}
      <CleanupNote {...note} />
    </>
  );
}
