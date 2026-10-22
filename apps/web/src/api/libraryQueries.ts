// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks for organising the library: folders, collections, tags and shelves.
 * Scope: Reading the folder tree, the collections and the tags in use; creating, renaming, moving and
 *   deleting folders and collections; setting a collection's members; changing one document's shelf
 *   (folder, favourite, type, genres, tags) and organising several at once. Every change replaces
 *   the affected summaries in the cached library list and refreshes the counts the rail shows.
 * Does NOT belong: Documents themselves (queries.ts) or presentation (features/library).
 */
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './queries';
import type {
  Collection,
  CollectionInput,
  DocumentSummary,
  Folder,
  FolderInput,
  OrganizeRequest,
  ShelfUpdate,
  TagCount,
} from './types';

const libraryKeys = {
  folders: ['library', 'folders'] as const,
  collections: ['library', 'collections'] as const,
  tags: ['library', 'tags'] as const,
};

export function useFolders() {
  return useQuery({
    queryKey: libraryKeys.folders,
    queryFn: () => api<Folder[]>('/api/library/folders'),
  });
}

export function useCollections() {
  return useQuery({
    queryKey: libraryKeys.collections,
    queryFn: () => api<Collection[]>('/api/library/collections'),
  });
}

export function useTags() {
  return useQuery({
    queryKey: libraryKeys.tags,
    queryFn: () => api<TagCount[]>('/api/library/tags'),
  });
}

/** Put changed summaries into the cached list, and refresh what counts them (rail, tags, details). */
function absorb(client: QueryClient, changed: readonly DocumentSummary[]) {
  const byId = new Map(changed.map((doc) => [doc.id, doc]));
  const list = client.getQueryData<DocumentSummary[]>(keys.documents);
  // Only a list that was fetched is patched: writing into an empty slot would leave a query with
  // no way to refetch itself.
  if (list)
    client.setQueryData(
      keys.documents,
      list.map((doc) => byId.get(doc.id) ?? doc),
    );
  for (const doc of changed)
    void client.invalidateQueries({ queryKey: keys.document(doc.id), exact: true });
  void client.invalidateQueries({ queryKey: libraryKeys.folders });
  void client.invalidateQueries({ queryKey: libraryKeys.collections });
  void client.invalidateQueries({ queryKey: libraryKeys.tags });
}

/** A folder or collection change: the rail's lists (and the library's facets) are read again. */
function useRailMutation<Input, Result>(run: (input: Input) => Promise<Result>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: libraryKeys.folders });
      void client.invalidateQueries({ queryKey: libraryKeys.collections });
      void client.invalidateQueries({ queryKey: keys.documents, exact: true });
    },
  });
}

export function useCreateFolder() {
  return useRailMutation((input: FolderInput) =>
    api<Folder>('/api/library/folders', { method: 'POST', json: input }),
  );
}

/** Rename a folder and/or move it: `parentId: null` puts it at the top level. */
export function useUpdateFolder() {
  return useRailMutation(
    ({ id, ...changes }: { id: string; name?: string; parentId?: string | null }) =>
      api<Folder>(`/api/library/folders/${id}`, { method: 'PATCH', json: changes }),
  );
}

export function useDeleteFolder() {
  return useRailMutation((id: string) =>
    api<void>(`/api/library/folders/${id}`, { method: 'DELETE' }),
  );
}

export function useCreateCollection() {
  return useRailMutation((input: CollectionInput) =>
    api<Collection>('/api/library/collections', { method: 'POST', json: input }),
  );
}

export function useUpdateCollection() {
  return useRailMutation(
    ({ id, ...changes }: { id: string; name?: string; description?: string }) =>
      api<Collection>(`/api/library/collections/${id}`, { method: 'PATCH', json: changes }),
  );
}

export function useDeleteCollection() {
  return useRailMutation((id: string) =>
    api<void>(`/api/library/collections/${id}`, { method: 'DELETE' }),
  );
}

export function useUpdateShelf() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, ...change }: ShelfUpdate & { documentId: string }) =>
      api<DocumentSummary>(`/api/documents/${documentId}/shelf`, { method: 'PUT', json: change }),
    onSuccess: (doc) => absorb(client, [doc]),
  });
}

/** Move, favourite, classify or tag several documents, or add them to or remove them from collections. */
export function useOrganize() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: OrganizeRequest) =>
      api<DocumentSummary[]>('/api/library/organize', { method: 'POST', json: request }),
    onSuccess: (changed) => absorb(client, changed),
  });
}
