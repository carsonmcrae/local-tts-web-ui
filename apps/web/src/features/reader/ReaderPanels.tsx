// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The reader's side panel: the table of contents and the document's bookmarks.
 * Scope: Two tabs (Contents only when the document has more than one section), shown in the
 *   desktop sidebar and in the Contents dialog on smaller screens.
 * Does NOT belong: The contents list (SectionNav) or bookmark handling (BookmarkList).
 */
import { Tabs } from 'radix-ui';
import type { ReactNode } from 'react';
import type { Bookmark, DocumentDetail } from '@/api/types';
import { cn } from '@/lib/cn';
import { BookmarkList } from '@/features/bookmarks/BookmarkList';

const TAB =
  'flex-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text ' +
  'data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-soft';

interface ReaderPanelsProps {
  doc: DocumentDetail;
  contents: ReactNode;
  onBookmark: (bookmark: Bookmark) => void;
  className?: string;
}

export function ReaderPanels({
  doc,
  contents,
  onBookmark,
  className,
}: Readonly<ReaderPanelsProps>) {
  const multiSection = doc.sections.length > 1;
  return (
    <Tabs.Root
      defaultValue={multiSection ? 'contents' : 'bookmarks'}
      className={cn('flex flex-col gap-3', className)}
    >
      <Tabs.List
        aria-label="Contents and bookmarks"
        className="flex gap-1 rounded-[var(--radius-md)] bg-surface-2 p-1"
      >
        {multiSection ? (
          <Tabs.Trigger value="contents" className={TAB}>
            Contents
          </Tabs.Trigger>
        ) : null}
        <Tabs.Trigger value="bookmarks" className={TAB}>
          Bookmarks
        </Tabs.Trigger>
      </Tabs.List>
      {multiSection ? <Tabs.Content value="contents">{contents}</Tabs.Content> : null}
      <Tabs.Content value="bookmarks">
        <BookmarkList
          documentId={doc.id}
          title={doc.title}
          sections={doc.sections}
          onJump={onBookmark}
        />
      </Tabs.Content>
    </Tabs.Root>
  );
}
