// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: React Query hooks for what a finished custom voice can do beyond reading.
 * Scope: Building a studio voice's speaking styles from its kept takes (a background job),
 *   fine-tuning it on them (a background job) and keeping, discarding or removing the result, the
 *   consent statement, the address that downloads a voice as a .ttsvoice package, and importing a
 *   package someone shared (refreshing the voice lists).
 * Does NOT belong: Creating voices or sessions (queries.ts) or the HTTP client (client.ts).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, buildUrl } from './client';
import { keys } from './queries';
import type { components } from './schema.gen';
import type { JobOut, VoiceProfile } from './types';

export function useBuildStyles() {
  return useMutation({
    mutationFn: (profileId: string) =>
      api<JobOut>(`/api/voice-profiles/${profileId}/styles`, { method: 'POST' }),
  });
}

/** Go back to the expression a voice had before its last rebuild (again: forward to the newer one). */
export function useRestoreStyles() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) =>
      api<VoiceProfile>(`/api/voice-profiles/${profileId}/styles/restore`, { method: 'POST' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.profiles });
      void client.invalidateQueries({ queryKey: keys.voices });
    },
  });
}

export function useStartTuning() {
  return useMutation({
    mutationFn: (profileId: string) =>
      api<JobOut>(`/api/voice-profiles/${profileId}/tuning`, { method: 'POST' }),
  });
}

export type TuningArm = 'current' | 'tuned';

export function tuningSampleUrl(profileId: string, arm: TuningArm, index: number): string {
  return `/api/voice-profiles/${profileId}/tuning/samples/${arm}/${index}`;
}

/** Where each decision about a fine-tune is sent, under the voice's own address. */
const TUNING_DECISIONS = {
  keep: { path: 'tuning/keep', method: 'POST' },
  discard: { path: 'tuning', method: 'DELETE' },
  remove: { path: 'adapter', method: 'DELETE' },
} as const;

/** Keep the waiting fine-tune, discard it, or stop using a kept one; the voice lists refresh. */
export function useTuningDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: keyof typeof TUNING_DECISIONS }) => {
      const { path, method } = TUNING_DECISIONS[decision];
      return api<VoiceProfile>(`/api/voice-profiles/${id}/${path}`, { method });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.profiles });
      void client.invalidateQueries({ queryKey: keys.voices });
    },
  });
}

export function useConsentStatement() {
  return useQuery({
    queryKey: ['consent'],
    queryFn: () => api<{ statement: string }>('/api/voice-profiles/consent'),
    staleTime: Infinity,
  });
}

/** Downloads the voice as a package; ``confirm`` records that its owner chose to share it. */
export function exportVoiceUrl(profileId: string): string {
  return buildUrl(`/api/voice-profiles/${profileId}/export`, { confirm: true });
}

/** What a voice file holds, checked by the server exactly as an import would be; nothing is saved. */
export function usePreviewVoice() {
  return useMutation({
    mutationFn: (file: Blob) =>
      api<components['schemas']['VoicePreview']>('/api/voice-profiles/import/preview', {
        method: 'POST',
        body: file,
      }),
  });
}

export function useImportVoice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: Blob; name?: string }) =>
      api<VoiceProfile>('/api/voice-profiles/import', {
        method: 'POST',
        query: { consent: true, name: input.name || undefined },
        body: input.file,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.profiles });
      void client.invalidateQueries({ queryKey: keys.voices });
    },
  });
}
