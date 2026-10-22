// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: One document in the library with its metadata, progress and actions.
 * Scope: Cover (or a type icon), title, author, type, file type, size, sections and estimated
 *   listening time, reading progress, tags, a favourite star, a menu (move, collections, details,
 *   delete), a checkbox while selecting, and dragging the card onto a folder in the rail.
 * Does NOT belong: The dialogs the menu opens (OrganizeDialogs.tsx) or data fetching beyond the
 *   favourite toggle.
 */
import { BookText, FileText, FileType2, Globe, Hash, MoreHorizontal, Star } from 'lucide-react';
import type { DragEvent } from 'react';
import { Link } from 'react-router';
import { useUpdateShelf } from '@/api/libraryQueries';
import type { DocumentSummary } from '@/api/types';
import { IconButton } from '@/components/ui/Button';
import { Badge, ProgressBar } from '@/components/ui/Feedback';
import { Popover } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import {
  fileTypeLabel,
  formatBytes,
  formatDuration,
  formatRelativeDate,
  pluralize,
} from '@/lib/format';
import type { OrganizeAction } from './OrganizeDialogs';
import { DOCUMENT_DRAG_TYPE } from './views';
import { typeLabel } from './vocabulary';

const ICONS = {
  pdf: FileType2,
  epub: BookText,
  fb2: BookText,
  mobi: BookText,
  md: Hash,
  html: Globe,
} as const;
const SHOWN_TAGS = 3;

export function documentFacts(doc: DocumentSummary): string[] {
  return [
    fileTypeLabel(doc.fileType),
    formatBytes(doc.sizeBytes),
    doc.pageCount ? pluralize(doc.pageCount, 'page') : pluralize(doc.sectionCount, 'section'),
    doc.estimatedSeconds < 60
      ? '< 1 min listen'
      : `~${formatDuration(doc.estimatedSeconds)} listen`,
  ];
}

/** The line under the title: author and type first, then the file facts. */
export function describeDocument(doc: DocumentSummary): string {
  const type = doc.shelf.documentType ? typeLabel(doc.shelf.documentType) : null;
  return [doc.author, type, ...documentFacts(doc)].filter(Boolean).join(' · ');
}

function Cover({ doc }: Readonly<{ doc: DocumentSummary }>) {
  const Icon = ICONS[doc.fileType as keyof typeof ICONS] ?? FileText;
  if (doc.hasCover) {
    return (
      <img
        src={`/api/documents/${doc.id}/cover`}
        alt=""
        className="h-16 w-11 shrink-0 rounded-[6px] object-cover shadow-soft"
      />
    );
  }
  return (
    <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded-[6px] bg-accent-soft text-accent-text">
      <Icon size={20} />
    </div>
  );
}

const menuItem =
  'flex min-h-9 items-center rounded-[var(--radius-sm)] px-2.5 text-left text-sm hover:bg-surface-2';

function CardMenu({
  doc,
  onAction,
}: Readonly<{ doc: DocumentSummary; onAction: (action: OrganizeAction) => void }>) {
  const items: readonly { action: OrganizeAction; label: string; danger?: boolean }[] = [
    { action: 'move', label: 'Move to folder…' },
    { action: 'collect', label: 'Collections…' },
    { action: 'edit', label: 'Edit details…' },
    { action: 'delete', label: 'Delete…', danger: true },
  ];
  return (
    <Popover
      label={`Options for ${doc.title}`}
      side="bottom"
      align="end"
      trigger={
        <IconButton
          label={`Options for ${doc.title}`}
          icon={<MoreHorizontal size={16} />}
          size="sm"
          className="relative z-10"
        />
      }
    >
      <div className="flex min-w-44 flex-col">
        {items.map((item) => (
          <button
            key={item.action}
            type="button"
            className={cn(menuItem, item.danger && 'text-danger')}
            onClick={() => onAction(item.action)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </Popover>
  );
}

export function DocumentCard({
  doc,
  selectable = false,
  selected = false,
  onSelectChange,
  onAction,
}: Readonly<{
  doc: DocumentSummary;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: ((selected: boolean) => void) | undefined;
  onAction: (action: OrganizeAction, doc: DocumentSummary) => void;
}>) {
  const shelf = useUpdateShelf();
  const percent = doc.progress?.percent ?? 0;
  const favorite = doc.shelf.favorite;
  const dragStart = (event: DragEvent<HTMLLIElement>) => {
    event.dataTransfer.setData(DOCUMENT_DRAG_TYPE, doc.id);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <li
      draggable
      onDragStart={dragStart}
      className={cn(
        'group relative flex gap-4 rounded-[var(--radius-lg)] border bg-surface p-4 shadow-soft transition-shadow hover:shadow-raised',
        selected ? 'border-accent' : 'border-line',
      )}
    >
      {selectable ? (
        <input
          type="checkbox"
          aria-label={`Select ${doc.title}`}
          checked={selected}
          onChange={(event) => onSelectChange?.(event.target.checked)}
          className="relative z-10 mt-1 size-5 shrink-0 accent-[var(--accent)]"
        />
      ) : null}
      <Cover doc={doc} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium">
          <Link
            to={`/read/${doc.id}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {doc.title}
          </Link>
        </h3>
        <p className="mt-0.5 truncate text-[13px] text-muted">{describeDocument(doc)}</p>
        {doc.shelf.tags.length ? (
          <p className="mt-1.5 flex flex-wrap gap-1" aria-label="Tags">
            {doc.shelf.tags.slice(0, SHOWN_TAGS).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
            {doc.shelf.tags.length > SHOWN_TAGS ? (
              <Badge>+{doc.shelf.tags.length - SHOWN_TAGS}</Badge>
            ) : null}
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-3">
          {doc.progress ? (
            <>
              <ProgressBar
                value={percent / 100}
                label={`${percent}% listened`}
                className="max-w-48"
              />
              <span className="text-xs text-muted tabular-nums">{Math.round(percent)}%</span>
            </>
          ) : (
            <Badge>New</Badge>
          )}
          <span className="ml-auto text-xs text-subtle">
            {formatRelativeDate(doc.progress?.updatedAt ?? doc.createdAt)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <IconButton
          label={
            favorite ? `Remove ${doc.title} from favourites` : `Add ${doc.title} to favourites`
          }
          icon={<Star size={16} className={cn(favorite && 'fill-current')} />}
          size="sm"
          active={favorite}
          className={cn(
            'relative z-10',
            !favorite &&
              'opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100',
          )}
          onClick={() => shelf.mutate({ documentId: doc.id, favorite: !favorite })}
        />
        <CardMenu doc={doc} onAction={(action) => onAction(action, doc)} />
      </div>
    </li>
  );
}
