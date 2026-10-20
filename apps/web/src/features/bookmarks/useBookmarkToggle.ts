// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Bookmark or un-bookmark the sentence being read, from the player or a shortcut.
 * Scope: Whether the sentence already has a bookmark, and a toggle that adds one (with a short
 *   confirmation) or removes it.
 * Does NOT belong: Listing or editing bookmarks (BookmarkList).
 */
import { useAddBookmark, useBookmarks, useDeleteBookmark } from '@/api/readingQueries';
import { describeError } from '@/api/client';
import { useToast } from '@/components/ui/Toast';

/** `documentId` is null while nothing is loaded; the toggle is then never offered. */
export function useBookmarkToggle(documentId: string | null, segmentIndex: number) {
  const bookmarks = useBookmarks(documentId);
  const add = useAddBookmark(documentId ?? '');
  const remove = useDeleteBookmark(documentId ?? '');
  const toast = useToast();
  const existing = bookmarks.data?.find((bookmark) => bookmark.segmentIndex === segmentIndex);
  const fail = (error: unknown) =>
    toast.notify('error', 'Bookmark not saved', describeError(error));
  const toggle = () => {
    if (existing) {
      remove.mutate(existing.id, {
        onSuccess: () => toast.notify('success', 'Bookmark removed'),
        onError: fail,
      });
    } else {
      add.mutate(
        { segmentIndex },
        { onSuccess: () => toast.notify('success', 'Bookmarked this sentence'), onError: fail },
      );
    }
  };
  return { bookmarked: Boolean(existing), toggle, busy: add.isPending || remove.isPending };
}
