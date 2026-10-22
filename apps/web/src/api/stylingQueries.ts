// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks for how a document's sentences are read.
 * Scope: Reading a document's styling (voices, effects, sounds, styles, takes, pauses, the dialogue
 *   voice and its revision) and changing it; choosing the dialogue voice and whether quoted speech in
 *   narration is voiced apart; the characters dialogue tags name and their voices; saved casts;
 *   and candidate takes of one sentence. Each answer replaces the cached data (a skip changes the
 *   cleanup report, and the document's spoken word count and listening estimate, too).
 * Does NOT belong: Playback (the player refetches audio itself) or presentation.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cleanupKey, refreshSpokenCounts } from './cleanupQueries';
import { api } from './client';
import type {
  CastPreset,
  Character,
  CharacterAssignment,
  DocumentStyles,
  SentenceStyleChange,
  SentenceTake,
} from './types';

const stylesKey = (documentId: string) => ['documents', documentId, 'styles'] as const;
const charactersKey = (documentId: string) => ['documents', documentId, 'characters'] as const;
const presetsKey = ['cast-presets'] as const;

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
    onSuccess: (styles, change) => {
      client.setQueryData(stylesKey(documentId), styles);
      if (!('skip' in change)) return;
      void client.invalidateQueries({ queryKey: cleanupKey(documentId) });
      refreshSpokenCounts(client, documentId);
    },
  });
}

export function useCast(documentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (cast: { dialogueVoiceId?: string | null; splitDialogue?: boolean }) =>
      api<DocumentStyles>(`/api/documents/${documentId}/cast`, { method: 'PUT', json: cast }),
    onSuccess: (styles) => client.setQueryData(stylesKey(documentId), styles),
  });
}

export function useCharacters(documentId: string, enabled = true) {
  return useQuery({
    queryKey: charactersKey(documentId),
    queryFn: () => api<Character[]>(`/api/documents/${documentId}/characters`),
    enabled,
  });
}

export function useAssignCharacter(documentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (assignment: CharacterAssignment) =>
      api<Character[]>(`/api/documents/${documentId}/characters`, {
        method: 'PUT',
        json: assignment,
      }),
    onSuccess: (characters) => client.setQueryData(charactersKey(documentId), characters),
  });
}

export function useCastPresets(enabled = true) {
  return useQuery({
    queryKey: presetsKey,
    queryFn: () => api<CastPreset[]>('/api/cast-presets'),
    enabled,
  });
}

export function useSavePreset(documentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<CastPreset>(`/api/documents/${documentId}/cast-presets`, {
        method: 'POST',
        json: { name },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: presetsKey }),
  });
}

export function useApplyPreset(documentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (presetId: string) =>
      api<Character[]>(`/api/documents/${documentId}/cast-presets/${presetId}/apply`, {
        method: 'POST',
      }),
    onSuccess: (characters) => client.setQueryData(charactersKey(documentId), characters),
  });
}

export function useDeletePreset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (presetId: string) =>
      api<void>(`/api/cast-presets/${presetId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: presetsKey }),
  });
}

export function useMakeTake(documentId: string, index: number) {
  return useMutation({
    mutationFn: (input: { voiceId: string; take?: number }) =>
      api<SentenceTake>(`/api/documents/${documentId}/segments/${index}/takes`, {
        method: 'POST',
        json: input,
      }),
  });
}
