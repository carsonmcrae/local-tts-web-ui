// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks for styling a document's sentences.
 * Scope: Reading a document's styling (character voices, effects, sounds, the dialogue voice and its
 *   revision), changing chosen sentences, and choosing the dialogue voice; each answer replaces the
 *   cached styling.
 * Does NOT belong: Playback (the player refetches audio itself) or presentation.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { DocumentStyles, SentenceStyleChange } from './types';

const stylesKey = (documentId: string) => ['documents', documentId, 'styles'] as const;

export function useDocumentStyles(documentId: string) {
  return useQuery({
    queryKey: stylesKey(documentId),
    queryFn: () => api<DocumentStyles>(`/api/documents/${documentId}/styles`),
  });
}

export function useStyleSentences(documentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: SentenceStyleChange) =>
      api<DocumentStyles>(`/api/documents/${documentId}/styles`, { method: 'PUT', json: change }),
    onSuccess: (styles) => client.setQueryData(stylesKey(documentId), styles),
  });
}

export function useDialogueVoice(documentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (dialogueVoiceId: string | null) =>
      api<DocumentStyles>(`/api/documents/${documentId}/cast`, {
        method: 'PUT',
        json: { dialogueVoiceId },
      }),
    onSuccess: (styles) => client.setQueryData(stylesKey(documentId), styles),
  });
}
