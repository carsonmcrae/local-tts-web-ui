// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks for the reading aids: bookmarks, document search and pronunciations.
 * Scope: Query keys, fetching and the mutations that keep these lists in sync with the server.
 * Does NOT belong: Documents, voices, jobs and settings (queries.ts) or presentation.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Bookmark, Pronunciation, PronunciationInput, SearchResults } from './types';

const readingKeys = {
  bookmarks: (documentId: string) => ['documents', documentId, 'bookmarks'] as const,
  search: (documentId: string, query: string) =>
    ['documents', documentId, 'search', query] as const,
  pronunciations: ['pronunciations'] as const,
};

// -- bookmarks -------------------------------------------------------------------

export function useBookmarks(documentId: string | null) {
  return useQuery({
    queryKey: readingKeys.bookmarks(documentId ?? ''),
    queryFn: () => api<Bookmark[]>(`/api/documents/${documentId}/bookmarks`),
    enabled: Boolean(documentId),
  });
}

function useBookmarkMutation<Input>(documentId: string, run: (input: Input) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => client.invalidateQueries({ queryKey: readingKeys.bookmarks(documentId) }),
  });
}

/** Bookmark a sentence; bookmarking it again replaces its note. */
export function useAddBookmark(documentId: string) {
  return useBookmarkMutation(documentId, (input: { segmentIndex: number; note?: string }) =>
    api<Bookmark>(`/api/documents/${documentId}/bookmarks`, { method: 'POST', json: input }),
  );
}

export function useUpdateBookmark(documentId: string) {
  return useBookmarkMutation(documentId, (input: { id: string; note: string }) =>
    api<Bookmark>(`/api/documents/${documentId}/bookmarks/${input.id}`, {
      method: 'PATCH',
      json: { note: input.note },
    }),
  );
}

export function useDeleteBookmark(documentId: string) {
  return useBookmarkMutation(documentId, (id: string) =>
    api<void>(`/api/documents/${documentId}/bookmarks/${id}`, { method: 'DELETE' }),
  );
}

// -- search ----------------------------------------------------------------------

/** Sentences containing `query`; idle until there is something to search for. */
export function useDocumentSearch(documentId: string, query: string) {
  const wanted = query.trim();
  return useQuery({
    queryKey: readingKeys.search(documentId, wanted),
    queryFn: () =>
      api<SearchResults>(`/api/documents/${documentId}/search`, { query: { q: wanted } }),
    enabled: wanted.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

// -- pronunciations ----------------------------------------------------------------

export function usePronunciations() {
  return useQuery({
    queryKey: readingKeys.pronunciations,
    queryFn: () => api<Pronunciation[]>('/api/pronunciations'),
  });
}

function usePronunciationMutation<Input>(run: (input: Input) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => client.invalidateQueries({ queryKey: readingKeys.pronunciations }),
  });
}

export function useSavePronunciation() {
  return usePronunciationMutation((input: PronunciationInput & { id?: string }) => {
    const { id, ...rule } = input;
    return id
      ? api<Pronunciation>(`/api/pronunciations/${id}`, { method: 'PUT', json: rule })
      : api<Pronunciation>('/api/pronunciations', { method: 'POST', json: rule });
  });
}

export function useDeletePronunciation() {
  return usePronunciationMutation((id: string) =>
    api<void>(`/api/pronunciations/${id}`, { method: 'DELETE' }),
  );
}
