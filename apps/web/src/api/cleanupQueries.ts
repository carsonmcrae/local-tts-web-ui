// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks for a document's automatic cleanup.
 * Scope: The cleanup report (running headers, footers, page numbers and footnote markers found at
 *   import, and sentences skipped by hand, each with whether it applies now), and undoing or applying
 *   the cleanup again, which also refreshes the document's styling, where skipped sentences show.
 * Does NOT belong: Skipping one sentence by hand (stylingQueries) or presentation (CleanupNote).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { components } from './schema.gen';

export type CleanupReport = components['schemas']['CleanupOut'];
export type CleanupItem = components['schemas']['CleanupItem'];
export type CleanupReason = CleanupItem['reason'];

export const cleanupKey = (documentId: string) => ['documents', documentId, 'cleanup'] as const;

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
    },
  });
}
