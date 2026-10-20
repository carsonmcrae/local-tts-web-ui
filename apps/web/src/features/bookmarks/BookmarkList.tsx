// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: A document's bookmarks: jump back to a sentence, keep notes, export them.
 * Scope: Lists bookmarks in reading order with their section and sentence; choosing one jumps
 *   there; each note can be written or changed in a dialog; a bookmark can be removed; all notes
 *   can be saved as a Markdown file. Loading, empty and error states.
 * Does NOT belong: Adding bookmarks (useBookmarkToggle) or player coordination (ReaderPage).
 */
import { BookmarkX, FileDown, NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useBookmarks, useDeleteBookmark, useUpdateBookmark } from '@/api/readingQueries';
import type { Bookmark, SectionOut } from '@/api/types';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner, Skeleton } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { downloadText, notesFilename, notesMarkdown } from './notes';

interface BookmarkListProps {
  documentId: string;
  title: string;
  sections: readonly SectionOut[];
  onJump: (bookmark: Bookmark) => void;
}

function NoteDialog({
  documentId,
  bookmark,
  onClose,
}: Readonly<{ documentId: string; bookmark: Bookmark; onClose: () => void }>) {
  const [note, setNote] = useState(bookmark.note);
  const update = useUpdateBookmark(documentId);
  return (
    <Dialog
      open
      onOpenChange={() => onClose()}
      title="Note"
      description={bookmark.text}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={update.isPending}
            onClick={() => update.mutate({ id: bookmark.id, note }, { onSuccess: onClose })}
          >
            Save note
          </Button>
        </>
      }
    >
      <Field label="Your note" hint="Saved with the document on this computer.">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>
      {update.isError ? (
        <Banner tone="error" className="mt-4">
          {describeError(update.error)}
        </Banner>
      ) : null}
    </Dialog>
  );
}

export function BookmarkList({ documentId, title, sections, onJump }: Readonly<BookmarkListProps>) {
  const bookmarks = useBookmarks(documentId);
  const remove = useDeleteBookmark(documentId);
  const [editing, setEditing] = useState<Bookmark | undefined>();
  if (bookmarks.isPending) return <Skeleton className="h-24" />;
  if (bookmarks.isError) return <Banner tone="error">{describeError(bookmarks.error)}</Banner>;
  const list = bookmarks.data;
  if (list.length === 0) {
    return (
      <p className="px-2.5 py-2 text-[13px] leading-snug text-muted">
        No bookmarks yet. Press <kbd className="font-sans font-semibold">B</kbd> or the bookmark
        button in the player to mark the sentence being read.
      </p>
    );
  }
  const sectionTitle = (index: number) => sections.find((s) => s.index === index)?.title;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs text-muted">
          {list.length} bookmark{list.length === 1 ? '' : 's'}
        </p>
        <Button
          size="sm"
          variant="ghost"
          icon={<FileDown size={14} />}
          onClick={() => downloadText(notesFilename(title), notesMarkdown(title, sections, list))}
        >
          Export notes
        </Button>
      </div>
      <ol className="flex flex-col gap-1">
        {list.map((bookmark) => (
          <li key={bookmark.id} className="group rounded-[var(--radius-md)] hover:bg-surface-2">
            <button
              type="button"
              onClick={() => onJump(bookmark)}
              className="w-full px-2.5 pt-2 text-left text-[13px] leading-snug"
            >
              <span className="block text-xs text-subtle">
                {sectionTitle(bookmark.sectionIndex)}
              </span>
              <span className="line-clamp-3">{bookmark.text}</span>
            </button>
            {bookmark.note ? (
              <p className="px-2.5 pt-1 text-[13px] leading-snug whitespace-pre-line text-accent-text">
                {bookmark.note}
              </p>
            ) : null}
            <div className="flex justify-end gap-0.5 px-1 pb-1">
              <IconButton
                size="sm"
                label={bookmark.note ? 'Edit note' : 'Add a note'}
                icon={<NotebookPen size={15} />}
                onClick={() => setEditing(bookmark)}
              />
              <IconButton
                size="sm"
                label="Remove bookmark"
                icon={<BookmarkX size={15} />}
                disabled={remove.isPending}
                onClick={() => remove.mutate(bookmark.id)}
              />
            </div>
          </li>
        ))}
      </ol>
      {remove.isError ? <Banner tone="error">{describeError(remove.error)}</Banner> : null}
      {editing ? (
        <NoteDialog
          key={editing.id}
          documentId={documentId}
          bookmark={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  );
}
