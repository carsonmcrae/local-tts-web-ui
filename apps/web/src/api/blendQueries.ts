// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Server state for voice blends (voices mixed from built-in Kokoro voices).
 * Scope: Listing, creating and deleting blends; each change refreshes the voice list, where a blend
 *   appears as a custom voice.
 * Does NOT belong: The blend dialog (features/voices/BlendVoices) or other voices.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './queries';
import type { components } from './schema.gen';

export type VoiceBlend = components['schemas']['BlendOut'];
export type VoiceBlendInput = components['schemas']['BlendIn'];

const BLENDS = ['voice-blends'] as const;

export function useBlends() {
  return useQuery({
    queryKey: BLENDS,
    queryFn: () => api<VoiceBlend[]>('/api/voice-profiles/blends'),
  });
}

function useBlendMutation<Input, Result>(run: (input: Input) => Promise<Result>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: BLENDS });
      void client.invalidateQueries({ queryKey: keys.voices });
    },
  });
}

export function useCreateBlend() {
  return useBlendMutation((input: VoiceBlendInput) =>
    api<VoiceBlend>('/api/voice-profiles/blends', { method: 'POST', json: input }),
  );
}

export function useDeleteBlend() {
  return useBlendMutation((id: string) =>
    api<null>(`/api/voice-profiles/blends/${id}`, { method: 'DELETE' }),
  );
}
