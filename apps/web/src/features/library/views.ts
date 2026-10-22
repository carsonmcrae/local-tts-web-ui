// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The library's views: which documents a rail choice shows, and how it reads in the address.
 * Scope: All documents, Continue reading (started, not finished), Favourites, Recently added (the
 *   last two weeks), one folder or one collection; parsing a view from the page's search
 *   parameters and writing it back; the title and empty-state copy of each view.
 * Does NOT belong: Searching, filtering and sorting within a view (LibraryFilters.tsx) or rendering.
 */
import type { Collection, DocumentSummary, Folder, ReadingProgress } from '@/api/types';

export type LibraryView =
  | { kind: 'all' }
  | { kind: 'continue' }
  | { kind: 'favorites' }
  | { kind: 'recent' }
  | { kind: 'folder'; id: string }
  | { kind: 'collection'; id: string };

export const ALL: LibraryView = { kind: 'all' };
/** The drag data type a document card carries, so a folder in the rail can take the drop. */
export const DOCUMENT_DRAG_TYPE = 'application/x-ttsnative-document';
const RECENT_DAYS = 14;
const FINISHED_PERCENT = 99.5;
const ID = /^[0-9a-f]{32}$/;

type Resumable = DocumentSummary & { progress: ReadingProgress };

/** A document that was started but not finished (the "continue listening" candidate). */
export function isResumable(doc: DocumentSummary): doc is Resumable {
  return Boolean(doc.progress && doc.progress.percent < FINISHED_PERCENT);
}

export function isFinished(doc: DocumentSummary): boolean {
  return Boolean(doc.progress && doc.progress.percent >= FINISHED_PERCENT);
}

export function parseView(params: URLSearchParams): LibraryView {
  const folder = params.get('folder');
  if (folder && ID.test(folder)) return { kind: 'folder', id: folder };
  const collection = params.get('collection');
  if (collection && ID.test(collection)) return { kind: 'collection', id: collection };
  const view = params.get('view');
  if (view === 'continue' || view === 'favorites' || view === 'recent') return { kind: view };
  return ALL;
}

/** The search string for a view (empty for All documents). */
export function viewSearch(view: LibraryView): string {
  if (view.kind === 'all') return '';
  if (view.kind === 'folder') return `?folder=${view.id}`;
  if (view.kind === 'collection') return `?collection=${view.id}`;
  return `?view=${view.kind}`;
}

export function sameView(a: LibraryView, b: LibraryView): boolean {
  return viewSearch(a) === viewSearch(b);
}

/** The documents a view shows, in the view's own order where it has one. */
export function selectDocuments(
  documents: readonly DocumentSummary[],
  view: LibraryView,
  now = Date.now(),
): DocumentSummary[] {
  switch (view.kind) {
    case 'continue':
      return documents
        .filter(isResumable)
        .sort((a, b) => b.progress.updatedAt.localeCompare(a.progress.updatedAt));
    case 'favorites':
      return documents.filter((doc) => doc.shelf.favorite);
    case 'recent': {
      const since = now - RECENT_DAYS * 86_400_000;
      return documents
        .filter((doc) => new Date(doc.createdAt).getTime() >= since)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    case 'folder':
      return documents.filter((doc) => doc.shelf.folderId === view.id);
    case 'collection':
      return documents.filter((doc) => doc.shelf.collectionIds.includes(view.id));
    default:
      return [...documents];
  }
}

const TITLES = {
  all: 'All documents',
  continue: 'Continue reading',
  favorites: 'Favourites',
  recent: 'Recently added',
} as const;

export function viewTitle(
  view: LibraryView,
  folders: readonly Folder[],
  collections: readonly Collection[],
): string {
  if (view.kind === 'folder') return folders.find((f) => f.id === view.id)?.name ?? 'Folder';
  if (view.kind === 'collection')
    return collections.find((c) => c.id === view.id)?.name ?? 'Collection';
  return TITLES[view.kind];
}

/** What an empty view says, and what to do about it. */
export function emptyCopy(view: LibraryView): { title: string; hint: string } {
  switch (view.kind) {
    case 'continue':
      return {
        title: 'Nothing in progress',
        hint: 'Documents you have started, but not finished, gather here.',
      };
    case 'favorites':
      return {
        title: 'No favourites yet',
        hint: 'Mark a document with the star and it will be here.',
      };
    case 'recent':
      return {
        title: 'Nothing added in the last two weeks',
        hint: 'New documents stay here for two weeks after you add them.',
      };
    case 'folder':
      return {
        title: 'This folder is empty',
        hint: 'Move documents here from their menu, or drag them onto the folder.',
      };
    case 'collection':
      return {
        title: 'This collection is empty',
        hint: 'Add documents from their menu. A document can be in any number of collections.',
      };
    default:
      return { title: 'No documents yet', hint: '' };
  }
}
