// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks for a document's automatic cleanup.
 * Scope: The cleanup report (running headers, footers, page numbers, footnotes and footnote and
 *   citation markers found at import, and sentences skipped by hand, each with whether it applies
 *   now), and undoing or applying the cleanup again, which also refreshes the document's styling,
 *   where skipped sentences show, and its spoken word count and listening estimate.
 * Does NOT belong: Skipping one sentence by hand (stylingQueries) or presentation (CleanupNote).
 */
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './queries';
import type { components } from './schema.gen';

export type CleanupReport = components['schemas']['CleanupOut'];
export type CleanupItem = components['schemas']['CleanupItem'];
export type CleanupReason = CleanupItem['reason'];

export const cleanupKey = (documentId: string) => ['documents', documentId, 'cleanup'] as const;

/** What is read aloud changed: the document and the library count its words and listening time again. */
export function refreshSpokenCounts(client: QueryClient, documentId: string) {
  void client.invalidateQueries({ queryKey: keys.document(documentId), exact: true });
  void client.invalidateQueries({ queryKey: keys.documents, exact: true });
}

export function useCleanup(documentId: string) {
  return useQuery({
    queryKey: cleanupKey(documentId),
    queryFn: () => api<CleanupReport>(`/api/documents/${documentId}/cleanup`),
  });
}

/** Undo the cleanup (read everything it skipped) or apply it again. */
export function useCleanupAction(documentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: 'undo' | 'apply') =>
      api<CleanupReport>(`/api/documents/${documentId}/cleanup/${action}`, { method: 'POST' }),
    onSuccess: (report) => {
      client.setQueryData(cleanupKey(documentId), report);
      // The styling marks which sentences are skipped (stylingQueries' key).
      void client.invalidateQueries({ queryKey: ['documents', documentId, 'styles'] });
      refreshSpokenCounts(client, documentId);
    },
  });
}
