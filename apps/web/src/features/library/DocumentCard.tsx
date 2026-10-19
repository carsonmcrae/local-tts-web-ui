/**
 * Purpose: One document in the library with its metadata, progress and actions.
 * Scope: Type icon, title, file type/size/sections/estimated listening time, reading progress,
 *   open/continue link and delete (with confirmation).
 * Does NOT belong: Data fetching beyond the delete mutation.
 */
import { BookText, FileText, FileType2, Hash, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useDeleteDocument } from '@/api/queries';
import type { DocumentSummary } from '@/api/types';
import { IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge, ProgressBar } from '@/components/ui/Feedback';
import { usePlayer } from '@/features/player/PlayerProvider';
import { fileTypeLabel, formatBytes, formatDuration, formatRelativeDate, pluralize } from '@/lib/format';

const ICONS = { pdf: FileType2, epub: BookText, md: Hash } as const;

export function documentFacts(doc: DocumentSummary): string[] {
  return [
    fileTypeLabel(doc.fileType),
    formatBytes(doc.sizeBytes),
    doc.pageCount ? pluralize(doc.pageCount, 'page') : pluralize(doc.sectionCount, 'section'),
    doc.estimatedSeconds < 60 ? '< 1 min listen' : `~${formatDuration(doc.estimatedSeconds)} listen`,
  ];
}

export function DocumentCard({ doc }: Readonly<{ doc: DocumentSummary }>) {
  const remove = useDeleteDocument();
  const { controller, state } = usePlayer();
  const [confirm, setConfirm] = useState(false);
  const Icon = ICONS[doc.fileType as keyof typeof ICONS] ?? FileText;
  const percent = doc.progress?.percent ?? 0;

  return (
    <li className="group relative flex gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-soft transition-shadow hover:shadow-raised">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent-text">
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium">
          <Link to={`/read/${doc.id}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {doc.title}
          </Link>
        </h3>
        <p className="mt-0.5 truncate text-[13px] text-muted">{documentFacts(doc).join(' · ')}</p>
        <div className="mt-3 flex items-center gap-3">
          {doc.progress ? (
            <>
              <ProgressBar value={percent / 100} label={`${percent}% listened`} className="max-w-48" />
              <span className="text-xs text-muted tabular-nums">{Math.round(percent)}%</span>
            </>
          ) : (
            <Badge>New</Badge>
          )}
          <span className="ml-auto text-xs text-subtle">{formatRelativeDate(doc.progress?.updatedAt ?? doc.createdAt)}</span>
        </div>
      </div>
      <IconButton
        label={`Delete ${doc.title}`}
        icon={<Trash2 size={16} />}
        size="sm"
        className="relative z-10 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        onClick={() => setConfirm(true)}
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this document?"
        description={`“${doc.title}” and its reading progress will be permanently removed from this computer.`}
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={() =>
          remove.mutate(doc.id, {
            onSuccess: () => {
              if (state.document?.id === doc.id) controller.unload();
              setConfirm(false);
            },
          })
        }
      />
    </li>
  );
}
