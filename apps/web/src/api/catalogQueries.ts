// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks for the books that ship with the app (Explore).
 * Scope: Listing the bundled works with where each stands in this library, opening one (which adds
 *   it to the library through the ordinary document pipeline, or returns the document it already
 *   became), hiding a work from Explore or showing it again, and the credits text.
 * Does NOT belong: Documents themselves (queries.ts) or presentation (features/explore).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './queries';
import type { BundledWork, DocumentDetail } from './types';

const worksKey = ['library', 'works'] as const;
const creditsKey = ['library', 'credits'] as const;

export function useBundledWorks() {
  return useQuery({ queryKey: worksKey, queryFn: () => api<BundledWork[]>('/api/library/works') });
}

/** The credits text (Markdown as plain text), read when the dialog opens. */
export function useCatalogCredits(enabled: boolean) {
  return useQuery({
    queryKey: creditsKey,
    queryFn: async () => {
      const response = await fetch('/api/library/works/credits', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('The credits could not be loaded.');
      return response.text();
    },
    enabled,
    staleTime: Infinity,
  });
}

export function useOpenWork() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (workId: string) =>
      api<DocumentDetail>(`/api/library/works/${workId}/open`, { method: 'POST' }),
    onSuccess: (doc) => {
      client.setQueryData(keys.document(doc.id), doc);
      void client.invalidateQueries({ queryKey: keys.documents, exact: true });
      void client.invalidateQueries({ queryKey: worksKey });
    },
  });
}

export function useHideWork() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ workId, hidden }: { workId: string; hidden: boolean }) =>
      api<BundledWork>(`/api/library/works/${workId}/hidden`, { method: 'PUT', json: { hidden } }),
    onSuccess: (work) =>
      client.setQueryData<BundledWork[]>(worksKey, (list) =>
        list?.map((item) => (item.workId === work.workId ? work : item)),
      ),
  });
}

export function workCoverUrl(workId: string): string {
  return `/api/library/works/${workId}/cover`;
}
