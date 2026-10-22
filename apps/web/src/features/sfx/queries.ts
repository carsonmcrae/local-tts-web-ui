// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks for the sound-effects API: the library and a document's arrangement.
 * Scope: Query keys, fetching the bundled library (once) and a document's effects, and the
 *   mutations that add, change, remove, review and analyse. Review and analysis answer with the
 *   whole arrangement, which replaces the cached one at once; other changes refetch it.
 * Does NOT belong: Playing effects (session.ts) or presentation (SoundPanel).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type {
  SfxAnalysis,
  SfxAnalysisRequest,
  SfxDocument,
  SfxEffect,
  SfxEffectChange,
  SfxEffectInput,
  SfxLibrary,
} from '@/api/types';

const sfxKeys = {
  library: ['sound-effects', 'library'] as const,
  effects: (documentId: string) => ['documents', documentId, 'sound-effects'] as const,
};

/** The bundled library, fetched once; `enabled` false leaves it alone until it is needed. */
export function useSoundLibrary(enabled = true) {
  return useQuery({
    queryKey: sfxKeys.library,
    queryFn: () => api<SfxLibrary>('/api/sound-effects/library'),
    staleTime: Infinity,
    enabled,
  });
}

export function useSoundEffects(documentId: string | null) {
  return useQuery({
    queryKey: sfxKeys.effects(documentId ?? ''),
    queryFn: () => api<SfxDocument>(`/api/documents/${documentId}/sound-effects`),
    enabled: Boolean(documentId),
  });
}

function useArrangementMutation<Input, Output>(
  documentId: string,
  run: (input: Input) => Promise<Output>,
  replaces: boolean,
) {
  const client = useQueryClient();
  const key = sfxKeys.effects(documentId);
  return useMutation({
    mutationFn: run,
    onSuccess: (data) => {
      if (replaces) {
        const { effects, analyses } = data as unknown as SfxDocument;
        client.setQueryData<SfxDocument>(key, { effects, analyses });
      } else void client.invalidateQueries({ queryKey: key });
    },
  });
}

export function useAddSoundEffect(documentId: string) {
  return useArrangementMutation(
    documentId,
    (input: SfxEffectInput) =>
      api<SfxEffect>(`/api/documents/${documentId}/sound-effects`, { method: 'POST', json: input }),
    false,
  );
}

export function useUpdateSoundEffect(documentId: string) {
  return useArrangementMutation(
    documentId,
    (input: { id: string } & SfxEffectChange) => {
      const { id, ...change } = input;
      return api<SfxEffect>(`/api/documents/${documentId}/sound-effects/${id}`, {
        method: 'PATCH',
        json: change,
      });
    },
    false,
  );
}

/** Removes an effect; a suggestion is kept as dismissed, so it is never suggested again. */
export function useRemoveSoundEffect(documentId: string) {
  return useArrangementMutation(
    documentId,
    (id: string) =>
      api<void>(`/api/documents/${documentId}/sound-effects/${id}`, { method: 'DELETE' }),
    false,
  );
}

export function useReviewSoundEffects(documentId: string) {
  return useArrangementMutation(
    documentId,
    (input: { accept?: string[]; dismiss?: string[] }) =>
      api<SfxDocument>(`/api/documents/${documentId}/sound-effects/review`, {
        method: 'POST',
        json: { accept: input.accept ?? [], dismiss: input.dismiss ?? [] },
      }),
    true,
  );
}

export function useAnalyseSection(documentId: string) {
  return useArrangementMutation(
    documentId,
    (input: SfxAnalysisRequest) =>
      api<SfxAnalysis>(`/api/documents/${documentId}/sound-effects/analyse`, {
        method: 'POST',
        json: input,
      }),
    true,
  );
}
