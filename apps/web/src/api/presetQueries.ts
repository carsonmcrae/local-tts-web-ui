// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks for a bundled book's reading preset.
 * Scope: What the preset offers a document (a document that is not one of the included books, or a
 *   book without a preset, answers null rather than an error), applying the components the reader
 *   chose and taking them out again. Applying or removing changes the document's characters,
 *   sentence styling and sound effects, so those caches are refreshed too.
 * Does NOT belong: Presentation (features/reader/ReadingExperience.tsx) or the catalog (catalogQueries).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './client';
import type { PresetComponent, ReadingPreset } from './types';

const presetKey = (documentId: string) => ['documents', documentId, 'reading-preset'] as const;
const touched = (documentId: string) => [
  ['documents', documentId, 'styles'],
  ['documents', documentId, 'characters'],
  ['documents', documentId, 'sound-effects'],
];

export function useReadingPreset(documentId: string, enabled: boolean) {
  return useQuery({
    queryKey: presetKey(documentId),
    enabled,
    queryFn: async (): Promise<ReadingPreset | null> => {
      try {
        return await api<ReadingPreset>(`/api/documents/${documentId}/preset`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

export function useApplyReadingPreset(documentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (components: PresetComponent[]) =>
      api<ReadingPreset>(`/api/documents/${documentId}/preset/apply`, {
        method: 'POST',
        json: { components },
      }),
    onSuccess: (report) => {
      client.setQueryData(presetKey(documentId), report);
      for (const queryKey of touched(documentId)) void client.invalidateQueries({ queryKey });
    },
  });
}

export function useRemoveReadingPreset(documentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/api/documents/${documentId}/preset`, { method: 'DELETE' }),
    onSuccess: () => {
      for (const queryKey of [presetKey(documentId), ...touched(documentId)])
        void client.invalidateQueries({ queryKey });
    },
  });
}
