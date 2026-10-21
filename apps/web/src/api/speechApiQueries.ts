// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks for the optional local speech API's settings and activity.
 * Scope: Reading the status (refreshed every few seconds while the API is on), the light "in use"
 *   reading the app shell polls, saving the switches and allowed custom voices, and creating or
 *   revoking the token. A new token is handed to the caller once and is not kept in any cache.
 * Does NOT belong: Presentation (features/settings/SpeechApiSection) or calling /v1 itself — the app
 *   never does; only other programs on this computer do.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  SpeechApiActivity,
  SpeechApiSettingsInput,
  SpeechApiStatus,
  SpeechApiToken,
} from './types';

export const speechApiKeys = {
  all: ['speech-api'] as const,
  activity: ['speech-api', 'activity'] as const,
};

const POLL_MS = 5000;

/** Poll only while the API is on: when it is off nothing can use it. */
const pollWhenOn = (query: { state: { data?: { enabled: boolean } | undefined } }) =>
  query.state.data?.enabled ? POLL_MS : false;

export function useSpeechApi() {
  return useQuery({
    queryKey: speechApiKeys.all,
    queryFn: () => api<SpeechApiStatus>('/api/speech-api'),
    refetchInterval: pollWhenOn,
  });
}

/** Whether another program is using the API right now (for the app shell's indicator). */
export function useSpeechApiActivity() {
  return useQuery({
    queryKey: speechApiKeys.activity,
    queryFn: () => api<SpeechApiActivity>('/api/speech-api/activity'),
    refetchInterval: pollWhenOn,
  });
}

/** Every change refreshes the status and the shell's activity reading. */
function useSpeechApiMutation<Input, Output>(run: (input: Input) => Promise<Output>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    gcTime: 0, // a new token must not linger in the mutation cache
    onSuccess: () => client.invalidateQueries({ queryKey: speechApiKeys.all }),
  });
}

export function useSaveSpeechApi() {
  return useSpeechApiMutation((input: SpeechApiSettingsInput) =>
    api<SpeechApiStatus>('/api/speech-api', { method: 'PUT', json: input }),
  );
}

export function useCreateSpeechToken() {
  return useSpeechApiMutation(() =>
    api<SpeechApiToken>('/api/speech-api/token', { method: 'POST' }),
  );
}

export function useRevokeSpeechToken() {
  return useSpeechApiMutation(() => api<void>('/api/speech-api/token', { method: 'DELETE' }));
}
